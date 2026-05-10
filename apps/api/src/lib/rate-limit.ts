// Per-wallet in-memory LRU rate limit. Sprint X2 acceptable per spec
// out-of-scope ("Production-grade rate limiting (in-memory LRU OK for X2)").
//
// Ephemeral and per-Lambda-instance — Vercel functions are short-lived, so
// limits "leak" across instances. Production-grade requires Upstash/Redis;
// deferred to Phase 2 polish. For X2 this is the soft DoS protection that
// pairs with the T0-tier trust hole in /v1/scores: without plausibility, an
// abusive bearer holder could spam scores; rate limit caps the spam rate.

const MAX_PER_WINDOW = 60; // requests
const WINDOW_MS = 60 * 1000; // 1 minute

interface Bucket {
  tokens: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED = 1000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function check(key: string): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { tokens: MAX_PER_WINDOW, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  // LRU-ish trimming: when over capacity, drop oldest expired buckets.
  if (buckets.size > MAX_TRACKED) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
      if (buckets.size <= MAX_TRACKED) break;
    }
  }

  if (bucket.tokens <= 0) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.tokens -= 1;
  return { allowed: true, remaining: bucket.tokens, resetAt: bucket.resetAt };
}
