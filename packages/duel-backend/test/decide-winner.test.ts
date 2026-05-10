// Run with: npx tsx --test packages/duel-backend/test/decide-winner.test.ts
//
// Unit tests for the shared decideWinner module. Both settle.ts (hot
// path) and api/admin/reconcile.ts (lie-state repair) call this function;
// keeping its semantics pinned by tests prevents silent drift between the
// two callers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "viem";
import { decideWinner } from "../src/decide-winner";
import type { Duel } from "@skillos/game-types";

const P1 = getAddress("0x000000000000000000000000000000000000cafe");
const P2 = getAddress("0x000000000000000000000000000000000000beef");

function makeDuel(overrides: Partial<Duel> = {}): Duel {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    onchain_id: "0x" + "ab".repeat(32),
    status: "settled",
    player1_address: P1,
    player1_score: null,
    player1_submitted_at: null,
    player2_address: P2,
    player2_score: null,
    player2_submitted_at: null,
    seed: "0x" + "00".repeat(32),
    stake_amount_usdc: 1_000_000,
    matched_at: "2026-05-07T00:00:00.000Z",
    settled_at: null,
    winner_address: null,
    create_tx_hash: null,
    accept_tx_hash: null,
    settle_tx_hash: null,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: null,
    ...overrides,
  };
}

// ─── Score-comparison branch ──────────────────────────────────────────────

test("decideWinner: p1 score higher → p1 wins", () => {
  const d = makeDuel({
    player1_score: 100,
    player2_score: 50,
    player1_submitted_at: "2026-05-07T00:01:00.000Z",
    player2_submitted_at: "2026-05-07T00:00:30.000Z",
  });
  assert.equal(decideWinner(d), P1);
});

test("decideWinner: p2 score higher → p2 wins (regardless of timestamp)", () => {
  const d = makeDuel({
    player1_score: 50,
    player2_score: 100,
    // p1 submitted earlier — irrelevant when scores differ
    player1_submitted_at: "2026-05-07T00:00:30.000Z",
    player2_submitted_at: "2026-05-07T00:01:00.000Z",
  });
  assert.equal(decideWinner(d), P2);
});

// ─── Tie → earlier-submission branch ──────────────────────────────────────

test("decideWinner: tied score, p1 submitted earlier → p1 wins", () => {
  const d = makeDuel({
    player1_score: 75,
    player2_score: 75,
    player1_submitted_at: "2026-05-07T00:00:30.000Z",
    player2_submitted_at: "2026-05-07T00:00:45.000Z",
  });
  assert.equal(decideWinner(d), P1);
});

test("decideWinner: tied score, p2 submitted earlier → p2 wins", () => {
  const d = makeDuel({
    player1_score: 75,
    player2_score: 75,
    player1_submitted_at: "2026-05-07T00:00:45.000Z",
    player2_submitted_at: "2026-05-07T00:00:30.000Z",
  });
  assert.equal(decideWinner(d), P2);
});

test("decideWinner: tied score, equal timestamps → p1 wins (deterministic)", () => {
  // Documents the millisecond-collision behavior. t1 <= t2 → p1.
  const d = makeDuel({
    player1_score: 75,
    player2_score: 75,
    player1_submitted_at: "2026-05-07T00:00:30.000Z",
    player2_submitted_at: "2026-05-07T00:00:30.000Z",
  });
  assert.equal(decideWinner(d), P1);
});

// ─── Single-submitter branches ────────────────────────────────────────────

test("decideWinner: only p1 submitted → p1 wins", () => {
  const d = makeDuel({
    player1_score: 50,
    player2_score: null,
    player1_submitted_at: "2026-05-07T00:00:30.000Z",
  });
  assert.equal(decideWinner(d), P1);
});

test("decideWinner: only p2 submitted → p2 wins", () => {
  const d = makeDuel({
    player1_score: null,
    player2_score: 50,
    player2_submitted_at: "2026-05-07T00:00:30.000Z",
  });
  assert.equal(decideWinner(d), P2);
});

// ─── Error branches ───────────────────────────────────────────────────────

test("decideWinner: neither submitted → throws", () => {
  const d = makeDuel({
    player1_score: null,
    player2_score: null,
  });
  assert.throws(() => decideWinner(d), /neither submitted/);
});

test("decideWinner: player2 not set → throws", () => {
  const d = makeDuel({
    player2_address: null,
    player1_score: 50,
    player2_score: 50,
  });
  assert.throws(() => decideWinner(d), /player2 not set/);
});
