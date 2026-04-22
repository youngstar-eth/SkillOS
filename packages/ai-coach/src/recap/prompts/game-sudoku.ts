// ───────────────────────────────────────────────────────────────────────────
// Per-game recap prompt — Sudoku.
//
// Style applicability matrix:
// applicable: [standard, blowout, nailBiter, speedRun, grind, comeback]
// disabled:   []
//
// Vocabulary: cells, candidates, pencil marks, region, row, column, box,
//             solve, hidden single, naked single (optional, if earned).
//
// Useful gameSpecificData keys (same as coach sudoku):
//   - difficulty: 'easy'|'medium'|'hard'|'expert'
//   - errorsMade: number
//   - hintsUsed: number
//   - cellsRemaining: number
//   - cellCorrectionRate: number — corrections per minute in the late half
//                                  of the match; a spike is the comeback
//                                  signal for sudoku.
// ───────────────────────────────────────────────────────────────────────────

import type { RecapRequest } from "../types";
import { RECAP_SYSTEM_BASE, summarizeRecapMatch } from "./base";

/**
 * Per-game thresholds. Sudoku duration bands are wider than 2048 because
 * difficulty varies 4x; speedRun is "impressively fast even for easy",
 * grind is "noticeably slow even for expert".
 */
const THRESHOLDS = {
  blowoutRatio: 2,
  nailBiterDeltaPct: 10,
  speedRunSec: 120, // solve well under 2 min → speedRun candidate
  grindSec: 600, // duration well over 10 min → grind candidate
} as const;

export function buildSudokuRecapPrompt(req: RecapRequest): {
  system: string;
  user: string;
} {
  const { blowoutRatio, nailBiterDeltaPct, speedRunSec, grindSec } = THRESHOLDS;

  const system = `${RECAP_SYSTEM_BASE}

Game: Sudoku (constraint-propagation puzzle). Vocabulary: cells, candidates,
pencil marks, region, row, column, box, solve. You may reference "hidden
single" or "naked single" if the match summary gives you evidence to
support it — never invent a technique claim. Do NOT address the player in
second person.

Style selection rules for this game (pick "standard" if nothing fits):
- "blowout"   — winner's score ≥ ${blowoutRatio}× loser's, OR only the
                winner completed the board (loser stalled with
                cellsRemaining > 0).
- "nailBiter" — |score delta| ≤ ${nailBiterDeltaPct}% of the higher score
                AND both solved OR both unfinished.
- "speedRun"  — duration under ${speedRunSec}s AND the board was solved.
- "grind"     — duration over ${grindSec}s.
- "comeback"  — ONLY if gameSpecificData.cellCorrectionRate spiked late
                (value notably higher than early rate) — a late burst of
                corrections indicates the winner caught up. Never
                fabricate a comeback without this signal.
- "standard"  — fall back here whenever the match is ordinary.

Voice anchors for this game:
- standard:  "Expert board, 4:12. Clean run, zero corrections."
- comeback:  "Opponent led at halfway. A cascade of hidden singles closed it out."
- blowout:   "Winner swept the region while opponent stalled at 38 cells left."
- nailBiter: "Both finished. Eleven-second gap decided it."
- speedRun:  "Expert sudoku in 94 seconds. Hidden singles on sight."
- grind:     "Twelve minutes, zero hints. A slow solve, still a solve."

Numbers in your output MUST come from the match summary. Never invent
cells remaining, durations, or difficulty.

Remember: headline ≤8 words, narrative exactly 2 sentences, shareText
≤240 chars with {url} token and @skillbase mention.`;

  return { system, user: summarizeRecapMatch(req) };
}
