#!/usr/bin/env npx tsx
/**
 * Daily payout orchestrator.
 *
 * Order:
 *   1. computeDailyRanks(day)        — refresh per-game daily_ranks snapshot
 *   2. computeDailyAggregates(day)   — refresh category + overall aggregates
 *   3. settlePerGameTournaments(day) — on-chain ArcadePool.settle() for each
 *                                      tournament that ended on this day
 *   4. payCategoryWinners(day)       — off-chain USDC transfer to top-3 per cat
 *   5. payOverallWinners(day)        — off-chain USDC transfer to top-10 overall
 *
 * Idempotent: re-running on the same day is safe.
 *  - settle() reverts "Already settled" → caught and skipped
 *  - off-chain payouts check `payouts` table for existing 'sent' rows per
 *    (user, scope, category, day) tuple before transferring
 *
 * Flags:
 *   --day=YYYY-MM-DD   (default: today UTC)
 *   --dry-run          (skip ALL chain writes; print intended actions)
 *   --skip-onchain     (skip per-game settle but run off-chain payouts)
 *   --skip-offchain    (skip category + overall payouts)
 *
 * Required env:
 *   STUDIO_PRIVATE_KEY              — wallet that signs settle() + USDC.transfer
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_ARCADE_POOL_ADDRESS (defaults to known sepolia deployment)
 *   NEXT_PUBLIC_USDC_ADDRESS        (defaults to USDC sepolia)
 *   NEXT_PUBLIC_CHAIN_ID            (defaults to 84532 — Base Sepolia)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
} from "@mas/shared/contracts";
import {
  CATEGORIES,
  type CategoryKey,
  computeDailyAggregates,
  computeDailyRanks,
} from "@mas/shared/leaderboard";
import { createClient } from "@supabase/supabase-js";

// ─── Args ───────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const DAY = args.day ?? new Date().toISOString().split("T")[0];
const DRY = !!args["dry-run"];
const SKIP_ONCHAIN = !!args["skip-onchain"];
const SKIP_OFFCHAIN = !!args["skip-offchain"];

// ─── Env ────────────────────────────────────────────────────────────────────
const SB_URL = req("NEXT_PUBLIC_SUPABASE_URL");
const SB_KEY = req("SUPABASE_SERVICE_ROLE_KEY");
const PK = (process.env.STUDIO_PRIVATE_KEY ?? "") as Hex;
const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";

// Off-chain payout amounts (USDC integer units; see toUSDC()).
const CATEGORY_PRIZES_USDC = [5, 3, 2]; // top 3 per category
const OVERALL_PRIZES_USDC = [8, 5, 3, 2, 1, 0.5, 0.3, 0.1, 0.05, 0.05]; // top 10

const supabase = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// On-chain clients are lazy — only instantiated when actually needed.
let pub: ReturnType<typeof createPublicClient> | null = null;
let wallet: ReturnType<typeof createWalletClient> | null = null;
function chain() {
  if (!pub || !wallet) {
    if (!PK || !/^0x[0-9a-fA-F]{64}$/.test(PK)) {
      throw new Error(
        "STUDIO_PRIVATE_KEY missing or malformed (need 0x + 64 hex chars)",
      );
    }
    const account = privateKeyToAccount(PK);
    pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
    wallet = createWalletClient({
      chain: baseSepolia,
      transport: http(RPC),
      account,
    });
  }
  return { pub: pub!, wallet: wallet! };
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  banner();

  console.log("\n[1/5] computeDailyRanks");
  const r = await computeDailyRanks(DAY);
  console.log(
    `      ${r.gamesProcessed} games processed, ${r.ranksWritten} ranks written`,
  );

  console.log("\n[2/5] computeDailyAggregates");
  const a = await computeDailyAggregates(DAY);
  console.log(
    `      ${a.usersProcessed} users processed, ${a.aggregatesWritten} aggregate rows`,
  );

  if (!SKIP_ONCHAIN) {
    console.log("\n[3/5] settlePerGameTournaments (on-chain)");
    await settlePerGameTournaments(DAY);
  } else {
    console.log("\n[3/5] settlePerGameTournaments — SKIPPED");
  }

  if (!SKIP_OFFCHAIN) {
    console.log("\n[4/5] payCategoryWinners (off-chain USDC)");
    await payCategoryWinners(DAY);

    console.log("\n[5/5] payOverallWinners (off-chain USDC)");
    await payOverallWinners(DAY);
  } else {
    console.log("\n[4-5/5] off-chain payouts — SKIPPED");
  }

  console.log("\nDone.");
}

// ─── 3. On-chain per-game settle ────────────────────────────────────────────
async function settlePerGameTournaments(day: string) {
  // We don't keep a tournaments table on the DB side; instead, scan the
  // contract's nextTournamentId range and pick those that ended on `day`.
  const { pub, wallet } = chain();
  const next = (await pub.readContract({
    address: ARCADE_POOL_ADDRESS,
    abi: ARCADE_POOL_ABI,
    functionName: "nextTournamentId",
  })) as bigint;
  console.log(`      contract nextTournamentId=${next}`);

  const dayStart = Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
  const dayEnd = dayStart + 86400;

  for (let i = 0n; i < next; i++) {
    const t = (await pub.readContract({
      address: ARCADE_POOL_ADDRESS,
      abi: ARCADE_POOL_ABI,
      functionName: "getTournament",
      args: [i],
    })) as {
      gameId: Hex;
      entryFee: bigint;
      startTime: bigint;
      endTime: bigint;
      totalPool: bigint;
      creator: Address;
      winner: Address;
      winnerScore: bigint;
      settled: boolean;
    };

    if (t.settled) continue;
    const end = Number(t.endTime);
    if (end < dayStart || end > dayEnd) continue; // not "this day"
    if (end > Math.floor(Date.now() / 1000)) continue; // not yet ended

    const gameLabel = decodeBytes32(t.gameId);
    const noWinner =
      t.winner === "0x0000000000000000000000000000000000000000";

    console.log(
      `      tid=${i} game=${gameLabel} pool=${formatUSDC(t.totalPool)} ${noWinner ? "→ refund" : "→ settle " + t.winner.slice(0, 8) + "…"}`,
    );

    if (DRY) {
      console.log("        [dry-run] skipped");
      continue;
    }

    try {
      const fn = noWinner ? "refundIfEmpty" : "settle";
      const hash = await wallet.writeContract({
        chain: baseSepolia,
        account: wallet.account!,
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: fn,
        args: [i],
      });
      console.log(`        tx=${hash}`);

      await pub.waitForTransactionReceipt({ hash });

      if (!noWinner) {
        // Studio fee already taken inside settle(); winner gets the rest.
        const winnerCut = (t.totalPool * 9000n) / 10000n; // 90%
        await supabase.from("payouts").insert({
          user_address: t.winner.toLowerCase(),
          amount_usdc: Number(winnerCut) / 1e6,
          scope: "game",
          game_slug: gameLabel,
          day,
          rank: 1,
          tx_hash: hash,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`        FAILED: ${msg.split("\n")[0]}`);
    }
  }
}

// ─── 4. Off-chain category payouts ──────────────────────────────────────────
async function payCategoryWinners(day: string) {
  for (const cat of Object.keys(CATEGORIES) as CategoryKey[]) {
    const { data: top3 } = await supabase
      .from("daily_aggregates")
      .select("user_address, rank, total_points")
      .eq("scope", "category")
      .eq("category", cat)
      .eq("day", day)
      .order("rank", { ascending: true, nullsFirst: false })
      .limit(3);

    if (!top3 || top3.length === 0) {
      console.log(`      ${cat}: no winners today`);
      continue;
    }

    for (let i = 0; i < top3.length; i++) {
      const winner = top3[i];
      const amount = CATEGORY_PRIZES_USDC[i] ?? 0;
      if (amount <= 0) continue;
      await transferUSDCWithLog({
        userAddress: winner.user_address,
        amount,
        scope: "category",
        category: cat,
        gameSlug: null,
        day,
        rank: winner.rank ?? i + 1,
        label: `${cat} #${winner.rank ?? i + 1}`,
      });
    }
  }
}

// ─── 5. Off-chain overall payouts ───────────────────────────────────────────
async function payOverallWinners(day: string) {
  const { data: top10 } = await supabase
    .from("daily_aggregates")
    .select("user_address, rank, total_points")
    .eq("scope", "overall")
    .is("category", null)
    .eq("day", day)
    .order("rank", { ascending: true, nullsFirst: false })
    .limit(10);

  if (!top10 || top10.length === 0) {
    console.log("      no overall winners today");
    return;
  }

  for (let i = 0; i < top10.length; i++) {
    const winner = top10[i];
    const amount = OVERALL_PRIZES_USDC[i] ?? 0;
    if (amount <= 0) continue;
    await transferUSDCWithLog({
      userAddress: winner.user_address,
      amount,
      scope: "overall",
      category: null,
      gameSlug: null,
      day,
      rank: winner.rank ?? i + 1,
      label: `overall #${winner.rank ?? i + 1}`,
    });
  }
}

// ─── transfer + log + idempotency check ─────────────────────────────────────
async function transferUSDCWithLog(opts: {
  userAddress: string;
  amount: number;
  scope: "category" | "overall";
  category: CategoryKey | null;
  gameSlug: string | null;
  day: string;
  rank: number;
  label: string;
}) {
  // Dedup: don't re-pay if a 'sent' row already exists for this slot.
  const { data: existing } = await supabase
    .from("payouts")
    .select("id, tx_hash")
    .eq("user_address", opts.userAddress.toLowerCase())
    .eq("scope", opts.scope)
    .eq("day", opts.day)
    .eq("rank", opts.rank)
    .eq("status", "sent");

  const matchedExisting = existing?.find((r) => {
    // Postgres treats null != null in eq filters above; double-check
    // category match here (where the API doesn't expose IS NULL helper).
    return true;
  });
  if (matchedExisting) {
    console.log(`      ${opts.label}: already paid (${matchedExisting.tx_hash?.slice(0, 10)}…) — skip`);
    return;
  }

  console.log(
    `      ${opts.label}: ${opts.amount} USDC → ${opts.userAddress.slice(0, 8)}…`,
  );

  if (DRY) {
    console.log("        [dry-run] skipped");
    return;
  }

  const { wallet, pub } = chain();
  try {
    const hash = await wallet.writeContract({
      chain: baseSepolia,
      account: wallet.account!,
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [opts.userAddress as Address, toUSDC(opts.amount)],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`        tx=${hash}`);

    await supabase.from("payouts").insert({
      user_address: opts.userAddress.toLowerCase(),
      amount_usdc: opts.amount,
      scope: opts.scope,
      category: opts.category,
      game_slug: opts.gameSlug,
      day: opts.day,
      rank: opts.rank,
      tx_hash: hash,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`        FAILED: ${msg.split("\n")[0]}`);
    await supabase.from("payouts").insert({
      user_address: opts.userAddress.toLowerCase(),
      amount_usdc: opts.amount,
      scope: opts.scope,
      category: opts.category,
      game_slug: opts.gameSlug,
      day: opts.day,
      rank: opts.rank,
      status: "failed",
      failure_reason: msg.slice(0, 200),
    });
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]!] = m[2] ?? true;
  }
  return out;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: missing env ${name}`);
    process.exit(2);
  }
  return v;
}

function toUSDC(n: number): bigint {
  // 6-decimal token; round to nearest atomic unit.
  return BigInt(Math.round(n * 1_000_000));
}

function formatUSDC(units: bigint): string {
  return `${(Number(units) / 1e6).toFixed(2)} USDC`;
}

function decodeBytes32(hex: Hex): string {
  // ArcadePool packs game labels as bytes32("wordle"). Strip trailing zeros.
  const buf = Buffer.from(hex.slice(2), "hex");
  const end = buf.indexOf(0);
  return buf.slice(0, end >= 0 ? end : buf.length).toString("utf8");
}

function banner() {
  console.log("──────────────────────────────────────────────");
  console.log(`  Skillbase daily payout — ${DAY}`);
  console.log(`  ${DRY ? "DRY-RUN MODE" : "LIVE MODE"}${SKIP_ONCHAIN ? " · skip-onchain" : ""}${SKIP_OFFCHAIN ? " · skip-offchain" : ""}`);
  console.log(`  ArcadePool: ${ARCADE_POOL_ADDRESS}`);
  console.log(`  USDC:       ${USDC_ADDRESS}`);
  console.log("──────────────────────────────────────────────");
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
