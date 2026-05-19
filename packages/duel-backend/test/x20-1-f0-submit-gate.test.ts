// Run with: npx tsx --test packages/duel-backend/test/x20-1-f0-submit-gate.test.ts
//
// X20.1 — F0 plausibility formula gate at solo submit.
//
// Convention matches solo-parse-moves.test.ts:
//   - node:test built-in runner
//   - node:assert/strict assertions
//   - tests target the extracted pure helper `evaluateF0Gate` — the full
//     HTTP handler closure (Supabase + viem mock surface) stays out of
//     scope; this gate is one branch with deterministic inputs.
//
// Coefficient assumptions (X20.0b @skillos/anti-cheat COEFFICIENTS for 2048):
//   min_duration_per_move_ms = 100
//   max_score_per_move       = 50
//   min_moves                = 10
//   max_moves                = 50_000
//
// 2048 plausible baseline: 200 moves, 180s, score 4096
//   duration/move = 900ms  (≥ 100)
//   score/move    = 20.48  (≤ 50)
//   moves         = 200    (∈ [10, 50000])

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateF0Gate } from "../src/api/tournaments/solo";

// ─── Plausible path ────────────────────────────────────────────────────────

test("evaluateF0Gate: plausible 2048 submit (200/180s/4096) → ok", () => {
  const result = evaluateF0Gate({
    game: "2048",
    moves: 200,
    durationSeconds: 180,
    score: 4096,
  });
  assert.deepEqual(result, { ok: true });
});

test("evaluateF0Gate: plausible wordle submit (5/120s/120) → ok", () => {
  // wordle: min_duration_per_move_ms=200, max_score_per_move=100, moves∈[1,6]
  // 120000ms / 5 moves = 24000ms/move ≥ 200; 120/5 = 24 ≤ 100; 5 ∈ [1, 6]
  const result = evaluateF0Gate({
    game: "wordle",
    moves: 5,
    durationSeconds: 120,
    score: 120,
  });
  assert.deepEqual(result, { ok: true });
});

// ─── Implausible — duration axis ───────────────────────────────────────────

test("evaluateF0Gate: implausible duration (200moves/1s/4096) → reject", () => {
  // 1000ms / 200 = 5ms/move — below 100ms floor
  const result = evaluateF0Gate({
    game: "2048",
    moves: 200,
    durationSeconds: 1,
    score: 4096,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /duration\/move/);
  }
});

// ─── Implausible — score axis ──────────────────────────────────────────────

test("evaluateF0Gate: implausible score (200moves/180s/999999) → reject", () => {
  // 999999 / 200 = 4999.99 score/move — far above 50 ceiling
  const result = evaluateF0Gate({
    game: "2048",
    moves: 200,
    durationSeconds: 180,
    score: 999999,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /score\/move/);
  }
});

// ─── Implausible — moves axis ──────────────────────────────────────────────

test("evaluateF0Gate: implausible moves above bound (60_000 in 2048) → reject", () => {
  // 60_000 > max_moves=50_000 for 2048. Tune duration so duration/move and
  // score/move pass — isolate the moves-axis failure.
  // 60000 moves @ 200ms/move = 12_000_000ms = 12000s; score 60000*40 = 2_400_000
  const result = evaluateF0Gate({
    game: "2048",
    moves: 60_000,
    durationSeconds: 12_000,
    score: 2_400_000,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /moves/);
  }
});

test("evaluateF0Gate: implausible moves below bound (5 in 2048) → reject", () => {
  // 5 < min_moves=10 for 2048. score/move=2, duration/move=200ms — pass.
  const result = evaluateF0Gate({
    game: "2048",
    moves: 5,
    durationSeconds: 1,
    score: 10,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /moves/);
  }
});

// ─── Edge case — exactly at thresholds ─────────────────────────────────────

test("evaluateF0Gate: edge 2048 — moves at min, score/move and duration/move at limits → ok", () => {
  // moves = 10 (min), duration = 1s (10 moves × 100ms = 1000ms exactly at
  // floor — strict less-than rejects below, so 100ms passes), score = 500
  // (10 × 50 = max score/move, strict greater-than rejects above).
  const result = evaluateF0Gate({
    game: "2048",
    moves: 10,
    durationSeconds: 1,
    score: 500,
  });
  assert.deepEqual(result, { ok: true });
});

// ─── Legacy bypass — moves null ────────────────────────────────────────────

test("evaluateF0Gate: legacy submit (moves=null) → ok regardless of other axes", () => {
  // Pre-X20.0a clients don't send `moves`. The handler parses to null and
  // the row persists with NULL — formula skips. Even a score that would
  // otherwise reject must pass-through here.
  const result = evaluateF0Gate({
    game: "2048",
    moves: null,
    durationSeconds: 1,
    score: 999999,
  });
  assert.deepEqual(result, { ok: true });
});
