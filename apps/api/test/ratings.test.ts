// X23.3 — Rating API endpoint tests.
//
// Strategy: route handlers delegate the bits that matter (DB-row → response
// mapping, pagination math, validation) to pure helpers exported from
// routes/ratings.ts. Tests target the helpers directly + use Hono's app.fetch
// pattern for validation-level rejections (matches agents-matches.test.ts).
// DB plumbing is exercised in the smoke step (scripts/x23-3-smoke.ts).
//
// Convention: node:test + node:assert/strict, matches games.test.ts.
// Run with: npx tsx --test apps/api/test/ratings.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub Supabase env so import-time getSupabaseClient lazy-load doesn't throw
// when the route module is loaded for HTTP-validation tests. The stubs are
// never actually called — tests that need DB results use the pure helpers.
process.env.SUPABASE_URL ??= 'http://supabase.test.local';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'a'.repeat(40);

const { OpenAPIHono } = await import('@hono/zod-openapi');
const {
  ratingRoutes,
  rowToRatingEntry,
  rowToLeaderboardItem,
  rowToHistoryItem,
  paginateRows,
} = await import('../src/routes/ratings.js');
const { errorHandler } = await import('../src/middleware/errorEnvelope.js');

import type {
  RatingRow,
  LeaderboardRow,
  HistoryRow,
} from '../src/routes/ratings.js';

function buildApp() {
  const app = new OpenAPIHono();
  app.route('/', ratingRoutes);
  app.onError(errorHandler);
  return app;
}

// ─── 1. getRatings_ValidWallet_ReturnsList — happy-path mapper ────────────

test('rowToRatingEntry: DB row maps to response shape with numeric coercion', () => {
  const row: RatingRow = {
    game: '2048',
    class: 'human',
    rating: '1081.9', // Supabase numeric type returns strings; verify coercion
    rd: '312.4',
    volatility: '0.0599',
    updates_count: 3,
    updated_at: '2026-05-18T14:32:00.000Z',
  };
  const entry = rowToRatingEntry(row);
  assert.equal(entry.game, '2048');
  assert.equal(entry.class, 'human');
  assert.equal(entry.rating, 1081.9);
  assert.equal(entry.rd, 312.4);
  assert.equal(entry.volatility, 0.0599);
  assert.equal(entry.updatesCount, 3);
  assert.equal(entry.lastUpdate, '2026-05-18T14:32:00.000Z');
});

// ─── 2. getRatings_InvalidWalletFormat_Returns422 — Zod validation gate ──

test('GET /v1/ratings/{wallet}: malformed wallet → 422', async () => {
  const app = buildApp();
  const res = await app.request('/v1/ratings/not-a-wallet');
  assert.equal(
    res.status,
    422,
    `expected 422 for malformed wallet, got ${res.status}: ${await res.text()}`,
  );
});

// ─── 3. getRatings_UnknownWallet_ReturnsEmptyArray — mapper over [] ──────

test('rowToRatingEntry: empty DB result maps to empty response array', () => {
  const rows: RatingRow[] = [];
  const mapped = rows.map(rowToRatingEntry);
  assert.deepEqual(mapped, []);
});

// ─── 4. getHistory_WalletWithMultipleMatches_OrderedDescending ───────────

test('rowToHistoryItem: maps before/after columns and preserves caller-ordered sequence', () => {
  // DB driver returns rows in caller-specified order; mapper preserves it.
  // We verify the descending order contract by passing rows in expected order
  // and asserting the mapped output retains it.
  const rows: HistoryRow[] = [
    {
      game: '2048',
      class: 'human',
      rating_before: 1050,
      rating_after: 1081.9,
      rd_before: 320,
      rd_after: 312.4,
      tournament_id: '11111111-1111-1111-1111-111111111111',
      matches_count: 4,
      recorded_at: '2026-05-18T14:32:00.000Z', // newest
    },
    {
      game: '2048',
      class: 'human',
      rating_before: 1000,
      rating_after: 1050,
      rd_before: 350,
      rd_after: 320,
      tournament_id: '22222222-2222-2222-2222-222222222222',
      matches_count: 3,
      recorded_at: '2026-05-15T09:00:00.000Z', // older
    },
  ];
  const mapped = rows.map(rowToHistoryItem);
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].recordedAt, '2026-05-18T14:32:00.000Z');
  assert.equal(mapped[1].recordedAt, '2026-05-15T09:00:00.000Z');
  // The mapper preserves the input order — descending recordedAt is the
  // route handler's responsibility (SQL ORDER BY recorded_at DESC).
  assert.ok(
    mapped[0].recordedAt > mapped[1].recordedAt,
    'recordedAt ordering must be preserved by mapper',
  );
  // Before/after field mapping is correct
  assert.equal(mapped[0].ratingBefore, 1050);
  assert.equal(mapped[0].ratingAfter, 1081.9);
  assert.equal(mapped[0].rdBefore, 320);
  assert.equal(mapped[0].rdAfter, 312.4);
  assert.equal(mapped[0].matchesCount, 4);
  assert.equal(mapped[0].tournamentId, '11111111-1111-1111-1111-111111111111');
});

// ─── 5. getHistory_GameFilter — validation rejects bad class enum ─────────

test('GET /v1/ratings/history/{wallet}?class=mixed: rejects out-of-enum class → 422', async () => {
  const app = buildApp();
  const wallet = '0xbC532a4500000000000000000000000000000000';
  // X14.0 schema lock restricts class to ('human','agent'). The history
  // endpoint's class query param uses the same enum, so any out-of-domain
  // value (e.g. the dropped 'mixed-declared' candidate) must reject at
  // validation, not silently filter to an empty set.
  const res = await app.request(
    `/v1/ratings/history/${wallet}?game=2048&class=mixed`,
  );
  assert.equal(
    res.status,
    422,
    `expected 422 for invalid class enum, got ${res.status}: ${await res.text()}`,
  );
});

// ─── 6. getHistory_Pagination_OffsetWorks — cursor emit/skip semantics ───

test('paginateRows: emits next cursor when extra peek-row present, otherwise undefined', () => {
  const limit = 20;
  const start = 0;

  // Case A: exactly limit rows fetched (no peek-extra) → no next cursor.
  const filled = Array.from({ length: limit }, (_, i) => ({ i }));
  const a = paginateRows(filled, limit, start);
  assert.equal(a.slice.length, limit, 'slice should be exactly limit when no extra');
  assert.equal(a.next, undefined, 'no next cursor when no extra row');

  // Case B: limit+1 rows fetched (peek-extra) → next cursor present, slice trimmed.
  const overfull = Array.from({ length: limit + 1 }, (_, i) => ({ i }));
  const b = paginateRows(overfull, limit, start);
  assert.equal(b.slice.length, limit, 'slice trimmed to limit when peek-extra present');
  assert.ok(b.next, 'next cursor emitted when peek-extra present');
  assert.ok(typeof b.next === 'string', 'next cursor is opaque string');

  // Case C: offset honored — start=20, limit=20 produces a cursor pointing at 40.
  const offsetCase = paginateRows(overfull, limit, 20);
  assert.ok(offsetCase.next, 'cursor present with non-zero start');
  // Cursor is opaque base64url; we can't decode it without the decoder, but
  // we can verify it's different from start=0's cursor.
  assert.notEqual(
    offsetCase.next,
    b.next,
    'cursor for offset=20 differs from offset=0',
  );
});

// ─── 7. getLeaderboard_OrderedByRatingDesc — mapper rank derivation ──────

test('rowToLeaderboardItem: rank parameter threads through, preserves caller-ordered sequence', () => {
  // DB returns rows ordered by rating DESC; route assigns rank = start+i+1.
  // We verify the mapper applies the rank as-given without re-deriving from
  // the row's rating value (route owns the rank math, not the mapper).
  const rows: LeaderboardRow[] = [
    {
      wallet: '0xB3696dF0000000000000000000000000000000F0',
      rating: 1401.5,
      rd: 200,
      volatility: 0.06,
      updated_at: '2026-05-18T12:00:00.000Z',
    },
    {
      wallet: '0xbC532a4500000000000000000000000000000000',
      rating: 1081.9,
      rd: 312.4,
      volatility: 0.0599,
      updated_at: '2026-05-18T14:32:00.000Z',
    },
  ];
  // First page (start=0): ranks 1, 2.
  const page1 = rows.map((r, i) => rowToLeaderboardItem(r, 0 + i + 1));
  assert.equal(page1[0].rank, 1);
  assert.equal(page1[0].rating, 1401.5);
  assert.equal(page1[1].rank, 2);
  assert.equal(page1[1].rating, 1081.9);
  // Ordering invariant: rating descends across the array.
  assert.ok(
    page1[0].rating > page1[1].rating,
    'rating must descend across mapped rankings',
  );

  // Second page (start=20): ranks 21, 22 — proves rank derivation is offset-aware.
  const page2 = rows.map((r, i) => rowToLeaderboardItem(r, 20 + i + 1));
  assert.equal(page2[0].rank, 21);
  assert.equal(page2[1].rank, 22);
});

// ─── 8. getLeaderboard_ClassFilter — validation enforces required class ──

test('GET /v1/ratings/leaderboard: missing required class param → 422 with class-not-wallet error', async () => {
  const app = buildApp();
  // SPEC §E locks class as a required query param to enforce cohort isolation.
  // Omitting it must reject at validation, not default to "any class" (which
  // would cross the human/agent boundary the rating system invariantly avoids).
  //
  // Regression guard: prior to the route-registration-order fix, this URL
  // was matched against `/v1/ratings/{wallet}` first (Hono radix-tree
  // matched the dynamic param), and the WalletAddressSchema rejected
  // "leaderboard" with a wallet-regex error. The status code was the same
  // (422), so a plain status assertion would have masked the bug. We now
  // assert the validation issue path is `class` or `game` (leaderboard's
  // query schema), NOT `wallet` (the dynamic-route param schema).
  const res = await app.request('/v1/ratings/leaderboard?game=2048');
  const bodyText = await res.text();
  assert.equal(
    res.status,
    422,
    `expected 422 when class omitted, got ${res.status}: ${bodyText}`,
  );
  const body = JSON.parse(bodyText) as {
    error: { details: Array<{ path: string[] }> };
  };
  const paths = body.error.details.flatMap((d) => d.path);
  assert.ok(
    !paths.includes('wallet'),
    `validation error must not mention "wallet" — that would indicate the leaderboard URL was incorrectly routed to /v1/ratings/{wallet}. Paths: ${paths.join(',')}`,
  );
  assert.ok(
    paths.includes('class'),
    `validation error must mention "class" — that's the missing required field. Paths: ${paths.join(',')}`,
  );
});

test('GET /v1/ratings/leaderboard: invalid class enum → 422', async () => {
  const app = buildApp();
  const res = await app.request(
    '/v1/ratings/leaderboard?game=2048&class=robot',
  );
  assert.equal(
    res.status,
    422,
    `expected 422 for invalid class enum, got ${res.status}: ${await res.text()}`,
  );
});
