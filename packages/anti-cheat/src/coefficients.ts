// X20.0b — Per-game plausibility envelope coefficients.
//
// Coefficient source: founder-spec PLACEHOLDER per sprint prompt.
// Data-calibration is a separate post-mainnet sub-sprint (per SCOPING.md
// §5.2 open question — hybrid bootstrap is the documented default once
// real testnet traffic accumulates).
//
// Per-axis semantics:
//   min_duration_per_move_ms — floor on (durationMs / moves); detects bots
//     that submit faster-than-human input cadence.
//   max_score_per_move      — ceiling on (score / moves); detects score
//     inflation relative to in-game scoring rules.
//   min_moves / max_moves   — sanity bounds on move count; catches zero-
//     move "instant win" submissions and absurd-move-count payloads.
//
// All checks are independent; a single failed check returns implausible
// with the specific failing reason — coefficients are not weighted.

import type { GameId, FormulaThresholds } from "./types";

export const COEFFICIENTS: Record<GameId, FormulaThresholds> = {
  "2048": {
    min_duration_per_move_ms: 100,
    max_score_per_move: 50,
    min_moves: 10,
    max_moves: 50_000,
  },
  wordle: {
    min_duration_per_move_ms: 200,
    max_score_per_move: 100,
    min_moves: 1,
    max_moves: 6,
  },
  sudoku: {
    min_duration_per_move_ms: 500,
    max_score_per_move: 200,
    min_moves: 20,
    max_moves: 200,
  },
  minesweeper: {
    min_duration_per_move_ms: 50,
    max_score_per_move: 30,
    min_moves: 1,
    max_moves: 1_000,
  },
  clicker: {
    min_duration_per_move_ms: 30,
    max_score_per_move: 10,
    min_moves: 1,
    max_moves: 100_000,
  },
  match3: {
    min_duration_per_move_ms: 150,
    max_score_per_move: 100,
    min_moves: 5,
    max_moves: 10_000,
  },
};
