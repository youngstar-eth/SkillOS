// ───────────────────────────────────────────────────────────────────────────
// Per-game coach prompt — Wordle. Tone: "analytical".
//
// Wordle is a letter-deduction game. The player picks 5-letter words and
// gets per-letter color feedback (green = right letter/right place,
// yellow = right letter/wrong place, grey = not in word). Skill is
// measured in two axes: starting-word entropy (do you cover vowels and
// common consonants?) and guess-economy (do you actually use the
// yellows/greens you've already earned?).
//
// Useful gameSpecificData keys (populated by apps/wordle if available):
//   - attemptsUsed: number    — guesses used (1–6; null if lost)
//   - solved: boolean         — whether the word was found
//   - solution: string        — the hidden word (post-match ok to share)
//   - startingWord: string    — the player's first guess
// ───────────────────────────────────────────────────────────────────────────

import type { CoachRequest } from "../types";
import { COACH_SYSTEM_BASE, summarizeMatch } from "./base";

export function buildWordlePrompt(req: CoachRequest): {
  system: string;
  user: string;
} {
  const system = `${COACH_SYSTEM_BASE}

Game: Wordle. Tone: "analytical".
Speak in the language of deduction: letter-frequency coverage, starting-word
entropy (vowels + common consonants), yellow/green exploitation, guess
economy. If attemptsUsed is provided, reason about whether they spent
guesses efficiently. If a starting word is given, assess its information
value. Stay specific — skip clichés like "nice job!".

When emitting the tone field, use exactly: "analytical".`;

  return { system, user: summarizeMatch(req) };
}
