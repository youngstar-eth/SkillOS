export { generateCoachFeedback } from "./generate";
export type {
  CoachRequest,
  CoachResponse,
  CoachTone,
  GameType,
} from "./types";

// Recap pipeline — separate concern, separate output shape. Shares the
// Anthropic client and GameType enum with coach. See src/recap/ for the
// pipeline and per-game prompts.
export { generateRecap } from "./recap/generate";
export type {
  RecapRequest,
  RecapResponse,
  RecapStyle,
} from "./recap/types";

// Anti-cheat (plausibility) pipeline — private audit over match summary,
// called fire-and-forget from the settle hook. Shares the same Anthropic
// client and GameType enum. See src/anticheat/.
export { checkPlausibility } from "./anticheat/generate";
export type {
  PlausibilityRequest,
  PlausibilityResponse,
  Verdict,
} from "./anticheat/types";
