export type LetterState = "correct" | "present" | "absent" | "empty" | "tbd";

export interface Guess {
  /** 5 lowercase letters. */
  word: string;
  /** Per-letter evaluation, one entry per letter of `word`. */
  states: LetterState[];
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  /** Target word, lowercase. */
  answer: string;
  /** Submitted guesses (0–6). */
  guesses: Guess[];
  /** Letters typed in the active row (0–5 chars). */
  currentInput: string;
  status: GameStatus;
  /** Highest state seen so far per letter — for keyboard coloring. */
  keyboardStates: Record<string, LetterState>;
  /** `Date.now()` at game start (0 until client mount). */
  startedAt: number;
}

export const MAX_GUESSES = 6 as const;
export const WORD_LENGTH = 5 as const;
