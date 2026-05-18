// X23.1 — Public type surface for the Glicko-2 wrapper.
// Per docs/sprints/x23-glicko-2/SPEC.md §B.2.

/**
 * Glicko-2 rating state. SkillOS persists one row per
 * (wallet, game, class) keyed by these three fields plus metadata.
 *
 * Decoupled from `glicko2-lite`'s positional tuple convention so storage,
 * APIs, and library calls all read against a stable shape.
 */
export interface RatingState {
  /** Glicko-2 rating value. SkillOS anchor is 1000 (legacy Glicko display ≈ 1500). */
  rating: number;
  /** Rating Deviation — lower = more confident in the rating. */
  rd: number;
  /** Volatility — Glicko-2 vs Glicko-1 addition; tracks expected fluctuation. */
  volatility: number;
}

/** One match outcome within a rating period, from the current player's POV. */
export interface MatchOutcome {
  opponent: RatingState;
  /** 0 = loss, 0.5 = draw, 1 = win. Float restricted via TS union for safety. */
  score: 0 | 0.5 | 1;
}
