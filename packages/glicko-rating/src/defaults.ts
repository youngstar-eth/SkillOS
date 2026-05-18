// X23.1 — SkillOS constants for the Glicko-2 wrapper.
// Per docs/sprints/x23-glicko-2/SPEC.md §B.2 + §J.1.

import type { RatingState } from "./types";

/**
 * Default starting state for a new (wallet, game, class) row.
 * Per SPEC §B.2 line 68: 1000 SkillOS ≡ 1500 in legacy Glicko display.
 */
export const DEFAULT_RATING: RatingState = {
  rating: 1000,
  rd: 350,
  volatility: 0.06,
};

/**
 * SkillOS anchor for the underlying Glicko-2 math. The library defaults
 * to 1500 (legacy Glicko display); SkillOS rebases to 1000 so a new
 * player starts exactly at the math's neutral point (mu = 0).
 */
export const SKILLOS_ANCHOR_RATING = 1000;

/**
 * System constant tau. Default 0.5 per Glicko-2 paper. Tunable post-mainnet
 * via env var if leaderboard skew calls for it — SPEC §J.1.
 */
export const DEFAULT_TAU = 0.5;
