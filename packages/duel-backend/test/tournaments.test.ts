// Run with: npx tsx --test packages/duel-backend/test/tournaments.test.ts
//
// ─── Test scaffolding for runCreateTournaments helpers ─────────────────────
//
// X9.1 RCA fix: preflightSponsorBalance. The X9 sprint left
// runCreateTournaments without a deps-injection seam, so this initial
// suite scopes to the extracted preflight helper specifically (the
// surface that the RCA fix introduces). Subsequent X9 follow-up PRs can
// thread a CreateDependencies seam through the whole runner — see
// cron-settle.test.ts for the precedent pattern.
//
// Convention: matches cron-settle.test.ts + settle-guard.test.ts —
//   - node:test built-in runner, node:assert/strict for assertions
//   - manual mock objects (no vi.mock, no jest, no third-party framework)
//   - one-line "Run with" header

import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, type Address } from "viem";
import { preflightSponsorBalance } from "../src/cron/tournaments";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const SPONSOR = getAddress(
  "0xa24f9122568e98b72f4ddd61119c7d92d0975692",
) as Address;
const CRON_RUN_ID = "test-cron-run-id-00000000";
const PRIZE_POOL = 10_000_000n; // 10 USDC, 6 decimals
const NUM_TARGETS = 6;
const TOTAL_NEED = PRIZE_POOL * BigInt(NUM_TARGETS); // 60 USDC

// Minimal publicClient mock — only the call surface preflightSponsorBalance
// invokes (readContract → balanceOf returning bigint).
function mockPublicClient(balanceWei: bigint): {
  readContract: (args: unknown) => Promise<bigint>;
  calls: Array<{ functionName: string; args: unknown }>;
} {
  const calls: Array<{ functionName: string; args: unknown }> = [];
  return {
    calls,
    readContract: async (args: unknown) => {
      calls.push(args as { functionName: string; args: unknown });
      return balanceWei;
    },
  };
}

// ─── Cases ─────────────────────────────────────────────────────────────────

test("preflightSponsorBalance: throws when balance < need", async () => {
  // 25 USDC available, 60 USDC needed → 35 USDC deficit, must throw
  const balance = 25_000_000n;
  const publicClient = mockPublicClient(balance);

  await assert.rejects(
    () =>
      preflightSponsorBalance({
        publicClient: publicClient as never,
        sponsor: SPONSOR,
        totalNeed: TOTAL_NEED,
        cronRunId: CRON_RUN_ID,
        numTargets: NUM_TARGETS,
        prizePoolPerTarget: PRIZE_POOL,
      }),
    (err: Error) => {
      // Error message includes both balance + need numbers for op-time
      // grep-ability; if this assertion breaks, update the structured
      // log consumers (Vercel log filters) at the same time.
      assert.match(err.message, /insufficient sponsor USDC balance/);
      assert.match(err.message, /25000000.*wei.*60000000.*wei/);
      return true;
    },
  );

  // Sanity: we only read balanceOf (no other contract calls before the throw)
  assert.equal(publicClient.calls.length, 1);
  assert.equal(
    (publicClient.calls[0] as { functionName: string }).functionName,
    "balanceOf",
  );
});

test("preflightSponsorBalance: returns normally when balance >= need", async () => {
  // 100 USDC available, 60 USDC needed → must NOT throw
  const balance = 100_000_000n;
  const publicClient = mockPublicClient(balance);

  await assert.doesNotReject(() =>
    preflightSponsorBalance({
      publicClient: publicClient as never,
      sponsor: SPONSOR,
      totalNeed: TOTAL_NEED,
      cronRunId: CRON_RUN_ID,
      numTargets: NUM_TARGETS,
      prizePoolPerTarget: PRIZE_POOL,
    }),
  );

  assert.equal(publicClient.calls.length, 1);
});

test("preflightSponsorBalance: boundary — balance exactly === need passes", async () => {
  // Exact boundary: balance must be GTE need, not strictly GT
  const publicClient = mockPublicClient(TOTAL_NEED);

  await assert.doesNotReject(() =>
    preflightSponsorBalance({
      publicClient: publicClient as never,
      sponsor: SPONSOR,
      totalNeed: TOTAL_NEED,
      cronRunId: CRON_RUN_ID,
      numTargets: NUM_TARGETS,
      prizePoolPerTarget: PRIZE_POOL,
    }),
  );
});

test("preflightSponsorBalance: boundary — balance one wei less than need throws", async () => {
  // One wei under: must throw with a deficit of exactly 1 wei
  const balance = TOTAL_NEED - 1n;
  const publicClient = mockPublicClient(balance);

  await assert.rejects(
    () =>
      preflightSponsorBalance({
        publicClient: publicClient as never,
        sponsor: SPONSOR,
        totalNeed: TOTAL_NEED,
        cronRunId: CRON_RUN_ID,
        numTargets: NUM_TARGETS,
        prizePoolPerTarget: PRIZE_POOL,
      }),
    (err: Error) => {
      assert.match(err.message, /insufficient sponsor USDC balance/);
      return true;
    },
  );
});
