// ───────────────────────────────────────────────────────────────────────────
// X9 Phase B.1 one-shot: reconcile clicker 5/13 DB-orphan tournament.
//
// Context: v2_tournaments row id=dffda27c-7881-465f-b22d-6fc4475dc997 was
// inserted by the cron at 2026-05-13 00:00:20 UTC with all 4 audit fields
// NULL. Blockscout TournamentCreated event scan on
// 0x52049b812780134d2F69D6c20C2ef881D49702da returns no log with topic1=
// 0x7aace19a05a1beb8d757ac9c8d8837c9808784f4886d2fe29795aa8ee3519759 —
// confirmed DB-orphan: chain side was never populated.
//
// Hypothesis: pre-X9 cron's substring-match catch false-positive'd on
// TournamentAlreadyExists for some other error, swallowed silently, fell
// through to INSERT with zero tx_hash. The X9 Commit 1 fix (selector-based
// decode) prevents this going forward; Commit 4's on-chain verify dedupe
// would self-heal this exact row on the next cron tick.
//
// This script broadcasts createTournament with the DB's stored params,
// waits for receipt, and UPDATEs the row's audit fields. Idempotent: if
// creation_tx_hash is already populated when the script runs, it exits
// without doing anything (lets the cron self-heal beat us, or a prior
// script run be honored).
//
// Founder broadcast gate: dry-run is the default. Re-run with BROADCAST=1
// to actually broadcast on-chain.
//
// Usage:
//   # Dry-run (simulate only):
//   /usr/local/bin/node --env-file=apps/2048/.env.local \
//     ./node_modules/.bin/tsx scripts/reconcile-clicker-5-13.ts
//
//   # Broadcast (after reviewing dry-run output):
//   BROADCAST=1 /usr/local/bin/node --env-file=apps/2048/.env.local \
//     ./node_modules/.bin/tsx scripts/reconcile-clicker-5-13.ts
//
// Required env (already present in apps/2048/.env.local):
//   STUDIO_PRIVATE_KEY            — sponsor wallet, must hold ≥ 10 USDC + gas
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// Optional env:
//   BASE_SEPOLIA_RPC_URL          — defaults to https://sepolia.base.org
//   NEXT_PUBLIC_TOURNAMENT_POOL_V2_ADDRESS — falls back to addresses.ts
//
// Output: JSON per step on stdout — params_reconstructed, simulate_success,
// dry_run_complete (or broadcasting + broadcast_sent + receipt_received +
// reconciliation_complete). Errors as JSON on stderr.
//
// X9 sprint forensic context: see PR description + sprint log.
// created_via='orchestrator' for schema constraint compliance; manual-
// trigger provenance recorded in commit history.
// ───────────────────────────────────────────────────────────────────────────

import {
  type Hex,
  encodeAbiParameters,
  keccak256,
  toBytes,
} from "viem";
import {
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V2_ADDRESS,
} from "@skillos/contracts";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
} from "@skillos/lib-shared";

const DB_ROW_ID = "dffda27c-7881-465f-b22d-6fc4475dc997";
const EXPECTED_ON_CHAIN_ID =
  "0x7aace19a05a1beb8d757ac9c8d8837c9808784f4886d2fe29795aa8ee3519759" as Hex;
const SHOULD_BROADCAST = process.env.BROADCAST === "1";

function log(step: string, payload: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ step, ...payload }));
}

async function main(): Promise<void> {
  const supabase = getSupabaseService();
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();
  const sponsor = walletClient.account?.address;
  if (!sponsor) throw new Error("walletClient has no account");

  // ─── Read DB row + idempotency check ────────────────────────────────────
  const { data: row, error: readErr } = await supabase
    .from("v2_tournaments")
    .select(
      "id, on_chain_id, game, cycle_type, starts_at, ends_at, prize_pool_usdc, participation_bonus, sponsor_address, creator_address, creation_tx_hash, creation_block_number, settled_at",
    )
    .eq("id", DB_ROW_ID)
    .single();
  if (readErr || !row) {
    throw new Error(`db read: ${readErr?.message ?? "row not found"}`);
  }

  if (row.creation_tx_hash) {
    log("skipped_already_reconciled", {
      reason: "creation_tx_hash already set",
      existing_tx_hash: row.creation_tx_hash,
      creation_block_number: row.creation_block_number,
    });
    return;
  }

  if (row.settled_at) {
    throw new Error(
      `row already settled at ${row.settled_at} — cannot reconcile a settled tournament; investigate`,
    );
  }

  if ((row.on_chain_id as string).toLowerCase() !== EXPECTED_ON_CHAIN_ID) {
    throw new Error(
      `on_chain_id drift: db=${row.on_chain_id} expected=${EXPECTED_ON_CHAIN_ID}`,
    );
  }

  // ─── Reconstruct contract args from DB row ──────────────────────────────
  const game = row.game as string;
  if (game !== "clicker") throw new Error(`expected game=clicker got ${game}`);
  const cycleEnum: 0 | 1 = row.cycle_type === "weekly" ? 1 : 0;
  const startsAtSec = Math.floor(new Date(row.starts_at as string).getTime() / 1000);
  const endsAtSec = Math.floor(new Date(row.ends_at as string).getTime() / 1000);
  const prizePool = BigInt(
    Math.round(Number(row.prize_pool_usdc) * 1_000_000),
  );
  const bonus = BigInt(row.participation_bonus as number);
  const gameSlug = keccak256(toBytes(game));

  // Cross-check derived id against DB (sanity — would catch mis-aligned
  // start times, off-by-one cycles, etc. before broadcasting bad calldata).
  const derivedId = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint64" },
      ],
      [gameSlug, cycleEnum, BigInt(startsAtSec)],
    ),
  );
  if (derivedId.toLowerCase() !== (row.on_chain_id as string).toLowerCase()) {
    throw new Error(
      `id derivation mismatch: derived=${derivedId} db=${row.on_chain_id}`,
    );
  }

  log("params_reconstructed", {
    game,
    cycle: row.cycle_type,
    cycleEnum,
    startsAtSec,
    endsAtSec,
    prizePoolWei: prizePool.toString(),
    bonus: bonus.toString(),
    onChainId: row.on_chain_id,
    sponsor,
    db_id: row.id,
  });

  // ─── Simulate (always — required for both dry-run + pre-broadcast) ──────
  const sim = await publicClient.simulateContract({
    address: TOURNAMENT_POOL_V2_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: "createTournament",
    args: [
      row.on_chain_id as Hex,
      gameSlug,
      cycleEnum,
      BigInt(startsAtSec),
      BigInt(endsAtSec),
      prizePool,
      bonus,
    ],
    account: walletClient.account ?? null,
  });

  const gasEstimate = await publicClient.estimateContractGas({
    address: TOURNAMENT_POOL_V2_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: "createTournament",
    args: [
      row.on_chain_id as Hex,
      gameSlug,
      cycleEnum,
      BigInt(startsAtSec),
      BigInt(endsAtSec),
      prizePool,
      bonus,
    ],
    account: walletClient.account ?? null,
  });

  log("simulate_success", {
    function: "createTournament",
    target: TOURNAMENT_POOL_V2_ADDRESS,
    gas_estimate: gasEstimate.toString(),
    sponsor_address: sponsor,
    will_broadcast: SHOULD_BROADCAST,
  });

  if (!SHOULD_BROADCAST) {
    log("dry_run_complete", {
      message: "Re-run with BROADCAST=1 to broadcast on-chain.",
    });
    return;
  }

  // ─── Broadcast ─────────────────────────────────────────────────────────
  log("broadcasting", {});
  const txHash = await walletClient.writeContract(sim.request);
  log("broadcast_sent", { tx_hash: txHash });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 90_000,
  });
  log("receipt_received", {
    tx_hash: receipt.transactionHash,
    block_number: receipt.blockNumber.toString(),
    status: receipt.status,
    gas_used: receipt.gasUsed.toString(),
  });

  if (receipt.status !== "success") {
    throw new Error(`tx reverted: ${txHash}`);
  }

  // ─── UPDATE DB row with audit fields ────────────────────────────────────
  // X9 Path A: created_via='orchestrator' for constraint compliance;
  // manual-trigger provenance lives in commit history + PR description.
  const { error: updateErr } = await supabase
    .from("v2_tournaments")
    .update({
      creator_address: sponsor.toLowerCase(),
      creation_tx_hash: receipt.transactionHash,
      creation_block_number: Number(receipt.blockNumber),
      created_via: "orchestrator",
    })
    .eq("id", DB_ROW_ID);
  if (updateErr) throw new Error(`db update: ${updateErr.message}`);

  log("reconciliation_complete", {
    db_id: DB_ROW_ID,
    on_chain_id: row.on_chain_id,
    creation_tx_hash: receipt.transactionHash,
    creation_block_number: receipt.blockNumber.toString(),
    basescan: `https://sepolia.basescan.org/tx/${receipt.transactionHash}`,
  });
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );
  process.exit(1);
});
