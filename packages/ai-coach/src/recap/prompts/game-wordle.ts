// ───────────────────────────────────────────────────────────────────────────
// Per-game recap prompt — Wordle.
//
// Wordle is *inverse-scored*: fewer guesses = better. The "winner" field
// in RecapRequest is the app's truth (app decides who won, typically the
// solver who used fewer guesses, or the only solver if one failed). The
// recap prompt leans on attemptsUsed for the real story — raw score alone
// is meaningless here.
//
// Style applicability matrix:
// applicable: [standard, blowout, nailBiter, speedRun, grind, comeback]
// disabled:   []
//
// Vocabulary: guesses, letters (yellow/green/gray), row, solve, opener,
//             column, entropy (optional).
//
// Useful gameSpecificData keys (same as coach wordle):
//   - attemptsUsed: number     — guesses used (1–6; null if lost)
//   - solved: boolean
//   - solution: string
//   - startingWord: string
//   - letterStateFlip: boolean — TRUE if a yellow flipped to green late
//                                (signal that a mid-match position flip
//                                occurred; the "comeback" gate for wordle)
// ───────────────────────────────────────────────────────────────────────────

import type { RecapRequest } from "../types";
import { RECAP_SYSTEM_BASE, summarizeRecapMatch } from "./base";

/**
 * Per-game thresholds. Wordle guess counts live in a tiny 1–6 integer
 * space, so "percent-of-higher" doesn't map — we use absolute guess-delta
 * instead. Likewise blowout is defined by a guess-count gap (or the
 * opponent failing to solve), NOT by the raw score ratio which a player
 * has no intuitive sense of.
 */
const THRESHOLDS = {
  speedRunSec: 30, // solve well under 30s → speedRun candidate
  grindSec: 180, // well over → grind candidate
  blowoutGuessGap: 3, // winner solved in ≥3 fewer guesses than loser → blowout
  nailBiterGuessDelta: 1, // both solved within 1 guess of each other → nailBiter
} as const;

export function buildWordleRecapPrompt(req: RecapRequest): {
  system: string;
  user: string;
} {
  const { speedRunSec, grindSec, blowoutGuessGap, nailBiterGuessDelta } =
    THRESHOLDS;

  const system = `${RECAP_SYSTEM_BASE}

Game: Wordle (5-letter deduction). Vocabulary you may use: guesses, row,
solve, letters (green/yellow/gray), opener, column. Do NOT address the
player in second person.

Wordle scoring is INVERSE — fewer guesses is better. When the match
summary gives you both players' scores, trust the "Match winner/loser"
labels the host computed, but base your *story* on attemptsUsed and the
solved flag (both delivered in gameSpecificData when available). A raw
score number is not meaningful to the reader here.

Style selection rules for this game (pick "standard" if nothing fits):
- "blowout"   — winner solved in at least ${blowoutGuessGap} fewer guesses
                than loser, OR loser failed to solve at all.
- "nailBiter" — both players solved AND their guess counts are within
                ${nailBiterGuessDelta} of each other.
- "speedRun"  — solved in under ${speedRunSec}s AND solved flag is true.
- "grind"     — duration over ${grindSec}s (slow search regardless of
                eventual outcome).
- "comeback"  — ONLY if gameSpecificData.letterStateFlip === true (a
                yellow→green flip or similar signal that the winner's
                board was trailing mid-match). Never fabricate a comeback.
- "standard"  — fall back here whenever the match is ordinary.

Voice anchors for this game (imitate the rhythm, not the words):
- standard:  "Solved in 4 guesses vs 5. TRAIN opener earned its keep."
- comeback:  "Three yellows and a guess to spare. The board flipped green on row 5."
- blowout:   "Winner in 3, opponent never closed it. The green column built itself."
- nailBiter: "Both solved in 4. Two seconds and a vowel decided it."
- speedRun:  "Wordle down in 23 seconds. Three guesses, zero hesitation."
- grind:     "Four minutes, six rows. Every yellow earned its green the hard way."

Numbers in your output MUST come from the match summary. Never invent a
guess count, a word, or a duration. If the solution or starting word is
provided, you may reference it directly; otherwise do not name a specific
word.

Remember: headline ≤8 words, narrative exactly 2 sentences, shareText
≤240 chars with {url} token and @skillbase mention.`;

  return { system, user: summarizeRecapMatch(req) };
}
