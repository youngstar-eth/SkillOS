// ───────────────────────────────────────────────────────────────────────────
// Per-game coach prompt — Sudoku. Tone: "technique".
//
// Sudoku is a constraint-propagation puzzle. Skill shows in recognizing
// logical techniques rather than brute-force guessing. Lexicon the coach
// should use:
//   - naked single / hidden single
//   - naked pair / hidden pair
//   - pointing pair / box-line reduction
//   - X-wing / swordfish (harder tier)
//
// Useful gameSpecificData keys (populated by apps/sudoku if available):
//   - difficulty: 'easy'|'medium'|'hard'|'expert'
//   - errorsMade: number      — invalid placements before undo
//   - hintsUsed: number       — auto-hints consumed
//   - cellsRemaining: number  — if match ended unfinished
// ───────────────────────────────────────────────────────────────────────────

import type { CoachRequest } from "../types";
import { COACH_SYSTEM_BASE, summarizeMatch } from "./base";

export function buildSudokuPrompt(req: CoachRequest): {
  system: string;
  user: string;
} {
  const system = `${COACH_SYSTEM_BASE}

Game: Sudoku. Tone: "technique".
Speak the language of solvers: naked singles, hidden singles, naked pairs,
pointing pairs, X-wing when appropriate. If errorsMade > 0, note that
likely came from guessing instead of scanning. If difficulty is provided,
calibrate expectations — a long duration on "expert" is good; a long
duration on "easy" suggests missed obvious singles. Be crisp, not preachy.

When emitting the tone field, use exactly: "technique".`;

  return { system, user: summarizeMatch(req) };
}
