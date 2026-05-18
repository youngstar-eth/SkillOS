// X23.1 — @skillos/glicko-rating public surface.
// Per docs/sprints/x23-glicko-2/SPEC.md §B.

export type { MatchOutcome, RatingState } from "./types";
export { DEFAULT_RATING, DEFAULT_TAU, SKILLOS_ANCHOR_RATING } from "./defaults";
export { updateRating } from "./update";
