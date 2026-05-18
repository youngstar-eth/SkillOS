// Run with: npx tsx --test packages/duel-backend/test/solo-parse-moves.test.ts
//
// X20.0a — moves instrumentation plumbing.
//
// Convention matches tournaments.test.ts + cron-settle.test.ts:
//   - node:test built-in runner
//   - node:assert/strict assertions
//   - tests target an extracted pure helper (parseMovesField) — full HTTP
//     handler coverage stays out of scope until the X20.0b formula needs it
//
// Why test the parser specifically:
//   1. The handler is one big closure with deep Supabase + viem mock surface;
//      a parser unit covers the same correctness claim with 1% of the setup.
//   2. The insert payload at solo.ts then trusts whatever the parser returns
//      (number | null) — if the parser is right and the insert column is
//      `moves`, persistence follows by typecheck. Migration plus parser
//      plus single-line insert is the full chain; testing the chain link
//      that has branching logic catches the only bug surface here.
//   3. Mirrors the pattern of preflightSponsorBalance tests — pure helper
//      first, larger seams later when there's a consumer to justify them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMovesField } from "../src/api/tournaments/solo";

// ─── Test 1 (plan §6 test 1): moves capture parses cleanly ──────────────

test("parseMovesField: valid integer passes through to insert payload", () => {
  const result = parseMovesField(42);
  assert.deepEqual(result, { ok: true, value: 42 });
});

// ─── Test 2 (plan §6 test 2): legacy compat — absent moves is fine ──────

test("parseMovesField: absent (undefined) returns null — legacy clients OK", () => {
  const result = parseMovesField(undefined);
  assert.deepEqual(result, { ok: true, value: null });
});

test("parseMovesField: explicit null returns null — equivalent to absent", () => {
  const result = parseMovesField(null);
  assert.deepEqual(result, { ok: true, value: null });
});

// ─── Boundary cases ────────────────────────────────────────────────────────

test("parseMovesField: zero is valid (game ended before first move)", () => {
  const result = parseMovesField(0);
  assert.deepEqual(result, { ok: true, value: 0 });
});

test("parseMovesField: upper-bound 1_000_000 is valid", () => {
  const result = parseMovesField(1_000_000);
  assert.deepEqual(result, { ok: true, value: 1_000_000 });
});

test("parseMovesField: above-bound rejects with invalid_moves", () => {
  const result = parseMovesField(1_000_001);
  assert.deepEqual(result, {
    ok: false,
    code: "invalid_moves",
    message: "moves must be a non-negative integer ≤ 1000000",
  });
});

test("parseMovesField: negative rejects", () => {
  const result = parseMovesField(-1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid_moves");
});

test("parseMovesField: non-integer rejects", () => {
  const result = parseMovesField(3.5);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid_moves");
});

test("parseMovesField: NaN rejects (not finite)", () => {
  const result = parseMovesField(Number.NaN);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid_moves");
});

test("parseMovesField: Infinity rejects", () => {
  const result = parseMovesField(Number.POSITIVE_INFINITY);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid_moves");
});

test("parseMovesField: string rejects (no coercion)", () => {
  const result = parseMovesField("42");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid_moves");
});
