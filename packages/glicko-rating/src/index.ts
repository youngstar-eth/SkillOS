// X23.1 — @skillos/glicko-rating public surface.
// Per docs/sprints/x23-glicko-2/SPEC.md §B.

export type { MatchOutcome, RatingState } from "./types.js";
export { DEFAULT_RATING, DEFAULT_TAU, SKILLOS_ANCHOR_RATING } from "./defaults.js";
export { updateRating } from "./update.js";
