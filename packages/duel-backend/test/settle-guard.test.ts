// Run with: npx tsx --test packages/duel-backend/test/settle-guard.test.ts
//
// Pure unit tests for the on-chain state classifier. No RPC, no DB — just
// the helper against a mocked publicClient shim. Covers every value of the
// ChallengeEscrow.Status enum plus out-of-enum + RPC-failure paths.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHALLENGE_STATUS,
  readChallengeGuard,
  type GuardPublicClient,
} from "../src/settle-guard";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const CHALLENGE_ID = ("0x" + "ab".repeat(32)) as `0x${string}`;

/** Build a mock publicClient returning a getChallenge tuple with the given status. */
function mockClient(
  status: number,
  overrides: { throwReadError?: boolean; malformed?: unknown } = {},
): GuardPublicClient {
  return {
    readContract: async () => {
      if (overrides.throwReadError) {
        throw new Error("rpc unavailable");
      }
      if ("malformed" in overrides) {
        return overrides.malformed;
      }
      return {
        creator: "0x000000000000000000000000000000000000cafe",
        challenger:
          status === CHALLENGE_STATUS.Accepted
            ? "0x000000000000000000000000000000000000beef"
            : ZERO_ADDR,
        gameSlug: ("0x" + "00".repeat(32)) as `0x${string}`,
        stake: 1_000_000n,
        createdAt: 1_000n,
        acceptedAt: status === CHALLENGE_STATUS.Accepted ? 1_100n : 0n,
        expiresAt: 1_600n,
        status,
        winner:
          status === CHALLENGE_STATUS.Settled
            ? "0x000000000000000000000000000000000000beef"
            : ZERO_ADDR,
        payoutAmount: status === CHALLENGE_STATUS.Settled ? 1_800_000n : 0n,
      };
    },
  };
}

// ─── happy path ────────────────────────────────────────────────────────────

test("Accepted → ok:true", async () => {
  const r = await readChallengeGuard(
    mockClient(CHALLENGE_STATUS.Accepted),
    CHALLENGE_ID,
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.status, CHALLENGE_STATUS.Accepted);
});

// ─── each non-Accepted status maps to a reason ────────────────────────────

test("None → not_found (status 0)", async () => {
  const r = await readChallengeGuard(
    mockClient(CHALLENGE_STATUS.None),
    CHALLENGE_ID,
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "not_found");
    assert.equal(r.status, 0);
  }
});

test("Open (P2 never accepted) → still_open (status 1)", async () => {
  const r = await readChallengeGuard(
    mockClient(CHALLENGE_STATUS.Open),
    CHALLENGE_ID,
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "still_open");
    assert.equal(r.status, 1);
  }
});

test("Settled → already_settled (status 3)", async () => {
  const r = await readChallengeGuard(
    mockClient(CHALLENGE_STATUS.Settled),
    CHALLENGE_ID,
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "already_settled");
    assert.equal(r.status, 3);
  }
});

test("Expired (match 3c1d41b7 on-chain reality) → expired (status 4)", async () => {
  const r = await readChallengeGuard(
    mockClient(CHALLENGE_STATUS.Expired),
    CHALLENGE_ID,
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "expired");
    assert.equal(r.status, 4);
  }
});

test("Walkover → walkover (status 5)", async () => {
  const r = await readChallengeGuard(
    mockClient(CHALLENGE_STATUS.Walkover),
    CHALLENGE_ID,
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "walkover");
    assert.equal(r.status, 5);
  }
});

// ─── defensive paths ───────────────────────────────────────────────────────

test("out-of-enum status → not_found (fail-closed)", async () => {
  const r = await readChallengeGuard(mockClient(99), CHALLENGE_ID);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "not_found");
    assert.equal(r.status, 99);
  }
});

test("RPC throws → guard re-throws (caller handles)", async () => {
  const client = mockClient(0, { throwReadError: true });
  await assert.rejects(
    () => readChallengeGuard(client, CHALLENGE_ID),
    /rpc unavailable/,
  );
});

test("malformed response (null) → not_found with status -1", async () => {
  const client = mockClient(0, { malformed: null });
  const r = await readChallengeGuard(client, CHALLENGE_ID);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "not_found");
    assert.equal(r.status, -1);
  }
});

test("malformed response (status field missing) → not_found with status -1", async () => {
  const client = mockClient(0, { malformed: { creator: ZERO_ADDR } });
  const r = await readChallengeGuard(client, CHALLENGE_ID);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "not_found");
});
