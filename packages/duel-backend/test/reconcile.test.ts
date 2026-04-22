// Run with: npx tsx --test packages/duel-backend/test/reconcile.test.ts
//
// Tests for:
//   - decideReconcileAction (pure decision function, exhaustive branch coverage)
//   - adminReconcileHandler auth path (401 shape, no DB/chain touched)

import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "viem";
import {
  decideReconcileAction,
  adminReconcileHandler,
} from "../src/api/admin/reconcile";
import { CHALLENGE_STATUS } from "../src/settle-guard";

const P1 = getAddress("0x000000000000000000000000000000000000cafe");
const P2 = getAddress("0x000000000000000000000000000000000000beef");
const ZERO = getAddress("0x0000000000000000000000000000000000000000");
const MATCH_ID = "3c1d41b7-1402-4bb6-b150-88c98393fb0f";

// ─── decideReconcileAction: Expired paths ──────────────────────────────────

test("Expired + DB not yet refunded → mark-refunded-from-expired", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Expired,
    onChainWinner: ZERO,
    duelStatus: "settled", // lie state
    duelWinnerAddress: null,
    hasBothScores: true,
  });
  assert.equal(d.action, "mark-refunded-from-expired");
});

test("Expired + DB already 'refunded' → idempotent noop", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Expired,
    onChainWinner: ZERO,
    duelStatus: "refunded",
    duelWinnerAddress: null,
    hasBothScores: true,
  });
  assert.equal(d.action, "noop-already-reconciled");
});

// ─── decideReconcileAction: Settled/Walkover backfill paths ────────────────

test("Settled + DB lie-state (winner null) → backfill-settled with on-chain winner", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Settled,
    onChainWinner: P2,
    duelStatus: "settled",
    duelWinnerAddress: null,
    hasBothScores: true,
  });
  assert.equal(d.action, "backfill-settled");
  assert.equal(d.winnerBackfill, P2);
});

test("Settled + DB winner matches chain → idempotent noop", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Settled,
    onChainWinner: P2,
    duelStatus: "settled",
    duelWinnerAddress: P2,
    hasBothScores: true,
  });
  assert.equal(d.action, "noop-already-reconciled");
});

test("Settled + DB winner lowercase/mixed-case → idempotent (checksum-normalized compare)", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Settled,
    onChainWinner: P2,
    duelStatus: "settled",
    duelWinnerAddress: P2.toLowerCase(),
    hasBothScores: true,
  });
  assert.equal(d.action, "noop-already-reconciled");
});

test("Walkover + DB lie-state → backfill-settled", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Walkover,
    onChainWinner: P1,
    duelStatus: "settled",
    duelWinnerAddress: null,
    hasBothScores: false,
  });
  assert.equal(d.action, "backfill-settled");
  assert.equal(d.winnerBackfill, P1);
});

// ─── decideReconcileAction: Accepted re-drive paths ────────────────────────

test("Accepted + both scores present → drive-settle", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Accepted,
    onChainWinner: ZERO,
    duelStatus: "player2_submitted",
    duelWinnerAddress: null,
    hasBothScores: true,
  });
  assert.equal(d.action, "drive-settle");
});

test("Accepted + score missing → needs-manual (422)", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Accepted,
    onChainWinner: ZERO,
    duelStatus: "player1_submitted",
    duelWinnerAddress: null,
    hasBothScores: false,
  });
  assert.equal(d.action, "needs-manual");
  assert.match(d.reason ?? "", /score missing/);
});

// ─── decideReconcileAction: untouched states ───────────────────────────────

test("Open + DB lie-state → needs-manual (admin review)", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.Open,
    onChainWinner: ZERO,
    duelStatus: "settled",
    duelWinnerAddress: null,
    hasBothScores: true,
  });
  assert.equal(d.action, "needs-manual");
  assert.match(d.reason ?? "", /Open/);
});

test("None (challenge doesn't exist on-chain) → needs-manual", () => {
  const d = decideReconcileAction({
    onChainStatus: CHALLENGE_STATUS.None,
    onChainWinner: ZERO,
    duelStatus: "settled",
    duelWinnerAddress: null,
    hasBothScores: true,
  });
  assert.equal(d.action, "needs-manual");
  assert.match(d.reason ?? "", /None/);
});

test("Unknown status → needs-manual with Unknown label", () => {
  const d = decideReconcileAction({
    onChainStatus: 99,
    onChainWinner: ZERO,
    duelStatus: "settled",
    duelWinnerAddress: null,
    hasBothScores: true,
  });
  assert.equal(d.action, "needs-manual");
  assert.match(d.reason ?? "", /Unknown\(99\)/);
});

// ─── adminReconcileHandler: auth path ──────────────────────────────────────
//
// These tests intentionally do not mock DB/chain — auth rejection happens
// before either is touched. Any env state leaks are guarded by restoring
// ADMIN_API_TOKEN after each test.

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request(
    `http://localhost/api/admin/duels/${MATCH_ID}/reconcile`,
    { method: "POST", headers },
  );
}

test("401 when ADMIN_API_TOKEN is not set (fail-closed on misconfig)", async () => {
  const save = process.env.ADMIN_API_TOKEN;
  delete process.env.ADMIN_API_TOKEN;
  try {
    // Even with a matching-looking Bearer header, no config → 401.
    const res = await adminReconcileHandler(
      makeReq({ Authorization: "Bearer whatever" }) as unknown as never,
      { params: { id: MATCH_ID } },
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.deepEqual(body, { error: "unauthorized" });
  } finally {
    if (save !== undefined) process.env.ADMIN_API_TOKEN = save;
  }
});

test("401 when header missing entirely", async () => {
  const save = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = "secret-token-1234";
  try {
    const res = await adminReconcileHandler(
      makeReq() as unknown as never,
      { params: { id: MATCH_ID } },
    );
    assert.equal(res.status, 401);
  } finally {
    if (save === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = save;
  }
});

test("401 when Bearer value is wrong", async () => {
  const save = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = "secret-token-1234";
  try {
    const res = await adminReconcileHandler(
      makeReq({ Authorization: "Bearer nope" }) as unknown as never,
      { params: { id: MATCH_ID } },
    );
    assert.equal(res.status, 401);
  } finally {
    if (save === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = save;
  }
});

test("401 when scheme is not Bearer", async () => {
  const save = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = "secret-token-1234";
  try {
    const res = await adminReconcileHandler(
      makeReq({ Authorization: "Basic secret-token-1234" }) as unknown as never,
      { params: { id: MATCH_ID } },
    );
    assert.equal(res.status, 401);
  } finally {
    if (save === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = save;
  }
});

test("400 when matchId is not a uuid (auth passes first, then param check)", async () => {
  const save = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = "secret-token-1234";
  try {
    const req = new Request(
      "http://localhost/api/admin/duels/not-a-uuid/reconcile",
      {
        method: "POST",
        headers: { Authorization: "Bearer secret-token-1234" },
      },
    );
    const res = await adminReconcileHandler(
      req as unknown as never,
      { params: { id: "not-a-uuid" } },
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_match_id");
  } finally {
    if (save === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = save;
  }
});
