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

const MAX_RANGE = 5_000n;
const CONCURRENCY = 5;

interface ScanArgs {
  address: Address;
  abi: Abi;
  eventName: string;
  args?: Record<string, unknown>;
}

// Generic over the caller's row shape. Each route declares the event-specific
// `args` typing it expects and passes that as the `Row` type parameter; viem's
// own deep generics are too tangled to thread through a chunked wrapper, but
// at the call site the row shape is statically known from the ABI + eventName.
export async function scanContractEvents<Row>(opts: ScanArgs): Promise<Row[]> {
  const client = getPublicClient();
  const tip = await client.getBlockNumber();
  if (FROM_BLOCK > tip) return [];

  const chunks: Array<[bigint, bigint]> = [];
  for (let from = FROM_BLOCK; from <= tip; from += MAX_RANGE) {
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
