// ───────────────────────────────────────────────────────────────────────────
// Per-game recap prompt — Minesweeper.
//
// Style applicability matrix:
// applicable: [standard, blowout, nailBiter, speedRun, grind, comeback]
// disabled:   []
//
// Vocabulary: reveals, flags, cascade, board, safe (cell), mine, chord-click,
//             forced guess, sweep.
//
// Useful gameSpecificData keys (same as coach minesweeper):
//   - difficulty: 'beginner'|'intermediate'|'expert'
//   - cellsRevealed: number
//   - flagsPlaced: number
//   - hitMine: boolean
//   - forcedGuesses: number
//   - lateSafeReveal: boolean — TRUE if the winner made several consecutive
//                               safe reveals after a flag was removed; the
//                               comeback gate for minesweeper.
// ───────────────────────────────────────────────────────────────────────────

import type { RecapRequest } from "../types";
import { RECAP_SYSTEM_BASE, summarizeRecapMatch } from "./base";

/**
 * Per-game thresholds. Minesweeper match duration varies with difficulty;
 * these speedRun/grind bands are tuned to intermediate. Expert solves
 * often land at 100–150s, which is fine — they just don't earn speedRun
 * unless they actually break the 60s floor.
 */
const THRESHOLDS = {
  blowoutRatio: 2,
  nailBiterDeltaPct: 10,
  speedRunSec: 60, // under → speedRun
  grindSec: 300, // over → grind
} as const;

export function buildMinesweeperRecapPrompt(req: RecapRequest): {
  system: string;
  user: string;
} {
  const { blowoutRatio, nailBiterDeltaPct, speedRunSec, grindSec } = THRESHOLDS;

  const system = `${RECAP_SYSTEM_BASE}

Game: Minesweeper (probabilistic deduction). Vocabulary: reveals, flags,
cascade, board, safe cell, mine, chord-click, forced guess, sweep. Do NOT
address the player in second person.

A "cascade" in minesweeper is the automatic chain of reveals when a
zero-numbered cell is clicked — use the word when the match summary hints
at a big opening reveal. Do NOT confuse it with match-3 cascades.

Style selection rules for this game (pick "standard" if nothing fits):
- "blowout"   — winner's score ≥ ${blowoutRatio}× loser's, OR loser
                hit a mine with forcedGuesses === 0 (avoidable loss) while
                the winner swept through.
- "nailBiter" — |score delta| ≤ ${nailBiterDeltaPct}% of the higher score.
- "speedRun"  — duration under ${speedRunSec}s AND the board was cleared.
- "grind"     — duration over ${grindSec}s.
- "comeback"  — ONLY if gameSpecificData.lateSafeReveal === true (a
                consecutive-safe-reveal streak after a bad flag or
                reset — the winner was trailing and caught up through
                careful late-game deduction). Never fabricate.
- "standard"  — fall back here whenever the match is ordinary.

Voice anchors for this game:
- standard:  "Board cleared in 52 seconds. No flags wasted."
- comeback:  "After a wrong flag, six safe reveals. The board cracked open late."
- blowout:   "Winner swept the board; opponent hit a mine on reveal eight."
- nailBiter: "Two mines from victory on both sides. One got there first."
- speedRun:  "Expert board, 43 seconds. Chord-click economy on full display."
- grind:     "Six minutes of careful reveals. Zero forced guesses, zero mines hit."

Numbers in your output MUST come from the match summary. Never invent
reveal counts, flags placed, or durations.

Remember: headline ≤8 words, narrative exactly 2 sentences, shareText
≤240 chars with {url} token and @SkillOS mention.`;

  return { system, user: summarizeRecapMatch(req) };
}
