import { ANSWERS } from "./answers";
import { GUESSES_ONLY } from "./guesses-only";

export { ANSWERS };

/** Set of every word accepted as a guess (answers + extra guessable words). */
export const VALID_GUESSES: ReadonlySet<string> = new Set([
  ...ANSWERS,
  ...GUESSES_ONLY,
]);
