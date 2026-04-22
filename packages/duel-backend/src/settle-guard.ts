// ───────────────────────────────────────────────────────────────────────────
// Settle-path guard: on-chain ChallengeEscrow status pre-check.
//
// Background: settle.ts's triggerSettle() and checkAndTriggerWalkover()
// previously claimed the DB row (CAS UPDATE status='settled') BEFORE
// broadcasting the on-chain call. When the contract reverted (e.g. challenge
// status was Expired because the challenger never accepted on-chain via
// their ERC-4337 UserOp), the DB row was left in a "lie state":
//
//   status='settled' ∧ winner_address IS NULL ∧ settled_at IS NULL
//
// The result page's "settled with no winner shouldn't happen under the
// current contract, but guard anyway" fallback then rendered it as
// "Tie / refund" even though P2 scored 3× P1 (match 3c1d41b7…8393f,
// f1dd7571…). Tournament submit correctly rejects these (no winner), but
// the user's winning duel is orphaned.
//
// This guard reads the on-chain state up-front and returns a structured
// result. Callers must branch on it BEFORE claimForSettle. If the
// challenge isn't in Accepted state, we never flip the DB.
// ───────────────────────────────────────────────────────────────────────────

import {
  CHALLENGE_ESCROW_ABI,
  CHALLENGE_ESCROW_ADDRESS,
} from "@skillbase/contracts";
import type { Hex } from "viem";

/** Mirrors ChallengeEscrow.Status enum. */
export const CHALLENGE_STATUS = {
  None: 0,
  Open: 1,
  Accepted: 2,
  Settled: 3,
  Expired: 4,
  Walkover: 5,
} as const;

export type ChallengeStatus =
  (typeof CHALLENGE_STATUS)[keyof typeof CHALLENGE_STATUS];

/** Why the on-chain state prevents a settle/walkover from succeeding. */
export type SettleGuardReason =
  | "not_found" // status None — bytes32 id has no entry
  | "still_open" // status Open — challenger never accepted
  | "already_settled" // status Settled — a prior tx completed it
  | "expired" // status Expired — accept window passed without challenger
  | "walkover"; // status Walkover — already resolved via abandonment path

export type SettleGuardResult =
  | { ok: true; status: typeof CHALLENGE_STATUS.Accepted }
  | { ok: false; status: number; reason: SettleGuardReason };

/**
 * Minimal interface surface — just readContract. Keeps the function
 * trivially mockable in tests without pulling the full viem PublicClient
 * union (which is a huge generic). In production we pass getPublicClient().
 */
export interface GuardPublicClient {
  readContract: (args: {
    address: `0x${string}`;
    abi: typeof CHALLENGE_ESCROW_ABI;
    functionName: "getChallenge";
    args: readonly [Hex];
  }) => Promise<unknown>;
}

function toGuardResult(status: number): SettleGuardResult {
  if (status === CHALLENGE_STATUS.Accepted) {
    return { ok: true, status: CHALLENGE_STATUS.Accepted };
  }
  let reason: SettleGuardReason;
  switch (status) {
    case CHALLENGE_STATUS.None:
      reason = "not_found";
      break;
    case CHALLENGE_STATUS.Open:
      reason = "still_open";
      break;
    case CHALLENGE_STATUS.Settled:
      reason = "already_settled";
      break;
    case CHALLENGE_STATUS.Expired:
      reason = "expired";
      break;
    case CHALLENGE_STATUS.Walkover:
      reason = "walkover";
      break;
    default:
      // Defensive: out-of-enum values treated as "not_found".
      reason = "not_found";
  }
  return { ok: false, status, reason };
}

/**
 * Read challenge status from the escrow contract and classify it.
 * Only returns ok:true when the challenge is in Accepted state — the one
 * state in which settle() or walkover() can succeed on-chain.
 *
 * Throws only if the RPC itself fails — never swallows errors, so callers
 * can retry transient network issues separately from logic failures.
 */
export async function readChallengeGuard(
  publicClient: GuardPublicClient,
  challengeId: Hex,
): Promise<SettleGuardResult> {
  const raw = await publicClient.readContract({
    address: CHALLENGE_ESCROW_ADDRESS,
    abi: CHALLENGE_ESCROW_ABI,
    functionName: "getChallenge",
    args: [challengeId],
  });

  // viem decodes the named-tuple output as an object. Defensive narrowing
  // so a malformed response surfaces as "not_found" rather than crashing.
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, status: -1, reason: "not_found" };
  }
  const status = (raw as { status?: unknown }).status;
  if (typeof status !== "number") {
    return { ok: false, status: -1, reason: "not_found" };
  }

  return toGuardResult(status);
}
