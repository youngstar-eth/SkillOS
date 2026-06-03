// ───────────────────────────────────────────────────────────────────────────
// TournamentCreated event indexer — polls TournamentPool for TournamentCreated
// events since the last indexed block and either backfills metadata onto
// existing v2_tournaments rows (orchestrator-created) or inserts new rows
// (SDK-created).
//
// Entry point:
//   runIndexTournamentsCreated()
//     Scheduled daily at 00:23 UTC. DRAINS: sweeps successive MAX_BLOCK_SPAN
//     batches per invocation until it reaches the safe tip or a wall-clock /
//     iteration budget is hit — the public Base Sepolia RPC caps eth_getLogs at
//     2000 blocks, far below the ~43k blocks/day produced, so a single batch
//     per daily run could never catch up. The same loop performs the initial
//     deploy-to-tip backfill across a few invocations. Idempotent: backfill
//     UPDATE is gated on `creation_tx_hash IS NULL` so re-running on overlapping
//     block windows never overwrites a previously indexed creator. Watermark
//     advances per batch. Mirrors runIndexScoresSubmitted.
//
// Reorg posture: stops indexing at (currentBlock - REORG_BUFFER_BLOCKS).
// Mirrors runIndexSponsorEvents for symmetry — see that module's header for
// the rationale on Base finality + the 30-block buffer.
//
// Why no run-lock: this sweep is read-only on the chain side and idempotent
// on the DB side (gated UPDATE / unique INSERT on on_chain_id). Two
// overlapping cron runs both observing the same block range would each
// produce a no-op write batch — wasteful but safe. The run-lock pattern
// (PR #36) is reserved for non-idempotent writers like settle() that
// broadcast tx and must guard against double-spends.
//
// Game-slug resolution: TournamentCreated emits `game` as keccak256(slug).
// We pre-compute a hash→slug lookup at module load from TOURNAMENT_GAMES
// (single source of truth in cron/tournaments.ts). Unknown hashes are
// recorded in result.errors and skipped — protocol-level invariant says
// only canonical slugs reach the contract, so an unknown hash signals
// either (a) a slug added to the contract before this indexer was updated,
// or (b) an event from an off-platform creator using a custom slug.
// Either way, skipping is the safe default.
// ───────────────────────────────────────────────────────────────────────────

import {
  type Address,
  type Hex,
  decodeEventLog,
  getAddress,
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
} from "@skillos/lib-shared";
import { TOURNAMENT_GAMES, type TournamentGame } from "./tournaments";

// ─── Config ────────────────────────────────────────────────────────────────

/** Conservative reorg buffer — never index events newer than this. */
const REORG_BUFFER_BLOCKS = 30n;

/** Hard cap on per-run block span to keep getLogs RPC calls predictable.
 *  The public Base Sepolia RPC enforces an eth_getLogs max range of 2000;
 *  the 5000 default returns "query exceeds max block range 2000" against it,
 *  so production overrides this via TOURNAMENT_INDEXER_MAX_BLOCK_SPAN=2000 (a
 *  premium BASE_SEPOLIA_RPC_URL with a higher ceiling is the alternative).
 *  Mirrors SCORES_INDEXER_MAX_BLOCK_SPAN on the scores indexer. Read at call
 *  time — same idiom as deployBlock() below — so the value is configurable
 *  per-environment without a module reload, and unit-testable. A non-numeric
 *  or non-positive value falls back to the default rather than stalling the
 *  watermark with a zero-width span. */
const DEFAULT_MAX_BLOCK_SPAN = 5_000n;

function maxBlockSpan(): bigint {
  const raw = process.env.TOURNAMENT_INDEXER_MAX_BLOCK_SPAN;
  if (raw && /^[0-9]+$/.test(raw)) {
    const n = BigInt(raw);
    if (n > 0n) return n;
  }
  return DEFAULT_MAX_BLOCK_SPAN;
}

/** Hard cap on batches per invocation — a backstop so a misconfigured tip can
 *  never spin unbounded. The wall-clock budget below is the usual stop.
 *  Mirrors runIndexScoresSubmitted. */
const MAX_BATCHES_PER_RUN = 300;

/** Wall-clock budget per invocation. Kept well under the cron route's
 *  maxDuration=60s so the function returns cleanly with the watermark advanced
 *  as far as it got; the next run resumes from there. */
const RUN_BUDGET_MS = 50_000;

/** Default starting block if no watermark exists. TournamentPool deploy
 *  block on Base Sepolia. Override via TOURNAMENT_INDEXER_DEPLOY_BLOCK if
 *  redeployed. Plan locks this to deployBlock - 1 = 40_851_425n on first
 *  fire so block 40_851_426 (the deploy block itself) is the first block
 *  scanned. */
const DEFAULT_DEPLOY_BLOCK = 40_851_426n;

function deployBlock(): bigint {
  const raw = process.env.TOURNAMENT_INDEXER_DEPLOY_BLOCK;
  if (!raw) return DEFAULT_DEPLOY_BLOCK;
  const n = BigInt(raw);
  if (n <= 0n) throw new Error("bad TOURNAMENT_INDEXER_DEPLOY_BLOCK");
  return n;
}

// ─── Hash → slug reverse lookup ───────────────────────────────────────────

const GAME_HASH_TO_SLUG: Record<Hex, TournamentGame> = Object.fromEntries(
  TOURNAMENT_GAMES.map((slug) => [keccak256(toBytes(slug)), slug] as const),
) as Record<Hex, TournamentGame>;

// ─── Cycle type mapping ───────────────────────────────────────────────────

// Contract emits CycleType as uint8: 0 = Daily, 1 = Weekly. v2_tournaments
// stores the human-readable label.
function cycleTypeLabel(value: number): "daily" | "weekly" | null {
  if (value === 0) return "daily";
  if (value === 1) return "weekly";
  return null;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface IndexTournamentsCreatedResult {
  fromBlock: string;
  toBlock: string;
  eventsFound: number;
  /** Existing orchestrator rows that received creator metadata. */
  backfilled: number;
  /** New rows inserted from SDK-created tournaments. */
  inserted: number;
  /** Batches swept this invocation (the drain loop runs ≥1). */
  batches: number;
  /** True if the watermark reached the safe tip (no backlog remaining). */
  caughtUp: boolean;
  /** Per-event errors that did not abort the sweep. */
  errors: Array<{ txHash: string; logIndex: number; message: string }>;
}

export interface IndexTournamentsCreatedDependencies {
  supabase?: ReturnType<typeof getSupabaseService>;
  publicClient?: ReturnType<typeof getPublicClient>;
}

// ─── Watermark helpers ─────────────────────────────────────────────────────

async function readWatermark(
  supabase: ReturnType<typeof getSupabaseService>,
  contract: Address,
): Promise<bigint> {
  const { data, error } = await supabase
    .from("v2_tournament_indexer_state")
    .select("last_indexed_block")
    .eq("contract_address", contract.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`watermark read failed: ${error.message}`);
  if (!data) return deployBlock() - 1n; // first run: pick up at deployBlock
  return BigInt(data.last_indexed_block);
}

async function writeWatermark(
  supabase: ReturnType<typeof getSupabaseService>,
  contract: Address,
  block: bigint,
): Promise<void> {
  const { error } = await supabase
    .from("v2_tournament_indexer_state")
    .upsert(
      {
        contract_address: contract.toLowerCase(),
        last_indexed_block: block.toString(),
      },
      { onConflict: "contract_address" },
    );
  if (error) throw new Error(`watermark write failed: ${error.message}`);
}

// ─── Single batch ──────────────────────────────────────────────────────────

interface BatchResult {
  toBlock: bigint;
  eventsFound: number;
  backfilled: number;
  inserted: number;
  caughtUp: boolean;
  errors: IndexTournamentsCreatedResult["errors"];
}

/**
 * Sweep one MAX_BLOCK_SPAN batch of TournamentCreated events from the watermark
 * and persist creator metadata to v2_tournaments. The drain loop below calls
 * this repeatedly until the safe tip is reached.
 */
async function indexOnce(
  supabase: ReturnType<typeof getSupabaseService>,
  publicClient: ReturnType<typeof getPublicClient>,
  contract: Address,
): Promise<BatchResult> {
  const latest = await publicClient.getBlockNumber();
  const safeLatest =
    latest > REORG_BUFFER_BLOCKS ? latest - REORG_BUFFER_BLOCKS : 0n;

  const lastIndexed = await readWatermark(supabase, contract);
  const fromBlock = lastIndexed + 1n;

  // Nothing new to index — already at the safe tip.
  if (fromBlock > safeLatest) {
    return {
      toBlock: lastIndexed,
      eventsFound: 0,
      backfilled: 0,
      inserted: 0,
      caughtUp: true,
      errors: [],
    };
  }

  // Cap span so each getLogs call stays under the RPC max range; the drain
  // loop in runIndexTournamentsCreated sweeps successive batches to the tip.
  const maxSpan = maxBlockSpan();
  const toBlock =
    safeLatest - fromBlock + 1n > maxSpan
      ? fromBlock + maxSpan - 1n
      : safeLatest;

  const logs = await publicClient.getLogs({
    address: contract,
    event: {
      type: "event",
      name: "TournamentCreated",
      inputs: [
        { name: "id", type: "bytes32", indexed: true },
        { name: "sponsor", type: "address", indexed: true },
        { name: "game", type: "bytes32", indexed: true },
        { name: "cycleType", type: "uint8", indexed: false },
        { name: "startsAt", type: "uint64", indexed: false },
        { name: "endsAt", type: "uint64", indexed: false },
        { name: "prizePool", type: "uint256", indexed: false },
        { name: "participationBonus", type: "uint256", indexed: false },
      ],
    },
    fromBlock,
    toBlock,
  });

  const errors: IndexTournamentsCreatedResult["errors"] = [];
  let backfilled = 0;
  let inserted = 0;

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: TOURNAMENT_POOL_ABI,
        eventName: "TournamentCreated",
        topics: log.topics,
        data: log.data,
      });
      if (decoded.eventName !== "TournamentCreated") continue;
      const args = decoded.args as {
        id: Hex;
        sponsor: Address;
        game: Hex;
        cycleType: number;
        startsAt: bigint;
        endsAt: bigint;
        prizePool: bigint;
        participationBonus: bigint;
      };

      // Resolve game slug. Unknown → skip with structured error.
      const gameSlug = GAME_HASH_TO_SLUG[args.game];
      if (!gameSlug) {
        errors.push({
          txHash: log.transactionHash,
          logIndex: Number(log.logIndex),
          message: `unknown game hash: ${args.game}`,
        });
        continue;
      }

      const cycleLabel = cycleTypeLabel(args.cycleType);
      if (!cycleLabel) {
        errors.push({
          txHash: log.transactionHash,
          logIndex: Number(log.logIndex),
          message: `unknown cycleType: ${args.cycleType}`,
        });
        continue;
      }

      const onChainId = args.id.toLowerCase();
      const creatorAddress = args.sponsor.toLowerCase();
      const txHash = log.transactionHash.toLowerCase();
      const blockNumber = log.blockNumber.toString();

      // Existing orchestrator-created row? Backfill creator metadata.
      const { data: existing, error: lookupErr } = await supabase
        .from("v2_tournaments")
        .select("id, creation_tx_hash")
        .eq("on_chain_id", onChainId)
        .maybeSingle();

      if (lookupErr) {
        errors.push({
          txHash: log.transactionHash,
          logIndex: Number(log.logIndex),
          message: `lookup failed: ${lookupErr.message}`,
        });
        continue;
      }

      if (existing) {
        // Idempotency: only update if creation_tx_hash is still NULL.
        // Skip silently on re-runs after backfill is already complete.
        if (existing.creation_tx_hash != null) continue;

        const { error: updateErr } = await supabase
          .from("v2_tournaments")
          .update({
            creator_address: creatorAddress,
            creation_tx_hash: txHash,
            creation_block_number: blockNumber,
          })
          .eq("on_chain_id", onChainId)
          .is("creation_tx_hash", null);

        if (updateErr) {
          errors.push({
            txHash: log.transactionHash,
            logIndex: Number(log.logIndex),
            message: `update failed: ${updateErr.message}`,
          });
          continue;
        }

        backfilled++;
        continue;
      }

      // No existing row → SDK-created tournament. Insert with full metadata.
      // USDC is 6-decimal; numeric(20,6) preserves wire precision.
      const prizePoolUsdc = (Number(args.prizePool) / 1_000_000).toFixed(6);
      const startsAtIso = new Date(Number(args.startsAt) * 1000).toISOString();
      const endsAtIso = new Date(Number(args.endsAt) * 1000).toISOString();

      const { error: insertErr } = await supabase
        .from("v2_tournaments")
        .insert({
          on_chain_id: onChainId,
          game: gameSlug,
          cycle_type: cycleLabel,
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          prize_pool_usdc: prizePoolUsdc,
          participation_bonus: Number(args.participationBonus),
          // sponsor_address mirrors creator_address for SDK rows: the
          // creator IS the prize-pool funder in the simplest SDK flow.
          // Permissionless sponsorship via PoolSponsored events stays
          // separate (v2_sponsor_contributions). This preserves the
          // existing "sponsor of record" semantics for ranking/UI.
          sponsor_address: creatorAddress,
          creator_address: creatorAddress,
          created_via: "sdk",
          // TODO(X14.0b): read declared class from on-chain TournamentCreated event payload once class encoded.
          tournament_class: "mixed-declared",
          creation_tx_hash: txHash,
          creation_block_number: blockNumber,
        });

      if (insertErr) {
        errors.push({
          txHash: log.transactionHash,
          logIndex: Number(log.logIndex),
          message: `insert failed: ${insertErr.message}`,
        });
        continue;
      }

      inserted++;
    } catch (err) {
      errors.push({
        txHash: log.transactionHash,
        logIndex: Number(log.logIndex),
        message: err instanceof Error ? err.message : "decode failed",
      });
    }
  }

  // Advance watermark only after the batch loop completes. Per-event
  // errors above are recorded but don't block watermark advancement —
  // unknown game hashes / decode failures will keep failing on retry,
  // so re-scanning the same range gains nothing.
  await writeWatermark(supabase, contract, toBlock);

  return {
    toBlock,
    eventsFound: logs.length,
    backfilled,
    inserted,
    caughtUp: toBlock >= safeLatest,
    errors,
  };
}

// ─── Main (drain loop) ─────────────────────────────────────────────────────

/**
 * Drain TournamentCreated events into v2_tournaments until the safe tip is
 * reached or the per-invocation budget is exhausted. Mirrors
 * runIndexScoresSubmitted: a single MAX_BLOCK_SPAN batch can't keep up with
 * Base Sepolia's block rate (~43k/day) under the 2000-block public-RPC ceiling,
 * so each run sweeps successive batches. Idempotent (gated UPDATE / unique
 * INSERT on on_chain_id), so overlapping runs stay safe. Returns a structured
 * summary the cron route serializes directly.
 */
export async function runIndexTournamentsCreated(
  deps: IndexTournamentsCreatedDependencies = {},
): Promise<IndexTournamentsCreatedResult> {
  const supabase = deps.supabase ?? getSupabaseService();
  const publicClient = deps.publicClient ?? getPublicClient();
  const contract = getAddress(TOURNAMENT_POOL_V2_ADDRESS);

  const startedAt = Date.now();
  let firstFrom: bigint | undefined;
  let lastTo = await readWatermark(supabase, contract);
  let eventsFound = 0;
  let backfilled = 0;
  let inserted = 0;
  let batches = 0;
  let caughtUp = false;
  const errors: IndexTournamentsCreatedResult["errors"] = [];

  while (batches < MAX_BATCHES_PER_RUN) {
    if (firstFrom === undefined) firstFrom = lastTo + 1n;
    const r = await indexOnce(supabase, publicClient, contract);
    batches += 1;
    lastTo = r.toBlock;
    eventsFound += r.eventsFound;
    backfilled += r.backfilled;
    inserted += r.inserted;
    if (r.errors.length) errors.push(...r.errors);
    if (r.caughtUp) {
      caughtUp = true;
      break;
    }
    if (Date.now() - startedAt >= RUN_BUDGET_MS) break;
  }

  return {
    fromBlock: (firstFrom ?? lastTo).toString(),
    toBlock: lastTo.toString(),
    eventsFound,
    backfilled,
    inserted,
    batches,
    caughtUp,
    errors,
  };
}
