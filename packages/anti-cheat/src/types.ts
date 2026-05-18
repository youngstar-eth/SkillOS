// X20.0b — F0 plausibility formula input/output types.
// Per docs/sprints/x20-anticheat-rebuild/SCOPING.md §6.2 and Option F lock
// (architecture supplement v1.4 §3.13): deterministic verdict + confidence,
// no LLM coupling, no randomness.

export type GameId =
  | "2048"
  | "wordle"
  | "sudoku"
  | "minesweeper"
  | "clicker"
  | "match3";

export interface FormulaThresholds {
  min_duration_per_move_ms: number;
  max_score_per_move: number;
  min_moves: number;
  max_moves: number;
}

export interface FormulaInput {
  game: GameId;
  durationMs: number;
  moves: number;
  score: number;
}

export interface FormulaVerdict {
  plausible: boolean;
  reason: string;
  confidence: number;
  thresholds: FormulaThresholds;
}
