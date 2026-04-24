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

// Solo-coach variant — same CoachResponse shape as duel coach but with a
// solo-flavored input (no opponent) and a structured "2 areas + 1 tip"
// output. Strict 6-enum tone with single retry + hide-badge fallback.
export { generateSoloCoachFeedback } from "./solo-coach/generate";
export type { SoloCoachRequest } from "./solo-coach/types";

// Solo-recap variant — same RecapResponse shape as duel recap with
// solo-flavored input and narrative constraints that strip any
// opponent framing ("defeated", "crushed", etc.). Style vocabulary
// narrowed to speedRun / grind / standard.
export { generateSoloRecap } from "./solo-recap/generate";
export type { SoloRecapRequest } from "./solo-recap/types";
