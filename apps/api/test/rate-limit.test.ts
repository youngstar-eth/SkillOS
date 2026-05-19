// X15.5 — Upstash-backed rate-limit tests.
//
// Convention: node:test + node:assert/strict, matches charge-retry-fee.test.ts.
// Run with: npx tsx --test apps/api/test/rate-limit.test.ts
//
// Test strategy: pure helpers (ipFromContext) + env-not-set error path are
// unit-tested with no network. The actual sliding-window behaviour lives in
// the @upstash/ratelimit SDK; integration tests are env-gated on
// UPSTASH_KV_REST_API_URL/TOKEN and skip cleanly when the credentials are
// absent (CI without secrets), per gate-respect rule "use Upstash test DB
// with env-gated skip flag".

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Header stub used across pure-helper tests. Returns headers from a
// case-insensitive map (Hono's c.req.header is case-insensitive in practice).
function makeContext(headers: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const setHeaders: Record<string, string> = {};
  return {
    req: {
      header: (k: string) => lower[k.toLowerCase()],
    },
    header: (k: string, v: string) => {
      setHeaders[k] = v;
    },
    _setHeaders: setHeaders,
  };
}

// ─── ipFromContext: header precedence ─────────────────────────────────────

test('ipFromContext: x-forwarded-for first token wins', async () => {
  const { ipFromContext } = await import('../src/lib/rate-limit.js');
  const c = makeContext({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' });
  assert.equal(ipFromContext(c as never), '203.0.113.7');
});

test('ipFromContext: cf-connecting-ip fallback when xff absent', async () => {
  const { ipFromContext } = await import('../src/lib/rate-limit.js');
  const c = makeContext({ 'cf-connecting-ip': '198.51.100.4' });
  assert.equal(ipFromContext(c as never), '198.51.100.4');
});

test('ipFromContext: anonymous when no headers present', async () => {
  const { ipFromContext } = await import('../src/lib/rate-limit.js');
  const c = makeContext({});
  assert.equal(ipFromContext(c as never), 'anonymous');
});

test('ipFromContext: xff takes precedence over cf-connecting-ip', async () => {
  const { ipFromContext } = await import('../src/lib/rate-limit.js');
  const c = makeContext({
    'x-forwarded-for': '203.0.113.7',
    'cf-connecting-ip': '198.51.100.4',
  });
  assert.equal(ipFromContext(c as never), '203.0.113.7');
});

// ─── rateLimit: env-not-set error path ────────────────────────────────────

test('rateLimit throws clear error when Upstash env unset', async () => {
  // Module-level singletons cache the Redis client on first use. To make
  // this test deterministic regardless of suite order, we clear the env,
  // then re-import via the cache-busting query string trick. tsx supports
  // query-string-based module identity for dynamic imports.
  const prevUrl = process.env.UPSTASH_KV_REST_API_URL;
  const prevTok = process.env.UPSTASH_KV_REST_API_TOKEN;
  delete process.env.UPSTASH_KV_REST_API_URL;
  delete process.env.UPSTASH_KV_REST_API_TOKEN;
  try {
    const mod = await import('../src/lib/rate-limit.js?env-unset' as string);
    const c = makeContext({});
    await assert.rejects(
      async () => mod.rateLimit('submit', 'wallet', c as never),
      /Upstash KV env missing/,
    );
  } finally {
    if (prevUrl !== undefined) process.env.UPSTASH_KV_REST_API_URL = prevUrl;
    if (prevTok !== undefined) process.env.UPSTASH_KV_REST_API_TOKEN = prevTok;
  }
});

// ─── Integration: env-gated, hits real Upstash ────────────────────────────

const haveUpstash =
  !!process.env.UPSTASH_KV_REST_API_URL && !!process.env.UPSTASH_KV_REST_API_TOKEN;
const integration = haveUpstash ? test : test.skip;

integration('integration: submit bucket allows below ceiling then 429s', async () => {
  const { rateLimit } = await import('../src/lib/rate-limit.js');
  // Use a unique identifier per test run so we don't collide with prior runs.
  const uniq = `test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const c = makeContext({});

  // submit bucket = 30 req/min/identifier. Burn 30, then expect 31st to throw.
  for (let i = 0; i < 30; i++) {
    await rateLimit('submit', uniq, c as never);
  }
  await assert.rejects(
    async () => rateLimit('submit', uniq, c as never),
    (err: { status?: number; code?: string }) =>
      err.status === 429 && err.code === 'RATE_LIMITED',
  );
});

integration('integration: x402 bucket has its own counter (cross-bucket isolation)', async () => {
  const { rateLimit } = await import('../src/lib/rate-limit.js');
  const uniq = `test:isolate:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const c = makeContext({});
  // The same identifier in submit and x402 buckets should NOT share counters
  // (different prefix). 30 submits + 30 x402 calls = no rejection.
  for (let i = 0; i < 30; i++) {
    await rateLimit('submit', uniq, c as never);
  }
  for (let i = 0; i < 30; i++) {
    await rateLimit('x402', uniq, c as never);
  }
  // No throws above = success. One more call in either should still be fine
  // for x402 (100/hr ceiling not reached).
  const result = await rateLimit('x402', uniq, c as never);
  assert.equal(typeof result.limit, 'number');
  assert.ok(result.remaining >= 0);
});

integration('integration: per-identifier isolation (wallet A burst does not affect wallet B)', async () => {
  const { rateLimit } = await import('../src/lib/rate-limit.js');
  const baseId = `test:isolate:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const walletA = `${baseId}:A`;
  const walletB = `${baseId}:B`;
  const c = makeContext({});

  // Burn 30 on wallet A.
  for (let i = 0; i < 30; i++) {
    await rateLimit('submit', walletA, c as never);
  }
  // Wallet B should still have a full budget.
  const result = await rateLimit('submit', walletB, c as never);
  assert.equal(result.limit, 30);
  // remaining is 29 (after the first call we just made on B), not 0.
  assert.ok(result.remaining >= 28, `wallet B remaining=${result.remaining}, expected >= 28`);
});

integration('integration: read bucket has 60/min ceiling (matches pre-migration rate)', async () => {
  const { rateLimit } = await import('../src/lib/rate-limit.js');
  const uniq = `test:read:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const c = makeContext({});
  const result = await rateLimit('read', uniq, c as never);
  assert.equal(result.limit, 60, 'read bucket should be 60/min');
});

integration('integration: response headers set on success', async () => {
  const { rateLimit } = await import('../src/lib/rate-limit.js');
  const uniq = `test:hdrs:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const c = makeContext({});
  await rateLimit('submit', uniq, c as never);
  assert.equal(c._setHeaders['X-RateLimit-Limit'], '30');
  assert.ok(c._setHeaders['X-RateLimit-Remaining'] !== undefined);
  assert.ok(c._setHeaders['X-RateLimit-Reset'] !== undefined);
});
