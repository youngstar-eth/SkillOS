// ───────────────────────────────────────────────────────────────────────────
// Per-game plausibility — sudoku.
//
// Physics: 9x9 grid of candidates; logic-constrained fill. Even elite human
// solvers need minutes on non-trivial boards. A sub-60s solve on any
// real sudoku is essentially impossible by hand; sub-30s implies a solver
// tool driving the UI.
//
// Score model: Skillbase's sudoku score rewards correctness and often
// time — the shared summary gives us the final score and duration only.
// Difficulty level is not exposed today; prompts reason from the duration
// floor alone (even easy boards require ~60–120s of cell entry).
//
// Signals:
// - "subminute-solve"    — duration well below hand-solve floor
// - "speedrun-anomaly"   — paired with non-trivial score
// ───────────────────────────────────────────────────────────────────────────

import type { PlausibilityRequest } from "../types";
import { ANTICHEAT_SYSTEM_BASE, summarizeForAnticheat } from "./base";

export function buildSudokuAnticheatPrompt(
  req: PlausibilityRequest,
): { system: string; user: string } {
  const guidance = `GAME CONTEXT — sudoku:
- 9x9 grid, logic-constrained fill. Requires candidate tracking and pattern recognition.
- Elite human on easy: ~2 min. Medium: ~5 min. Hard: 10–20 min.
- Sub-60s is not achievable by hand on any non-trivial board.
- Typical honest play: 120–600s.

Plausibility bands:
- duration ≥ 120s → plausible
- duration 60–120s with non-zero score → suspicious (very fast even for easy)
- duration < 60s with non-zero score → implausible (below hand-entry floor)

Flags to consider: "subminute-solve", "speedrun-anomaly".`;

  return {
    system: `${ANTICHEAT_SYSTEM_BASE}\n\n${guidance}`,
    user: summarizeForAnticheat(req),
  };
}
