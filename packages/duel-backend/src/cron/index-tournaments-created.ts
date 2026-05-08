// ───────────────────────────────────────────────────────────────────────────
// TournamentCreated event indexer — polls TournamentPool for TournamentCreated
// events since the last indexed block and either backfills metadata onto
// existing v2_tournaments rows (orchestrator-created) or inserts new rows
// (SDK-created).
//
// Entry point:
//   runIndexTournamentsCreated()
//     Scheduled daily at 00:23 UTC. Idempotent: backfill UPDATE is gated on
//     `creation_tx_hash IS NULL` so re-running on overlapping block windows
//     never overwrites a previously indexed creator. Watermark advances only
//     on successful sweep.
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
} from "@skillbase/contracts";
import {
  getPublicClient,
  getSupabaseService,
} from "@skillbase/lib-shared";
import { TOURNAMENT_GAMES, type TournamentGame } from "./tournaments";

// ─── Config ────────────────────────────────────────────────────────────────

/** Conservative reorg buffer — never index events newer than this. */
const REORG_BUFFER_BLOCKS = 30n;

/** Hard cap on per-run block span to keep getLogs RPC calls predictable.
 *  Base public RPC tolerates ~10K blocks; 5K leaves headroom. Mirrors
 *  runIndexSponsorEvents. */
const MAX_BLOCK_SPAN = 5_000n;

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

// ─── Main ──────────────────────────────────────────────────────────────────

/**
 * Sweep TournamentPool.TournamentCreated events since the watermark and
 * persist creator metadata to v2_tournaments. Returns a structured summary
 * the cron route serializes directly.
 */
export async function runIndexTournamentsCreated(
  deps: IndexTournamentsCreatedDependencies = {},
): Promise<IndexTournamentsCreatedResult> {
  const supabase = deps.supabase ?? getSupabaseService();
  const publicClient = deps.publicClient ?? getPublicClient();

  const contractAddress = getAddress(TOURNAMENT_POOL_V2_ADDRESS);

  const latest = await publicClient.getBlockNumber();
  const safeLatest =
    latest > REORG_BUFFER_BLOCKS ? latest - REORG_BUFFER_BLOCKS : 0n;

  const lastIndexed = await readWatermark(supabase, contractAddress);
  const fromBlock = lastIndexed + 1n;

  // Cap span so a long outage doesn't blow up getLogs.
  const candidateTo = safeLatest;
  const toBlock =
    candidateTo - fromBlock + 1n > MAX_BLOCK_SPAN
      ? fromBlock + MAX_BLOCK_SPAN - 1n
      : candidateTo;

  if (toBlock < fromBlock) {
    return {
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      eventsFound: 0,
      backfilled: 0,
      inserted: 0,
      errors: [],
    };
  }

  const logs = await publicClient.getLogs({
    address: contractAddress,
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
  await writeWatermark(supabase, contractAddress, toBlock);

  return {
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    eventsFound: logs.length,
    backfilled,
    inserted,
    errors,
  };
}
