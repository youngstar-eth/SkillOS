// Upstash-backed sliding-window rate limiter (Sprint X15.5).
//
// Replaces the per-Lambda in-memory Map<> limiter that UR Pass 1 Track B C2
// flagged as cosmetic on serverless: every cold-start zeroed the counter, and
// N concurrent Lambda instances each ran their own budget — so the real
// global throughput was Nx the stated cap. Mainnet blocker until the limit
// landed in a shared store.
//
// Backing store: Upstash Redis, provisioned via the Vercel Marketplace
// integration on the `api` project. The integration uses KV-pattern env var
// names (UPSTASH_KV_REST_API_URL / UPSTASH_KV_REST_API_TOKEN) — NOT the
// @upstash/redis SDK's `fromEnv()` defaults (UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN). We construct the client explicitly so the
// naming mismatch can't go silent.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { Context } from 'hono';
import { ApiError } from '../middleware/errorEnvelope.js';

let cachedRedis: Redis | null = null;
let cachedLimiters: {
  submit: Ratelimit;
  x402: Ratelimit;
  read: Ratelimit;
} | null = null;

const getRedis = (): Redis => {
  if (cachedRedis) return cachedRedis;
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Upstash KV env missing: UPSTASH_KV_REST_API_URL and UPSTASH_KV_REST_API_TOKEN ' +
        'must be set on the Vercel api project. The Vercel Marketplace Upstash ' +
        'integration provisions these automatically — confirm the integration is ' +
        'attached to this project.',
    );
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
};

const getLimiters = () => {
  if (cachedLimiters) return cachedLimiters;
  const redis = getRedis();
  cachedLimiters = {
    // submit bucket: human /v1/scores, agent /v1/agents/scores, agent
    // /v1/agents/matches/start-solo. 30 req/min per identifier.
    submit: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 m'),
      analytics: true,
      prefix: 'ratelimit:submit',
    }),
    // x402 bucket: paid /v1/data/* routes — extra ceiling layered on top of
    // the payment gate to deter abuse where a single payer reuses a paid
    // session to scrape. 100 req/hour per IP.
    x402: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '1 h'),
      analytics: true,
      prefix: 'ratelimit:x402',
    }),
    // read bucket: free public read endpoints (/v1/ratings/*). IP-keyed,
    // 60 req/min — matches the rate the in-memory limiter enforced before
    // the Upstash swap, so existing SDK consumers see no behaviour delta
    // beyond cross-instance correctness.
    read: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      analytics: true,
      prefix: 'ratelimit:read',
    }),
  };
  return cachedLimiters;
};

export type RateLimitType = 'submit' | 'x402' | 'read';

export interface RateLimitResult {
  limit: number;
  remaining: number;
  reset: number;
}

// Pulls the best-available client identifier from request headers. The
// Vercel runtime injects x-forwarded-for; cf-connecting-ip is a secondary
// signal in case the deploy ever fronts behind Cloudflare.
export const ipFromContext = (c: Context): string => {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const cf = c.req.header('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'anonymous';
};

// Apply a rate-limit check and throw 429 if the identifier is over budget.
// Sets X-RateLimit-Reset on the response context regardless of outcome so
// clients can back off. Reset is emitted in seconds-since-epoch to match
// the prior in-memory limiter's header contract.
export async function rateLimit(
  type: RateLimitType,
  identifier: string,
  c: Context,
): Promise<RateLimitResult> {
  const limiters = getLimiters();
  const { success, limit, remaining, reset } = await limiters[type].limit(identifier);

  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(remaining));
  c.header('X-RateLimit-Reset', String(Math.floor(reset / 1000)));

  if (!success) {
    const retryAfterMs = Math.max(0, reset - Date.now());
    throw new ApiError(429, 'RATE_LIMITED', 'Rate limit exceeded — try again shortly.', {
      limit,
      remaining: 0,
      retryAfterMs,
    });
  }

  return { limit, remaining, reset };
}
