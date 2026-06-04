// Fix #4a-S4 — tournaments route DB-primary helpers.
//
// Strategy mirrors ratings.test.ts (X23.3): the route handlers delegate the
// bits that matter — DB-row → response mapping, dedup/sort/rank, tail-scan
// floor math — to pure helpers exported from routes/tournaments.ts. Tests
// target those helpers directly; the live DB + on-chain tail plumbing is
// exercised end-to-end by the post-deploy curl in the PR (and scripts smoke).
//
// Convention: node:test + node:assert/strict, matches games.test.ts.
// Run with: npx tsx --test apps/api/test/tournaments.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub Supabase env so import-time getSupabaseClient lazy-load doesn't throw
// when the route module is imported (the stubs are never actually called —
// these tests only exercise pure helpers).
process.env.SUPABASE_URL ??= 'http://supabase.test.local';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'a'.repeat(40);

const {
  dbRowToScore,
  mergeScores,
  compareScores,
  paginateLeaderboard,
  computeTailFloor,
  dbRowToTournament,
} = await import('../src/routes/tournaments.js');

import type {
  NormalizedScore,
  ScoreDbRow,
  TournamentDbRow,
} from '../src/routes/tournaments.js';

// ─── helpers ──────────────────────────────────────────────────────────────

function dbRow(over: Partial<ScoreDbRow> = {}): ScoreDbRow {
  return {
    player_address: '0x1111111111111111111111111111111111111111',
    score: '100',
    block_number: 42_000_000,
    log_index: 0,
    tx_hash: '0xaaaa',
    block_timestamp: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

// ─── dbRowToScore ───────────────────────────────────────────────────────────

test('dbRowToScore: maps DB row and preserves full numeric precision as string', () => {
  const huge = '115792089237316195423570985008687907853269984665640564039457584007913129639935'; // 2^256-1
  const s = dbRowToScore(dbRow({ score: huge, block_number: '42279064' }));
  assert.equal(s.scoreStr, huge); // string carried through, no Number() coercion
  assert.equal(s.score, BigInt(huge)); // bigint for sorting
  assert.equal(s.blockNumber, 42279064n); // string block_number → bigint
  assert.equal(s.timestamp, Math.floor(Date.parse('2026-06-01T00:00:00.000Z') / 1000));
});

// ─── compareScores: score desc, block asc, log asc ─────────────────────────

test('compareScores: score DESC, then block ASC, then logIndex ASC', () => {
  const mk = (score: bigint, block: bigint, log: number): NormalizedScore => ({
    player: '0x1111111111111111111111111111111111111111',
    score,
    scoreStr: score.toString(),
    blockNumber: block,
    logIndex: log,
    txHash: '0xtx',
    timestamp: 0,
  });
  // Higher score first.
  assert.ok(compareScores(mk(200n, 1n, 0), mk(100n, 1n, 0)) < 0);
  // Equal score → earlier block wins.
  assert.ok(compareScores(mk(100n, 1n, 0), mk(100n, 2n, 0)) < 0);
  // Equal score + block → lower logIndex wins.
  assert.ok(compareScores(mk(100n, 1n, 0), mk(100n, 1n, 5)) < 0);
});

// ─── mergeScores: dedup by (tx_hash, log_index), then sort ──────────────────

test('mergeScores: dedups overlapping tail events against DB rows (case-insensitive tx)', () => {
  const db = [dbRowToScore(dbRow({ score: '10', tx_hash: '0xABC', log_index: 1 }))];
  // Same event as DB row but tail reports tx hash upper-case → must dedup.
  const tail = [
    dbRowToScore(dbRow({ score: '10', tx_hash: '0xabc', log_index: 1 })),
    dbRowToScore(dbRow({ score: '50', tx_hash: '0xdef', log_index: 0 })),
  ];
  const merged = mergeScores(db, tail);
  assert.equal(merged.length, 2); // the duplicate collapsed
  assert.equal(merged[0].scoreStr, '50'); // higher score first
  assert.equal(merged[1].scoreStr, '10');
});

test('mergeScores: 3-entry ranking is correct (the PR end-to-end ranking case)', () => {
  const rows = [
    dbRowToScore(dbRow({ score: '2244', block_number: 5, log_index: 0, tx_hash: '0x1' })),
    dbRowToScore(dbRow({ score: '900', block_number: 3, log_index: 0, tx_hash: '0x2' })),
    dbRowToScore(dbRow({ score: '900', block_number: 7, log_index: 0, tx_hash: '0x3' })),
  ];
  const merged = mergeScores(rows, []);
  assert.deepEqual(
    merged.map((m) => m.scoreStr),
    ['2244', '900', '900'],
  );
  // Tie on 900 → earlier block (3) before later block (7).
  assert.equal(merged[1].blockNumber, 3n);
  assert.equal(merged[2].blockNumber, 7n);
});

// ─── paginateLeaderboard: rank + cursor semantics ───────────────────────────

test('paginateLeaderboard: assigns 1-based rank across pages and signals nextStart', () => {
  const sorted = Array.from({ length: 5 }, (_, i) =>
    dbRowToScore(dbRow({ score: String(500 - i * 10), tx_hash: `0x${i}`, log_index: i })),
  );
  const p1 = paginateLeaderboard(sorted, 0, 2);
  assert.deepEqual(p1.items.map((i) => i.rank), [1, 2]);
  assert.equal(p1.nextStart, 2);

  const p2 = paginateLeaderboard(sorted, 2, 2);
  assert.deepEqual(p2.items.map((i) => i.rank), [3, 4]);
  assert.equal(p2.nextStart, 4);

  const p3 = paginateLeaderboard(sorted, 4, 2);
  assert.deepEqual(p3.items.map((i) => i.rank), [5]);
  assert.equal(p3.nextStart, null); // last page → no cursor
});

// ─── computeTailFloor: creation_block ?? FROM_BLOCK, tightened by watermark ──

test('computeTailFloor: no watermark → creation_block_number', () => {
  assert.equal(computeTailFloor(42279064n, null, 40851426n), 42279064n);
});

test('computeTailFloor: no creation_block → FROM_BLOCK fallback', () => {
  assert.equal(computeTailFloor(null, null, 40851426n), 40851426n);
});

test('computeTailFloor: watermark+1 tightens the floor to the freshness gap', () => {
  // watermark (42,376,541) is ahead of creation → scan only watermark+1..tip
  assert.equal(computeTailFloor(42279064n, 42376541n, 40851426n), 42376542n);
});

test('computeTailFloor: brand-new tournament created after watermark keeps creation floor', () => {
  // creation ahead of watermark → don't rewind below creation
  assert.equal(computeTailFloor(42500000n, 42376541n, 40851426n), 42500000n);
});

// ─── dbRowToTournament: same mapping LIST uses, with injected participantsCount

function tournamentRow(over: Partial<TournamentDbRow> = {}): TournamentDbRow {
  return {
    on_chain_id: '0x400e64484294f7965bc028cf3ff85c999d360deb1350e5f6f028b5fa0da5b7e5',
    game: '2048',
    cycle_type: 'weekly',
    starts_at: '2026-06-01T00:00:00.000Z',
    ends_at: '2026-06-08T00:00:00.000Z',
    prize_pool_usdc: '1.000000',
    participation_bonus: 50,
    sponsor_address: '0xA24f9122568e98b72f4dDD61119C7D92D0975692',
    settled_at: null,
    tournament_class: null,
    ...over,
  };
}

test('dbRowToTournament: maps DB row to API shape, cycle_type → enum, USDC → base units', () => {
  const t = dbRowToTournament(tournamentRow(), 3);
  assert.equal(t.id, '0x400e64484294f7965bc028cf3ff85c999d360deb1350e5f6f028b5fa0da5b7e5');
  assert.equal(t.game, '2048');
  assert.equal(t.cycleType, 1); // weekly → 1
  assert.equal(t.prizePool, '1000000'); // 1.0 USDC → 1e6 base units
  assert.equal(t.participationBonus, '50');
  assert.equal(t.settled, false); // settled_at null
  assert.equal(t.participantsCount, 3); // injected (on-chain freshness)
  assert.equal(t.tournamentClass, 'mixed-declared'); // null → default
});

test('dbRowToTournament: settled_at set → settled true; participantsCount 0 when chain unavailable', () => {
  const t = dbRowToTournament(tournamentRow({ settled_at: '2026-06-09T00:00:00.000Z', tournament_class: 'agent-only' }), 0);
  assert.equal(t.settled, true);
  assert.equal(t.participantsCount, 0);
  assert.equal(t.tournamentClass, 'agent-only');
});
