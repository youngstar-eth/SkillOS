// ───────────────────────────────────────────────────────────────────────────
// ScoreSubmitted event indexer — polls TournamentPool for ScoreSubmitted
// events since the last indexed block and upserts them into
// v2_tournament_scores, the DB read-model that backs the leaderboard route
// (Fix #4a S4). Retires the fragile full-range on-chain getLogs scan in
// apps/api/src/lib/scan.ts that returned an opaque 500 on RPC timeout.
//
// Entry point:
//   runIndexScoresSubmitted()
//     Idempotent: upsert is onConflict (tx_hash, log_index) DO NOTHING so a
//     re-scan over an overlapping window never double-inserts. Watermark
//     (v2_tournament_scores_indexer_state) advances per batch.
//
// Reorg posture: stops indexing at (currentBlock - REORG_BUFFER_BLOCKS).
// Mirrors runIndexTournamentsCreated — see that module's header for the
// rationale on Base finality + the 30-block buffer.
//
// Why no run-lock: this sweep is read-only on the chain side and idempotent on
// the DB side (unique (tx_hash, log_index) upsert). Two overlapping cron runs
// observing the same range each produce a no-op batch — wasteful but safe. The
// run-lock pattern (PR #36) is reserved for non-idempotent writers like
// settle() that broadcast tx and must guard against double-spends.
//
// ─── DEVIATION FROM runIndexTournamentsCreated: internal drain loop ────────
// The TournamentCreated indexer sweeps a single MAX_BLOCK_SPAN batch per run
// because creator metadata is never on a hot path (it tolerates up to 24h of
// lag). ScoreSubmitted backs the LEADERBOARD — a hot read — and Base Sepolia
// produces ~43,200 blocks/day, far more than one 5,000-block batch. A single
// batch per daily run would fall ~38k blocks behind every day and never catch
// up. So this indexer DRAINS: it sweeps successive MAX_BLOCK_SPAN batches
// until it reaches the safe tip OR a wall-clock / iteration budget is hit
// (bounded so one invocation stays under the cron's maxDuration=60s). Steady
// state breaks out early (caughtUp); the same loop also performs the initial
// deploy-to-tip backfill across a few invocations.
// ───────────────────────────────────────────────────────────────────────────

import { type Address, type Hex, decodeEventLog, getAddress } from "viem";
import {
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V21_ADDRESS,
} from "@skillos/contracts";
import { getPublicClient, getSupabaseService } from "@skillos/lib-shared";

// ─── Config ────────────────────────────────────────────────────────────────

/** Conservative reorg buffer — never index events newer than this. */
const REORG_BUFFER_BLOCKS = 30n;

/** Per-getLogs batch span. Mirrors runIndexTournamentsCreated. Public Base
 *  Sepolia RPC has tightened eth_getLogs ranges over time; a premium
 *  BASE_SEPOLIA_RPC_URL is the production path. Override for break-glass via
 *  SCORES_INDEXER_MAX_BLOCK_SPAN. */
const MAX_BLOCK_SPAN = (() => {
  const raw = process.env.SCORES_INDEXER_MAX_BLOCK_SPAN;
  if (raw && /^[0-9]+$/.test(raw)) return BigInt(raw);
  return 5_000n;
})();

/** Hard cap on batches per invocation — a backstop so a misconfigured tip can
 *  never spin unbounded. The wall-clock budget below is the usual stop. */
const MAX_BATCHES_PER_RUN = 300;

/** Wall-clock budget per invocation. Kept well under the cron route's
 *  maxDuration=60s so the function returns cleanly with the watermark
 *  advanced as far as it got; the next run resumes from there. */
const RUN_BUDGET_MS = 50_000;

/** Default starting block if no watermark exists. TournamentPool v2.1 deploy
 *  block on Base Sepolia. Override via SCORES_INDEXER_DEPLOY_BLOCK if
 *  redeployed. Watermark seeds at deployBlock - 1 so the deploy block itself
 *  is the first block scanned. */
const DEFAULT_DEPLOY_BLOCK = 40_851_426n;

function deployBlock(): bigint {
  const raw = process.env.SCORES_INDEXER_DEPLOY_BLOCK;
  if (!raw) return DEFAULT_DEPLOY_BLOCK;
  const n = BigInt(raw);
  if (n <= 0n) throw new Error("bad SCORES_INDEXER_DEPLOY_BLOCK");
  return n;
}

// Inline event shape for getLogs — matches TOURNAMENT_POOL_ABI's ScoreSubmitted.
const SCORE_SUBMITTED_EVENT = {
  type: "event",
  name: "ScoreSubmitted",
  inputs: [
    { name: "id", type: "bytes32", indexed: true },
    { name: "player", type: "address", indexed: true },
    { name: "score", type: "uint256", indexed: false },
    { name: "matchCountDelta", type: "uint256", indexed: false },
    { name: "nonce", type: "bytes32", indexed: false },
  ],
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface IndexScoresSubmittedResult {
  /** First block of the first batch this invocation swept. */
  fromBlock: string;
  /** Last block reached (watermark after this invocation). */
  toBlock: string;
  /** Total ScoreSubmitted logs observed across all batches this invocation. */
  eventsFound: number;
  /** Rows actually inserted (excludes onConflict-skipped duplicates). */
  inserted: number;
  /** Batches swept this invocation. */
  batches: number;
  /** True if the watermark reached the safe tip (no backlog remaining). */
  caughtUp: boolean;
  /** Per-event errors that did not abort the sweep. */
  errors: Array<{ txHash: string; logIndex: number; message: string }>;
}

export interface IndexScoresSubmittedDependencies {
  supabase?: ReturnType<typeof getSupabaseService>;
  publicClient?: ReturnType<typeof getPublicClient>;
}

// ─── Watermark helpers ─────────────────────────────────────────────────────

async function readWatermark(
  supabase: ReturnType<typeof getSupabaseService>,
  contract: Address,
): Promise<bigint> {
  const { data, error } = await supabase
    .from("v2_tournament_scores_indexer_state")
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
    .from("v2_tournament_scores_indexer_state")
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
  inserted: number;
  caughtUp: boolean;
  errors: IndexScoresSubmittedResult["errors"];
}

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
      inserted: 0,
      caughtUp: true,
      errors: [],
    };
  }

  const toBlock =
    safeLatest - fromBlock + 1n > MAX_BLOCK_SPAN
      ? fromBlock + MAX_BLOCK_SPAN - 1n
      : safeLatest;

  const logs = await publicClient.getLogs({
    address: contract,
    event: SCORE_SUBMITTED_EVENT,
    fromBlock,
    toBlock,
  });

  const errors: IndexScoresSubmittedResult["errors"] = [];

  // Resolve block timestamps once per unique block (viem getBlock is 1 RPC
  // each). Stored at index time so the leaderboard read is pure-DB.
  const uniqueBlocks = [...new Set(logs.map((l) => l.blockNumber))];
  const blockTimes = new Map<bigint, number>();
  await Promise.all(
    uniqueBlocks.map(async (bn) => {
      if (bn == null) return;
      const block = await publicClient.getBlock({ blockNumber: bn });
      blockTimes.set(bn, Number(block.timestamp));
    }),
  );

  const rows: Array<Record<string, unknown>> = [];
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: TOURNAMENT_POOL_ABI,
        eventName: "ScoreSubmitted",
        topics: log.topics,
        data: log.data,
      });
      if (decoded.eventName !== "ScoreSubmitted") continue;
      const args = decoded.args as {
        id: Hex;
        player: Address;
        score: bigint;
        matchCountDelta: bigint;
        nonce: Hex;
      };

      const bn = log.blockNumber;
      const ts = bn != null ? blockTimes.get(bn) : undefined;
      if (bn == null || ts == null || log.logIndex == null) {
        errors.push({
          txHash: log.transactionHash ?? "(pending)",
          logIndex: Number(log.logIndex ?? -1),
          message: "log missing block/index context (pending block?)",
        });
        continue;
      }

      rows.push({
        tournament_on_chain_id: args.id.toLowerCase(),
        player_address: args.player.toLowerCase(),
        score: args.score.toString(),
        match_count_delta: args.matchCountDelta.toString(),
        nonce: args.nonce ? args.nonce.toLowerCase() : null,
        block_number: bn.toString(),
        log_index: Number(log.logIndex),
        tx_hash: (log.transactionHash ?? "").toLowerCase(),
        block_timestamp: new Date(ts * 1000).toISOString(),
      });
    } catch (err) {
      errors.push({
        txHash: log.transactionHash ?? "(unknown)",
        logIndex: Number(log.logIndex ?? -1),
        message: err instanceof Error ? err.message : "decode failed",
      });
    }
  }

  let inserted = 0;
  if (rows.length > 0) {
    // onConflict (tx_hash, log_index) DO NOTHING. ignoreDuplicates + select
    // returns ONLY the freshly inserted rows, so data.length is the exact
    // insert count (skipped duplicates are not returned).
    const { data, error } = await supabase
      .from("v2_tournament_scores")
      .upsert(rows, {
        onConflict: "tx_hash,log_index",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw new Error(`scores upsert failed: ${error.message}`);
    inserted = data?.length ?? 0;
  }

  // Advance watermark only after the upsert succeeds.
  await writeWatermark(supabase, contract, toBlock);

  return {
    toBlock,
    eventsFound: logs.length,
    inserted,
    caughtUp: toBlock >= safeLatest,
    errors,
  };
}

// ─── Main (drain loop) ─────────────────────────────────────────────────────

/**
 * Drain ScoreSubmitted events into v2_tournament_scores until the safe tip is
 * reached or the per-invocation budget is exhausted. See the DEVIATION note in
 * the module header for why this loops rather than sweeping a single batch.
 */
export async function runIndexScoresSubmitted(
  deps: IndexScoresSubmittedDependencies = {},
): Promise<IndexScoresSubmittedResult> {
  const supabase = deps.supabase ?? getSupabaseService();
  const publicClient = deps.publicClient ?? getPublicClient();
  const contract = getAddress(TOURNAMENT_POOL_V21_ADDRESS);

  const startedAt = Date.now();
  let firstFrom: bigint | undefined;
  let lastTo = await readWatermark(supabase, contract);
  let eventsFound = 0;
  let inserted = 0;
  let batches = 0;
  let caughtUp = false;
  const errors: IndexScoresSubmittedResult["errors"] = [];

  while (batches < MAX_BATCHES_PER_RUN) {
    if (firstFrom === undefined) firstFrom = lastTo + 1n;
    const r = await indexOnce(supabase, publicClient, contract);
    batches += 1;
    lastTo = r.toBlock;
    eventsFound += r.eventsFound;
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
    inserted,
    batches,
    caughtUp,
    errors,
  };
}
