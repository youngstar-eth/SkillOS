// ───────────────────────────────────────────────────────────────────────────
// Public types for the anti-cheat half of @skillbase/ai-coach.
//
// Coach  = tactical, private, "here's how you improve".
// Recap  = dramatic, public, "here's the story of this match".
// Anti-cheat = private audit, "does this match look like honest play?".
//
// The input shape mirrors CoachRequest/RecapRequest so the settle hook
// (duel-backend/settle.ts) can fire this off with the same data it
// already has — no new data collection required to launch.
// ───────────────────────────────────────────────────────────────────────────

import type { GameType } from "../types";

/**
 * Three-tier verdict, not a boolean, because admin actions differ:
 *
 * - "plausible"    — do nothing
 * - "suspicious"   — glance on the admin endpoint; don't wake anyone
 * - "implausible"  — actually review; numeric anomaly must be cited
 *
 * Bias rule (enforced in prompt): when in doubt, choose "plausible".
 * False-positive cost on a winning player's match is higher than
 * false-negative — humans catch the residual downstream.
 */
export type Verdict = "plausible" | "suspicious" | "implausible";

export interface PlausibilityRequest {
  gameType: GameType;
  /** Duel UUID — carried for log correlation, not consumed by the prompt. */
  duelId: string;
  winnerScore: number;
  loserScore: number;
  durationSeconds: number;
  /**
   * Reserved for future use. The current v2_duels schema has no
   * game_data column, so the settle hook will not populate this
   * at launch. Per-game prompts ignore missing keys; they reason
   * from score + duration alone today.
   */
  gameSpecificData?: Record<string, unknown>;
}

export interface PlausibilityResponse {
  verdict: Verdict;
  /** 0..1 — how confident the model is in the verdict (not in fraud). */
  confidence: number;
  /** 1–2 sentences; for "implausible" must cite concrete numeric anomaly. */
  reasoning: string;
  /** Short kebab-case labels. Empty when verdict = plausible. */
  flags: string[];
  /** ISO 8601. Written by the pipeline at response time, not the model. */
  reviewedAt: string;
  /** Pinned so the admin audit path can tell which model judged. */
  modelVersion: string;
}
