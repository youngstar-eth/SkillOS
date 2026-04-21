export type LetterState = "correct" | "present" | "absent" | "empty" | "tbd";

export interface Guess {
  /** 5 lowercase letters. */
  word: string;
  /** Per-letter evaluation, one entry per letter of `word`. */
  states: LetterState[];
}

export type GameStatus = "playing" | "won" | "lost";

export const MAX_GUESSES = 6 as const;
export const WORD_LENGTH = 5 as const;
