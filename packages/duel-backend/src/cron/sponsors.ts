// ───────────────────────────────────────────────────────────────────────────
// Sponsor event indexer — polls SponsorshipModule for PoolSponsored events
// since the last indexed block and writes them to v2_sponsor_contributions.
//
// Entry point:
//   runIndexSponsorEvents()
//     Scheduled every ~5 minutes (or as Vercel tier permits). Idempotent:
//     INSERT ... ON CONFLICT (tx_hash, log_index) DO NOTHING. Re-running on
//     overlapping block windows costs Supabase round-trips but never produces
//     duplicates. Watermark advances only on successful sweep — if Supabase
//     write fails mid-batch, next run reprocesses uncommitted events.
//
// Reorg posture: stops indexing at (currentBlock - REORG_BUFFER_BLOCKS).
// On Base, finality is ~5s for sequencer-included blocks; 30 blocks (~1 min)
// is conservative against any sequencer rollback we'd realistically see.
// Mainnet swap may want to widen this further once L1 finality is the anchor.
// ───────────────────────────────────────────────────────────────────────────

import {
  type Address,
  type Hex,
  decodeEventLog,
  getAddress,
} from "viem";
import {
  SPONSORSHIP_MODULE_ABI,
  SPONSORSHIP_MODULE_ADDRESS,
} from "@skillos/contracts";
import {
  getPublicClient,
  getSupabaseService,
} from "@skillos/lib-shared";

// ─── Config ────────────────────────────────────────────────────────────────

/** Conservative reorg buffer — never index events newer than this. */
const REORG_BUFFER_BLOCKS = 30n;

/** Hard cap on per-run block span to keep getLogs RPC calls predictable.
 *  Base public RPC tolerates ~10K blocks; 5K leaves headroom. */
const MAX_BLOCK_SPAN = 5_000n;

/** Default starting block if no watermark exists. SponsorshipModule deploy
 *  block on Base Sepolia (DeploySponsorStack.s.sol — 2026-04-29, tx
 *  0x6b14a664... at block 0x26f57e2). Override via SPONSOR_INDEXER_DEPLOY_BLOCK
 *  if redeployed. */
const DEFAULT_DEPLOY_BLOCK = 40_851_426n;

function deployBlock(): bigint {
  const raw = process.env.SPONSOR_INDEXER_DEPLOY_BLOCK;
  if (!raw) return DEFAULT_DEPLOY_BLOCK;
  const n = BigInt(raw);
  if (n <= 0n) throw new Error("bad SPONSOR_INDEXER_DEPLOY_BLOCK");
  return n;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface IndexSponsorEventsResult {
  fromBlock: string;
  toBlock: string;
  eventsFound: number;
  inserted: number;
  duplicates: number;
  errors: Array<{ txHash: string; logIndex: number; message: string }>;
}

interface PoolSponsoredRow {
  tournament_on_chain_id: string;
  sponsor_address: string;
  amount_usdc: string; // numeric in DB; pass as string from bigint
  receipt_token_id: string;
  tx_hash: string;
  log_index: number;
  block_number: string;
}

// ─── Watermark helpers ─────────────────────────────────────────────────────

async function readWatermark(
  supabase: ReturnType<typeof getSupabaseService>,
  contract: Address,
): Promise<bigint> {
  const { data, error } = await supabase
    .from("v2_sponsor_indexer_state")
    .select("last_indexed_block")
    .eq("contract_address", contract.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`watermark read failed: ${error.message}`);
  if (!data) return deployBlock() - 1n; // pick up from deployBlock on first run
  return BigInt(data.last_indexed_block);
}

async function writeWatermark(
  supabase: ReturnType<typeof getSupabaseService>,
  contract: Address,
  block: bigint,
): Promise<void> {
  const { error } = await supabase
    .from("v2_sponsor_indexer_state")
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
 * Sweep SponsorshipModule.PoolSponsored events since the watermark and
 * persist them to v2_sponsor_contributions. Returns a structured summary
 * the cron route serializes directly.
 */
export async function runIndexSponsorEvents(): Promise<IndexSponsorEventsResult> {
  const moduleAddress = getAddress(SPONSORSHIP_MODULE_ADDRESS);
  const supabase = getSupabaseService();
  const publicClient = getPublicClient();

  const latest = await publicClient.getBlockNumber();
  const safeLatest = latest > REORG_BUFFER_BLOCKS ? latest - REORG_BUFFER_BLOCKS : 0n;

  const lastIndexed = await readWatermark(supabase, moduleAddress);
  const fromBlock = lastIndexed + 1n;

  // Cap the span so a long outage doesn't blow up getLogs.
  const candidateTo = safeLatest;
  const toBlock = candidateTo - fromBlock + 1n > MAX_BLOCK_SPAN
    ? fromBlock + MAX_BLOCK_SPAN - 1n
    : candidateTo;

  if (toBlock < fromBlock) {
    return {
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      eventsFound: 0,
      inserted: 0,
      duplicates: 0,
      errors: [],
    };
  }

  const logs = await publicClient.getLogs({
    address: moduleAddress,
    event: {
      type: "event",
      name: "PoolSponsored",
      inputs: [
        { name: "tournamentId", type: "bytes32", indexed: true },
        { name: "sponsor", type: "address", indexed: true },
        { name: "amount", type: "uint256", indexed: false },
        { name: "receiptTokenId", type: "uint256", indexed: false },
      ],
    },
    fromBlock,
    toBlock,
  });

  const errors: IndexSponsorEventsResult["errors"] = [];
  const rows: PoolSponsoredRow[] = [];

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: SPONSORSHIP_MODULE_ABI,
        eventName: "PoolSponsored",
        topics: log.topics,
        data: log.data,
      });
      if (decoded.eventName !== "PoolSponsored") continue;
      const args = decoded.args as {
        tournamentId: Hex;
        sponsor: Address;
        amount: bigint;
        receiptTokenId: bigint;
      };

      // amount stored as USDC (6 decimals) → divide for human-readable numeric.
      const amountUsdc = (Number(args.amount) / 1_000_000).toFixed(6);

      rows.push({
        tournament_on_chain_id: args.tournamentId.toLowerCase(),
        sponsor_address: args.sponsor.toLowerCase(),
        amount_usdc: amountUsdc,
        receipt_token_id: args.receiptTokenId.toString(),
        tx_hash: log.transactionHash.toLowerCase(),
        log_index: Number(log.logIndex),
        block_number: log.blockNumber.toString(),
      });
    } catch (err) {
      errors.push({
        txHash: log.transactionHash,
        logIndex: Number(log.logIndex),
        message: err instanceof Error ? err.message : "decode failed",
      });
    }
  }

  let inserted = 0;
  let duplicates = 0;

  if (rows.length > 0) {
    // Single-statement upsert with ON CONFLICT DO NOTHING via supabase-js's
    // upsert(ignoreDuplicates=true). One round-trip for the whole batch.
    const { data: insertedRows, error } = await supabase
      .from("v2_sponsor_contributions")
      .upsert(rows, {
        onConflict: "tx_hash,log_index",
        ignoreDuplicates: true,
      })
      .select("tx_hash");

    if (error) {
      // Don't advance watermark on batch failure — next run will retry.
      throw new Error(`sponsor_contributions upsert failed: ${error.message}`);
    }
    inserted = insertedRows?.length ?? 0;
    duplicates = rows.length - inserted;
  }

  // Advance watermark only after successful write.
  await writeWatermark(supabase, moduleAddress, toBlock);

  return {
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    eventsFound: logs.length,
    inserted,
    duplicates,
    errors,
  };
}
