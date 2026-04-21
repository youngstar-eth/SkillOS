// ───────────────────────────────────────────────────────────────────────────
// Wordle engine — adapted from the legacy main-branch implementation.
//
// Two things changed for the duel:
//  1. `pickAnswerFromSeed(seed)` replaces `pickAnswer(tournamentId)` —
//     the bytes32 match seed is hashed to a word-list index via FNV-1a
//     (matching the family of hashes used in apps/2048/src/lib/game2048.ts
//     so both games share the same deterministic-from-seed pattern).
//  2. `calculateScore` is unchanged (legacy formula is fine: guess bonus +
//     speed bonus, max 12000). Callers should floor losing scores to 1
//     so the shared backend's `score > 0` check passes.
// ───────────────────────────────────────────────────────────────────────────

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

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === a[i]) {
      states[i] = "correct";
    } else {
      remaining[a[i]] = (remaining[a[i]] ?? 0) + 1;
    }
  }

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
 * FNV-1a folding of the seed (hex or any string) to a uint32. Matches the
 * style used in apps/2048/src/lib/game2048.ts's `hashSeed`.
 */
function foldSeed(seed: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

/**
 * Deterministic answer picker for a duel seed.
 * Same bytes32 seed → same answer, for every player in the match.
 */
export function pickAnswerFromSeed(seed: string): string {
  return ANSWERS[foldSeed(seed) % ANSWERS.length];
}

/**
 * Score = guess bonus + speed bonus.
 *   Guess bonus: (7 − guessCount) × 1000 (so: 1st=6000, 6th=1000)
 *   Speed bonus: max(0, floor((60000 − durationMs)/100)), capped at 6000
 * Loss → 0. Callers should floor losing submissions to 1 so the shared
 * backend's `score > 0` validation accepts them.
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
