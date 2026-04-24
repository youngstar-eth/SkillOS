// ───────────────────────────────────────────────────────────────────────────
// Public types for the solo-coach variant.
//
// Response shape is deliberately the same `CoachResponse` as duel coach —
// the frontend `AICoach` component renders both without a mapping layer.
// The INPUT differs because solo has no opponent.
// ───────────────────────────────────────────────────────────────────────────

import type { GameType } from "../types";

/**
 * Input to `generateSoloCoachFeedback`. Mirrors duel's `CoachRequest` minus
 * opponent/won (solo has no opponent), plus a small flag the prompt can
 * reference when framing the feedback (a paid retry is a different story
 * from a first run — the voice can acknowledge that without being preachy).
 */
export interface SoloCoachRequest {
  gameType: GameType;
  /** Final score for this run. */
  score: number;
  /** How long the run took. May be 0 if the client didn't collect it. */
  durationSeconds: number;
  /**
   * True when this is the 2nd+ solo submission in the tournament (the
   * player paid 1 USDC to retry). Lets the prompt acknowledge "you paid
   * to come back — here's what to adjust." Optional — defaults to false.
   */
  isPaidRetry?: boolean;
  /**
   * Optional per-game context. Same untyped-at-the-boundary contract as
   * duel's CoachRequest — each app decides what to send; the prompt
   * reads whatever keys it recognizes.
   */
  gameSpecificData?: Record<string, unknown>;
}
