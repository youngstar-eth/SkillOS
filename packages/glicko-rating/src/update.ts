// X23.1 — Glicko-2 rating period update.
// Per docs/sprints/x23-glicko-2/SPEC.md §B.2.

import rate from "glicko2-lite";
import { DEFAULT_TAU, SKILLOS_ANCHOR_RATING } from "./defaults";
import type { MatchOutcome, RatingState } from "./types";

/**
 * Apply one rating period of match outcomes to a player.
 *
 * Wraps `glicko2-lite`'s `rate(...)` to translate between SkillOS
 * RatingState and the library's positional `[rating, rd, score]` opponent
 * tuple. Pure function — no I/O, no DB access, no side effects. Caller
 * persists the returned RatingState.
 *
 * Empty `matches` is valid: rating and volatility stay; RD inflates per
 * Glicko-2 §5.2 (`phi* = sqrt(phi² + sigma²)`). Useful for cron skipping
 * a rating period for inactive players. Callers may also skip the call
 * entirely if no matches occurred.
 *
 * @param current Player's pre-period rating state (or DEFAULT_RATING if new).
 * @param matches Match outcomes within this rating period.
 * @param tau     System constant. Default 0.5 (Glicko-2 paper).
 * @returns Updated RatingState. Caller writes to v2_player_ratings + appends
 *          a v2_player_rating_history row.
 */
export function updateRating(
  current: RatingState,
  matches: MatchOutcome[],
  tau: number = DEFAULT_TAU,
): RatingState {
  const opponents = matches.map<[number, number, 0 | 0.5 | 1]>((m) => [
    m.opponent.rating,
    m.opponent.rd,
    m.score,
  ]);

  const result = rate(current.rating, current.rd, current.volatility, opponents, {
    rating: SKILLOS_ANCHOR_RATING,
    tau,
  });

  return {
    rating: result.rating,
    rd: result.rd,
    volatility: result.vol,
  };
}
