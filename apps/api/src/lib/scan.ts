// Chunked event scanner.
//
// Public Base Sepolia RPC caps eth_getLogs at 10,000 blocks per call. Our
// scan range (deploy-block → tip) exceeds that, so we split into chunks and
// run them in bounded-parallel batches.
//
// Sized intentionally smaller than the cap (5k blocks) to leave headroom for
// chains that tighten the limit, and CONCURRENCY=5 to avoid getting rate
// limited on the public RPC.
//
// Latency: ~120 chunks × ~150ms / 5-parallel ≈ 3-4s for full-range scans on
// cold cache. Acceptable for Sprint X1 read traffic; a premium RPC URL via
// BASE_SEPOLIA_RPC_URL env var or a real indexer is the production path.

import type { Abi, Address } from 'viem';
import { FROM_BLOCK, getPublicClient } from './viem.js';

// Public Base Sepolia RPC tightened limits as of 2026-05-10:
//   - eth_getLogs max range: 2000 blocks (was 10k)
//   - rate-limits aggressively on >5 parallel requests
// Set range to the documented cap (2000) and drop concurrency to 3 to stay
// under the rate ceiling. Total scan latency: ~275 chunks @ 3 parallel ≈ 25s
// for full deploy-to-tip range, just under the 30s function timeout. A
// proper indexer (post-YC backlog item project_post_yc_tournament_created_indexer)
// retires this entire workaround.
const MAX_RANGE = 2_000n;
const CONCURRENCY = 3;

interface ScanArgs {
  address: Address;
  abi: Abi;
  eventName: string;
  args?: Record<string, unknown>;
  /**
   * Lower bound (inclusive). Defaults to FROM_BLOCK (the contract deploy
   * block). The leaderboard route passes a per-tournament floor so the scan is
   * bounded to the freshness gap rather than re-scanning the whole deploy→tip
   * range on every request — the latter is what produced the opaque 500s under
   * the public RPC's tightened getLogs limits (Fix #4a-S4).
   */
  fromBlock?: bigint;
  /**
   * Upper bound (inclusive). Defaults to the current chain tip. Passing a tip
   * the caller already fetched saves one RPC round-trip and lets the caller log
   * the exact [floor, tip] window on failure.
   */
  toBlock?: bigint;
}

// Generic over the caller's row shape. Each route declares the event-specific
// `args` typing it expects and passes that as the `Row` type parameter; viem's
// own deep generics are too tangled to thread through a chunked wrapper, but
// at the call site the row shape is statically known from the ABI + eventName.
export async function scanContractEvents<Row>(opts: ScanArgs): Promise<Row[]> {
  const client = getPublicClient();
  const from0 = opts.fromBlock ?? FROM_BLOCK;
  const tip = opts.toBlock ?? (await client.getBlockNumber());
  if (from0 > tip) return [];

  const chunks: Array<[bigint, bigint]> = [];
  for (let from = from0; from <= tip; from += MAX_RANGE) {
    const to = from + MAX_RANGE - 1n > tip ? tip : from + MAX_RANGE - 1n;
    chunks.push([from, to]);
  }

  const out: Row[] = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(([fromBlock, toBlock]) =>
        client.getContractEvents({
          address: opts.address,
          abi: opts.abi,
          eventName: opts.eventName,
          args: opts.args,
          fromBlock,
          toBlock,
        } as Parameters<typeof client.getContractEvents>[0]),
      ),
    );
    for (const events of batchResults) out.push(...(events as Row[]));
  }

  return out;
}
