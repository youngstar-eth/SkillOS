#!/usr/bin/env npx tsx
/**
 * Create a fresh 24h tournament on ArcadePool for each game slug passed via
 * --games=a,b,c (default: wordle,2048,hillclimb).
 *
 *   GAMES=wordle,2048,hillclimb \
 *   ENTRY_FEE_USDC=1 \
 *   DURATION_SECONDS=86400 \
 *   npx tsx scripts/create-tournaments.ts
 *
 * Reads STUDIO_PRIVATE_KEY from env. Prints each tx hash + the new
 * tournamentId parsed out of the `TournamentCreated` event — copy those
 * numbers into the app's `TOURNAMENT_ID` constants.
 */

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  parseEventLogs,
  stringToHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const GAMES = (args.games ?? process.env.GAMES ?? "wordle,2048,hillclimb")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ENTRY_FEE = Number(
  args["entry-fee"] ?? process.env.ENTRY_FEE_USDC ?? 1,
);
const DURATION = BigInt(
  args.duration ?? process.env.DURATION_SECONDS ?? 86400,
);
const DRY = !!args["dry-run"];

const PK = (process.env.STUDIO_PRIVATE_KEY ?? "") as Hex;
if (!PK || !/^0x[0-9a-fA-F]{64}$/.test(PK)) {
  console.error(
    "ERROR: STUDIO_PRIVATE_KEY missing or malformed (need 0x + 64 hex chars)",
  );
  process.exit(2);
}

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";

// ─── clients ─────────────────────────────────────────────────────────────────
const account = privateKeyToAccount(PK);
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(RPC),
  account,
});

function toAtomicUSDC(n: number): bigint {
  return BigInt(Math.round(n * 1_000_000));
}

function toBytes32GameId(slug: string): Hex {
  if (slug.length > 32) throw new Error(`gameId too long: ${slug}`);
  // right-pad with zeros to 32 bytes to match ArcadePool's existing entries
  return (stringToHex(slug, { size: 32 }) as Hex);
}

async function main() {
  banner();
  for (const slug of GAMES) {
    const gameId = toBytes32GameId(slug);
    console.log(
      `\n→ ${slug.padEnd(12)}  gameId=${gameId.slice(0, 20)}…  fee=${ENTRY_FEE} USDC  duration=${Number(DURATION)}s`,
    );
    if (DRY) {
      console.log("   [dry-run] skipped");
      continue;
    }
    try {
      const hash = await wallet.writeContract({
        chain: baseSepolia,
        account,
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "createTournament",
        args: [gameId, toAtomicUSDC(ENTRY_FEE), DURATION],
      });
      console.log(`   tx=${hash}`);
      const rcpt = await pub.waitForTransactionReceipt({ hash });
      const logs = parseEventLogs({
        abi: ARCADE_POOL_ABI,
        logs: rcpt.logs,
        eventName: "TournamentCreated",
      });
      const ev = logs[0];
      if (ev && "args" in ev) {
        const a = ev.args as { id?: bigint; gameId?: Hex; endTime?: bigint };
        const endsAt = a.endTime
          ? new Date(Number(a.endTime) * 1000).toISOString()
          : "?";
        console.log(`   → tournamentId=${a.id?.toString()}  ends=${endsAt}`);
      } else {
        console.log("   (event parse: no TournamentCreated log)");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`   FAILED: ${msg.split("\n")[0]}`);
    }
  }
  console.log("\nDone.");
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]!] = m[2] ?? true;
  }
  return out;
}

function banner() {
  console.log("──────────────────────────────────────────────");
  console.log(`  ArcadePool tournament creator`);
  console.log(`  Chain:  base-sepolia`);
  console.log(`  Pool:   ${ARCADE_POOL_ADDRESS}`);
  console.log(`  Signer: ${account.address}`);
  console.log(`  Games:  ${GAMES.join(", ")}`);
  console.log(`  Fee:    ${ENTRY_FEE} USDC / entry`);
  console.log(`  Length: ${Number(DURATION)}s (${Math.round(Number(DURATION) / 3600)}h)`);
  if (DRY) console.log(`  DRY-RUN MODE`);
  console.log("──────────────────────────────────────────────");
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
