// Run with: npx tsx --test packages/duel-backend/test/settle-guard.integration.test.ts
//
// ─── Integration tests for settle-guard wiring ─────────────────────────────
//
// Complements settle-guard.test.ts (which is unit-level: classifier only).
// Asserts that triggerSettle() and checkAndTriggerWalkover() actually wire
// readChallengeGuard() into their flow BEFORE claimForSettle, and that a
// non-Accepted on-chain status short-circuits the call without flipping the
// DB row to 'settled' (the historical "lie state" bug; see settle-guard.ts
// header for context, matches 3c1d41b7…8393f and f1dd7571…).
//
// Two scopes in this file:
//
//   STRUCTURAL (active today) — Asserts the call-site invariant by reading
//   settle.ts source. Catches accidental deletion of the guard during
//   refactors. Cheap, no mocking, runs in CI without dependencies.
//
//   BEHAVIORAL (skipped, Phase 2 trigger) — Full-flow tests with mocked
//   on-chain + Supabase deps. Verifies that non-Accepted status returns
//   cannot_settle and the DB row is not updated. Activation requires
//   triggerSettle / checkAndTriggerWalkover refactored to accept a deps
//   object ({ publicClient, supabase, signer }) so they can be exercised
//   without hitting real RPC or Postgres. See settle-guard.test.ts for
//   the canonical mock-client pattern used elsewhere in this package.
//
// Activation: remove `.skip` from each BEHAVIORAL test when Phase 2 duel
// UI reactivation begins (currently every /duel/* route serves
// <DuelComingSoon /> from @skillos/ui).
// ───────────────────────────────────────────────────────────────────────────

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const settleSrc = readFileSync(join(here, "..", "src", "settle.ts"), "utf8");

/** Slice the source between `export async function ${name}` and the next
 *  top-level export. Returns the function body as a string for substring
 *  ordering checks. */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} not found in settle.ts`);
  const next = src.indexOf("export async function ", start + 1);
  return src.slice(start, next > 0 ? next : undefined);
}

// ─── Structural: guard precedes claim in both call sites ───────────────────

test("[STRUCT] triggerSettle invokes readChallengeGuard before claimForSettle", () => {
  const body = functionBody(settleSrc, "triggerSettle");
  const guardIdx = body.indexOf("readChallengeGuard(");
  const claimIdx = body.indexOf("claimForSettle(");
  assert.ok(guardIdx > 0, "readChallengeGuard missing from triggerSettle");
  assert.ok(claimIdx > 0, "claimForSettle missing from triggerSettle");
  assert.ok(
    guardIdx < claimIdx,
    "readChallengeGuard must run BEFORE claimForSettle to prevent lie-state",
  );
});

test("[STRUCT] checkAndTriggerWalkover invokes readChallengeGuard before claimForSettle", () => {
  const body = functionBody(settleSrc, "checkAndTriggerWalkover");
  const guardIdx = body.indexOf("readChallengeGuard(");
  const claimIdx = body.indexOf("claimForSettle(");
  assert.ok(
    guardIdx > 0,
    "readChallengeGuard missing from checkAndTriggerWalkover",
  );
  assert.ok(
    claimIdx > 0,
    "claimForSettle missing from checkAndTriggerWalkover",
  );
  assert.ok(
    guardIdx < claimIdx,
    "readChallengeGuard must run BEFORE claimForSettle to prevent lie-state",
  );
});

test("[STRUCT] both call sites short-circuit on !guard.ok with cannot_settle", () => {
  // Both functions must early-return with kind:'cannot_settle' when the
  // guard rejects, AND must do so before the claimForSettle line. Two
  // call sites checked together so a copy-paste divergence trips the test.
  for (const name of ["triggerSettle", "checkAndTriggerWalkover"] as const) {
    const body = functionBody(settleSrc, name);
    const cannotIdx = body.indexOf('"cannot_settle"');
    const claimIdx = body.indexOf("claimForSettle(");
    assert.ok(
      cannotIdx > 0,
      `${name} missing 'cannot_settle' early-return branch`,
    );
    assert.ok(
      cannotIdx < claimIdx,
      `${name} must return cannot_settle BEFORE the claim line`,
    );
  }
});

// ─── Behavioral: full-flow with mocked deps ── SKIPPED (Phase 2 trigger) ───

test.skip(
  "[BEHAV] triggerSettle: on-chain Open → kind:cannot_settle, guardReason:still_open, no DB flip",
  async () => {
    // Refactor prerequisite: settle.ts triggerSettle must accept
    //   { publicClient: GuardPublicClient, supabase: SupabaseLike, signer }
    // as a deps argument so the test can inject mocks.
    //
    // Setup:
    //   - publicClient.readContract → getChallenge with status=Open
    //   - supabase mock with readDuel returning { status:'matched', ... }
    //   - supabase.update spy that ASSERTS no call with { status:'settled' }
    // Action:
    //   const result = await triggerSettle(matchId, mockedDeps)
    // Asserts:
    //   - result.kind === 'cannot_settle'
    //   - result.guardReason === 'still_open'
    //   - supabase.update('v2_duels').update({ status:'settled' }) NEVER called
    //   - DB row read after the call still shows status='matched'
  },
);

test.skip(
  "[BEHAV] triggerSettle: on-chain Expired (3c1d41b7 historical) → no DB flip",
  async () => {
    // Mirror of above with status=Expired and guardReason='expired'.
    // This is the exact reproducer for the historical bug — leaving here
    // as a regression anchor so the orphaned match can never recur.
  },
);

test.skip(
  "[BEHAV] checkAndTriggerWalkover: on-chain Open → no DB flip (settle.ts:429 path)",
  async () => {
    // Mirror for the walkover call site. Same shape, different entry point.
  },
);

test.skip(
  "[BEHAV] triggerSettle: on-chain Accepted → guard passes, claim proceeds, normal settle path",
  async () => {
    // Positive control: ensures the guard doesn't false-reject Accepted
    // and that the rest of the settle pipeline runs as expected.
  },
);
