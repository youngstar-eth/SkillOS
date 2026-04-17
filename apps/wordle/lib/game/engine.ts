import { ANSWERS, VALID_GUESSES } from "./data/word-list";
import { MAX_GUESSES, WORD_LENGTH } from "./types";
import type { Guess, LetterState } from "./types";

/**
 * Evaluate a 5-letter guess against an answer.
 *
 * Two-pass algorithm for correct duplicate-letter handling:
 *   1. Mark positional matches as `correct`; track remaining letter counts
 *      for non-matching answer positions only.
 *   2. For remaining guess positions, mark `present` if that letter still
 *      has budget (decrementing), otherwise `absent`.
 *
 * Example — answer "spear", guess "erase":
 *   Pass 1: no positional matches. Remaining = {s:1,p:1,e:1,a:1,r:1}.
 *   Pass 2: e→present(e:0), r→present(r:0), a→present(a:0), s→present(s:0),
 *           e→absent (e=0 left).
 */
export function evaluateGuess(guess: string, answer: string): LetterState[] {
  const states: LetterState[] = Array(WORD_LENGTH).fill("absent");
  const g = guess.split("");
  const a = answer.split("");
  const remaining: Record<string, number> = {};

  // Pass 1: correct + budget
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === a[i]) {
      states[i] = "correct";
    } else {
      remaining[a[i]] = (remaining[a[i]] ?? 0) + 1;
    }
  }

  // Pass 2: present (pos mismatch but letter still has budget)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (states[i] === "correct") continue;
    const budget = remaining[g[i]] ?? 0;
    if (budget > 0) {
      states[i] = "present";
      remaining[g[i]] = budget - 1;
    }
  }

  return states;
}

/** True iff `word` is a 5-letter word present in the valid-guesses set. */
export function isValidGuess(word: string): boolean {
  if (word.length !== WORD_LENGTH) return false;
  return VALID_GUESSES.has(word.toLowerCase());
}

/**
 * Keyboard color state is the max state seen across all guesses.
 * Precedence: correct > present > absent > tbd > empty.
 * A key already marked `correct` never downgrades to `present`.
 */
const PRECEDENCE: Record<LetterState, number> = {
  correct: 4,
  present: 3,
  absent: 2,
  tbd: 1,
  empty: 0,
};

export function updateKeyboardStates(
  prev: Record<string, LetterState>,
  guess: Guess,
): Record<string, LetterState> {
  const next = { ...prev };
  for (let i = 0; i < guess.word.length; i++) {
    const letter = guess.word[i];
    const newState = guess.states[i];
    const oldState = next[letter] ?? "empty";
    if (PRECEDENCE[newState] > PRECEDENCE[oldState]) {
      next[letter] = newState;
    }
  }
  return next;
}

/**
 * Deterministic answer picker — same `tournamentId` (+ optional salt) always
 * yields the same word. Uses Knuth's multiplicative hash; no crypto strength
 * required because fairness is enforced on-chain via tournament id, not via
 * secret answer.
 */
export function pickAnswer(tournamentId: number, salt = 0): string {
  const hash = ((tournamentId + salt) * 2654435761) >>> 0;
  return ANSWERS[hash % ANSWERS.length];
}

/**
 * Score = guess bonus + speed bonus.
 *   Guess bonus: (7 − guessCount) × 1000 (so: 1st=6000, 6th=1000)
 *   Speed bonus: max(0, floor((60000 − durationMs)/100)), capped at 6000
 * Loss → 0.
 */
export function calculateScore(
  guesses: Guess[],
  won: boolean,
  durationMs: number,
): number {
  if (!won) return 0;
  const guessBonus = (MAX_GUESSES + 1 - guesses.length) * 1000;
  const rawSpeed = Math.floor((60_000 - durationMs) / 100);
  const speedBonus = Math.max(0, Math.min(rawSpeed, 6000));
  return guessBonus + speedBonus;
}

/** Total number of letters ever revealed as `correct` across all guesses. */
export function maxLetterHint(guesses: Guess[]): number {
  let n = 0;
  for (const g of guesses) {
    for (const s of g.states) if (s === "correct") n++;
  }
  return n;
}
