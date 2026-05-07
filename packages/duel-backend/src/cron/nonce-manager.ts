// ───────────────────────────────────────────────────────────────────────────
// In-memory transaction nonce manager for parallel writeContract broadcasts.
//
// Background: viem's writeContract, called without an explicit `nonce`,
// internally fetches getTransactionCount(address, "pending") on every
// call. With sequential settles this is correct but wasteful. With
// parallel settles (PR #5 — p-limit(5) over the per-tournament loop),
// two concurrent writeContract calls both fetch the same pending count,
// both get the same nonce, the second tx reverts on broadcast.
//
// createNonceManager solves this with an in-memory counter:
//   1. Lazy seed: first .next() call fetches getTransactionCount(pending)
//      and caches the result.
//   2. Atomic increment: a Promise-chain mutex serializes .next() callers
//      so two concurrent .next() calls receive distinct values without a
//      race window (no microtask interleaving between read+write).
//   3. Explicit refresh: callers can force re-seed via .refresh() — used
//      ONLY between cron invocations (PR #4's v2_cron_runs lock guarantees
//      no concurrent runs within a window, so within a single run the
//      counter is the source of truth).
//
// Safety boundaries (acknowledged for PR #5):
//   - On-chain revert (e.g., TournamentAlreadySettled): the failed tx
//     STILL consumes its nonce on-chain. Counter stays in sync — no
//     refresh needed.
//   - Pre-broadcast RPC validation reject (rare on Base Sepolia): nonce
//     was reserved locally but never consumed on-chain. Counter is now
//     ahead by 1. Recovery path: lazy re-seed on the NEXT cron run's
//     fresh manager instance (lock window separation guarantees the next
//     run gets a clean instance). No mid-run auto-refresh — auto-refresh
//     during in-flight broadcasts would re-introduce the race we're
//     eliminating.
// ───────────────────────────────────────────────────────────────────────────

import type { Address } from "viem";

export interface NonceManager {
  /**
   * Reserve and return the next nonce. Pre-incremented atomically — two
   * concurrent callers receive distinct consecutive integers.
   */
  next(): Promise<number>;
  /**
   * Force a re-seed from RPC. Discards any in-progress acquisition. Use
   * only between cron runs, not mid-flight.
   */
  refresh(): Promise<void>;
}

/**
 * Minimal viem PublicClient surface — just getTransactionCount. Same
 * loose-typing rationale as CronGuardPublicClient (see settle-guard.ts):
 * viem's strict generics don't survive contravariance, so we widen the
 * mock interface to keep production assignment + tests trivial.
 */
export interface NonceManagerPublicClient {
  getTransactionCount: (args: {
    address: Address;
    blockTag?: "pending" | "latest";
  }) => Promise<number>;
}

export interface CreateNonceManagerArgs {
  publicClient: NonceManagerPublicClient;
  address: Address;
}

/**
 * Build a fresh NonceManager bound to a single signing address.
 *
 * The counter is process-local — each call to createNonceManager returns
 * an independent instance. Cron uses one per invocation (lazy seed → use
 * → discard at end of run).
 */
export function createNonceManager(args: CreateNonceManagerArgs): NonceManager {
  const { publicClient, address } = args;
  let counter: number | null = null; // null until first lazy seed
  // The mutex IS the chain: every .next()/.refresh() awaits the previous
  // one's completion before reading/writing `counter`. Promise micro-tasks
  // run atomically, so the read-modify-write inside a chained .then() is
  // race-free without any Atomics or async-mutex dep.
  let lockChain: Promise<unknown> = Promise.resolve();

  function chain<T>(work: () => Promise<T>): Promise<T> {
    const result = lockChain.then(() => work());
    // Swallow result errors on the chain — they're delivered to the caller
    // via `result`. Without this, an uncaught chain error would poison
    // every subsequent .next() with the same rejection.
    lockChain = result.catch(() => undefined);
    return result;
  }

  async function seed(): Promise<void> {
    counter = await publicClient.getTransactionCount({
      address,
      blockTag: "pending",
    });
  }

  return {
    next: () =>
      chain(async () => {
        if (counter === null) await seed();
        // counter is non-null after seed.
        const reserved = counter as number;
        counter = reserved + 1;
        return reserved;
      }),
    refresh: () =>
      chain(async () => {
        await seed();
      }),
  };
}
