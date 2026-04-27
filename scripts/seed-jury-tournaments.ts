// ───────────────────────────────────────────────────────────────────────────
// One-off seed: 30-day solo daily tournaments per game for jury evaluation.
//
// Mirrors packages/duel-backend/src/cron/tournaments.ts:runCreateTournaments
// but with:
//   - startsAt = nowSec               (avoids id collision with cron's daily,
//                                      keccak256(game|cycle|startsAt))
//   - endsAt   = nowSec + 30 * 86400  (covers jury window + buffer + first
//                                      pilot — pure data seeding, no contract
//                                      change)
//   - cycle_type = "daily" / Daily(0) (apps/<game>/src/app/tournament/solo/
//                                      page.tsx reads activeData?.daily only)
//   - prizePool  = 3.333333 USDC      (jury budget: 20 USDC total / 6 games)
//
// Idempotent: dedup via on_chain_id; on-chain TournamentAlreadyExists is
// swallowed and reconciled with a zero tx hash row, same pattern as cron.
//
// Usage:
//   /usr/local/bin/node --env-file=apps/2048/.env.local \
//     ./node_modules/.bin/tsx scripts/seed-jury-tournaments.ts
//
// Required env (already present in apps/2048/.env.local):
//   STUDIO_PRIVATE_KEY            — sponsor wallet, must hold ≥ 60 USDC + gas
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// Optional env:
//   BASE_SEPOLIA_RPC_URL          — defaults to https://sepolia.base.org
//   NEXT_PUBLIC_TOURNAMENT_POOL_V2_ADDRESS, NEXT_PUBLIC_USDC_ADDRESS,
//   NEXT_PUBLIC_CHAIN_ID          — fall back to addresses.ts defaults.
//
// Output: per-game tx hash + BaseScan link, then JSON summary on stdout
// suitable for Gate-2 deliverable.
// ───────────────────────────────────────────────────────────────────────────

import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  toBytes,
} from "viem";
import {
  ERC20_ABI,
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V2_ADDRESS,
  USDC_ADDRESS,
} from "@skillbase/contracts";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
} from "@skillbase/lib-shared";

// ─── Config ────────────────────────────────────────────────────────────────

const TOURNAMENT_GAMES = [
  "2048",
  "wordle",
  "sudoku",
  "minesweeper",
  "clicker",
  "match3",
] as const;
type TournamentGame = (typeof TOURNAMENT_GAMES)[number];

// Per-game participation bonus — copied verbatim from cron so settle math
// matches if the cron later picks up the seeded tournament.
const PARTICIPATION_BONUS: Record<TournamentGame, number> = {
  "2048": 50,
  wordle: 200,
  sudoku: 10,
  minesweeper: 20,
  clicker: 1,
  match3: 15,
};

const CYCLE_DAILY = 0; // CycleType.Daily — informational; endsAt drives settle.
const SECONDS_PER_DAY = 86_400;
const DURATION_SEC = 30 * SECONDS_PER_DAY;
const PRIZE_POOL_USDC_RAW = 3_333_333n; // 3.333333 USDC (6 decimals); 6×=19.999998

// ─── Helpers ───────────────────────────────────────────────────────────────

function deriveTournamentId(
  game: TournamentGame,
  cycle: 0 | 1,
  startsAtSec: number,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint8" }, { type: "uint64" }],
      [keccak256(toBytes(game)), cycle, BigInt(startsAtSec)],
    ),
  );
}

async function ensureUsdcAllowance(
  sponsor: Address,
  need: bigint,
): Promise<void> {
  const publicClient = getPublicClient();
  const current = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [sponsor, TOURNAMENT_POOL_V2_ADDRESS],
  })) as bigint;
  if (current >= need) return;

  const walletClient = getWalletClient();
  const approveHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [TOURNAMENT_POOL_V2_ADDRESS, 2n ** 256n - 1n],
    account: walletClient.account ?? null,
    chain: walletClient.chain,
  });
  console.log(`[seed] USDC max-approve tx: ${approveHash}`);
  await publicClient.waitForTransactionReceipt({
    hash: approveHash,
    timeout: 60_000,
  });
}

async function balanceOfUsdc(addr: Address): Promise<bigint> {
  return (await getPublicClient().readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [addr],
  })) as bigint;
}

interface SeededRow {
  game: TournamentGame;
  cycleType: "daily";
  onChainId: Hex;
  txHash: Hex;
  dbId: string;
  startsAt: string;
  endsAt: string;
  basescan: string;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabase = getSupabaseService();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const sponsor = walletClient.account?.address;
  if (!sponsor) throw new Error("seed: wallet client has no account");

  const usdc = await balanceOfUsdc(sponsor);
  const need = PRIZE_POOL_USDC_RAW * BigInt(TOURNAMENT_GAMES.length);
  console.log(
    `[seed] sponsor=${sponsor} usdcBalance=${(Number(usdc) / 1e6).toFixed(6)} ` +
      `usdcNeeded=${(Number(need) / 1e6).toFixed(2)}`,
  );
  if (usdc < need) {
    throw new Error(
      `[seed] sponsor balance insufficient: ${usdc} < ${need} (USDC 6dp). ` +
        `Fund ${sponsor} on Base Sepolia and retry.`,
    );
  }

  await ensureUsdcAllowance(sponsor, need);

  const nowSec = Math.floor(Date.now() / 1000);
  const endsAt = nowSec + DURATION_SEC;

  const seeded: SeededRow[] = [];
  const skipped: Array<{ game: TournamentGame; reason: string }> = [];
  const errors: Array<{ game: TournamentGame; message: string }> = [];

  for (const game of TOURNAMENT_GAMES) {
    const onChainId = deriveTournamentId(game, CYCLE_DAILY, nowSec);

    // Dedupe: skip if a row with this on_chain_id already exists.
    const { data: existing, error: readErr } = await supabase
      .from("v2_tournaments")
      .select("id, on_chain_id")
      .eq("on_chain_id", onChainId)
      .maybeSingle();
    if (readErr) {
      errors.push({ game, message: `db read: ${readErr.message}` });
      continue;
    }
    if (existing) {
      skipped.push({ game, reason: "already exists in DB" });
      continue;
    }

    let txHash: Hex;
    try {
      txHash = await walletClient.writeContract({
        address: TOURNAMENT_POOL_V2_ADDRESS,
        abi: TOURNAMENT_POOL_ABI,
        functionName: "createTournament",
        args: [
          onChainId,
          keccak256(toBytes(game)),
          CYCLE_DAILY,
          BigInt(nowSec),
          BigInt(endsAt),
          PRIZE_POOL_USDC_RAW,
          BigInt(PARTICIPATION_BONUS[game]),
        ],
        account: walletClient.account ?? null,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      if (message.includes("TournamentAlreadyExists")) {
        // Chain has it but DB doesn't — reconcile DB row with zero tx hash.
        txHash = ("0x" + "0".repeat(64)) as Hex;
      } else {
        errors.push({ game, message });
        continue;
      }
    }

    const startsAtIso = new Date(nowSec * 1000).toISOString();
    const endsAtIso = new Date(endsAt * 1000).toISOString();

    const { data: inserted, error: insertErr } = await supabase
      .from("v2_tournaments")
      .insert({
        on_chain_id: onChainId,
        game,
        cycle_type: "daily",
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        prize_pool_usdc: Number(PRIZE_POOL_USDC_RAW) / 1_000_000,
        participation_bonus: PARTICIPATION_BONUS[game],
        sponsor_address: sponsor,
        sponsor_name: "Skillbase",
      })
      .select("id")
      .single();
    if (insertErr) {
      errors.push({ game, message: `db insert: ${insertErr.message}` });
      continue;
    }

    const row: SeededRow = {
      game,
      cycleType: "daily",
      onChainId,
      txHash,
      dbId: (inserted as { id: string }).id,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      basescan: `https://sepolia.basescan.org/tx/${txHash}`,
    };
    seeded.push(row);
    console.log(
      `[seed] ${game.padEnd(11)} on_chain=${onChainId.slice(0, 10)}… ` +
        `tx=${txHash.slice(0, 10)}… dbId=${row.dbId}`,
    );
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({ seeded, skipped, errors }, null, 2));

  if (errors.length > 0) {
    console.error(`[seed] ${errors.length} error(s) — see summary above`);
    process.exit(1);
  }
  if (seeded.length === 0 && skipped.length === TOURNAMENT_GAMES.length) {
    console.log("[seed] all games already seeded — no-op");
  }
}

main().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
