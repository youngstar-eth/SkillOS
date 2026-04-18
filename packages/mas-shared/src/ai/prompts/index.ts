import {
  WORDLE_CHALLENGE_PROMPT,
  WORDLE_ANALYSIS_PROMPT,
} from "./wordle";
import {
  GAME2048_CHALLENGE_PROMPT,
  GAME2048_ANALYSIS_PROMPT,
} from "./game2048";
import {
  HILLCLIMB_CHALLENGE_PROMPT,
  HILLCLIMB_ANALYSIS_PROMPT,
} from "./hillclimb";

// Game-slug-keyed prompt maps. Callers resolve the prompt via the slug,
// then pass `date` or `stats` as the argument.
export const CHALLENGE_PROMPTS: Record<string, (date: string) => string> = {
  wordle: WORDLE_CHALLENGE_PROMPT,
  "2048": GAME2048_CHALLENGE_PROMPT,
  hillclimb: HILLCLIMB_CHALLENGE_PROMPT,
};

// Analysis prompts accept an already-typed stats object. The handler is
// responsible for shaping stats to the expected per-game contract before
// calling — we don't re-validate at this boundary.
export const ANALYSIS_PROMPTS: Record<string, (stats: any) => string> = {
  wordle: WORDLE_ANALYSIS_PROMPT,
  "2048": GAME2048_ANALYSIS_PROMPT,
  hillclimb: HILLCLIMB_ANALYSIS_PROMPT,
};

export {
  WORDLE_CHALLENGE_PROMPT,
  WORDLE_ANALYSIS_PROMPT,
  GAME2048_CHALLENGE_PROMPT,
  GAME2048_ANALYSIS_PROMPT,
  HILLCLIMB_CHALLENGE_PROMPT,
  HILLCLIMB_ANALYSIS_PROMPT,
};
