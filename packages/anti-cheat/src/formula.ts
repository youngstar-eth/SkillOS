// X20.0b — F0 deterministic plausibility formula.
//
// Pure function. No I/O, no randomness, no callers — wiring is X20.1.
// Per Option F lock (supplement v1.4 §3.13), this function is intended
// to become the SOLE on-chain authority for plausibility once X20.4 ships.

import { COEFFICIENTS } from "./coefficients";
import type { FormulaInput, FormulaVerdict } from "./types";

export function plausibility(input: FormulaInput): FormulaVerdict {
  const thresholds = COEFFICIENTS[input.game];
  const safeMoves = Math.max(input.moves, 1);

  const duration_per_move = input.durationMs / safeMoves;
  if (duration_per_move < thresholds.min_duration_per_move_ms) {
    return {
      plausible: false,
      reason: `duration/move ${duration_per_move.toFixed(0)}ms below ${thresholds.min_duration_per_move_ms}ms threshold`,
      confidence: 1.0,
      thresholds,
    };
  }

  const score_per_move = input.score / safeMoves;
  if (score_per_move > thresholds.max_score_per_move) {
    return {
      plausible: false,
      reason: `score/move ${score_per_move.toFixed(1)} exceeds ${thresholds.max_score_per_move}`,
      confidence: 1.0,
      thresholds,
    };
  }

  if (
    input.moves < thresholds.min_moves ||
    input.moves > thresholds.max_moves
  ) {
    return {
      plausible: false,
      reason: `moves ${input.moves} outside [${thresholds.min_moves}, ${thresholds.max_moves}]`,
      confidence: 1.0,
      thresholds,
    };
  }

  return {
    plausible: true,
    reason: "ok",
    confidence: 1.0,
    thresholds,
  };
}
