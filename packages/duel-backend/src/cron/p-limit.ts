// ───────────────────────────────────────────────────────────────────────────
// Native concurrency limiter — bounded "in-flight" promise gate.
//
// Same surface as the popular `p-limit` package: createLimit(N) returns
// a function that wraps an async producer and runs at most N concurrently.
// Excess callers queue and resolve in submission order.
//
// Why native vs the package: duel-backend is intentionally lean (only
// @skillos/* internals + @vercel/functions + viem). Adding a runtime
// dep for ~15 lines of well-understood pattern fails the cost/benefit
// test, especially when the pattern is small enough to read end-to-end.
//
// Pattern:
//   - active: count of currently-running tasks
//   - queue:  FIFO of suspended runners awaiting a slot
//   - On task complete: decrement active, drain one queued runner.
// ───────────────────────────────────────────────────────────────────────────

export type LimitFn = <T>(producer: () => Promise<T>) => Promise<T>;

/**
 * Build a concurrency limiter capped at maxConcurrent in-flight tasks.
 *
 * @example
 *   const limit = createLimit(5);
 *   const results = await Promise.all(
 *     items.map((item) => limit(() => processItem(item))),
 *   );
 */
export function createLimit(maxConcurrent: number): LimitFn {
  if (maxConcurrent < 1 || !Number.isInteger(maxConcurrent)) {
    throw new Error(
      `createLimit: maxConcurrent must be a positive integer, got ${maxConcurrent}`,
    );
  }

  let active = 0;
  const queue: Array<() => void> = [];

  function next(): void {
    active--;
    const runner = queue.shift();
    if (runner !== undefined) runner();
  }

  return <T>(producer: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = (): void => {
        active++;
        // .finally(next) runs after the producer's promise settles —
        // success OR failure both decrement active + drain one queued
        // runner. Errors propagate to the awaiter via reject().
        producer()
          .then(resolve, reject)
          .finally(next);
      };
      if (active < maxConcurrent) {
        run();
      } else {
        queue.push(run);
      }
    });
}
