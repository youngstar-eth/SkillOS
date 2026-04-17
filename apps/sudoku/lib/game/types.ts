export type CellValue = number | null; // 1–9 or empty

export interface SudokuCell {
  value: CellValue;
  /** True if the cell was part of the initial puzzle; cannot be changed. */
  isGiven: boolean;
  /** User pencil-marks (1–9). */
  notes: Set<number>;
}

export type Difficulty = "easy" | "medium" | "hard";

export type GameStatus = "playing" | "solved" | "failed";

export interface SudokuState {
  /** 9×9 grid of user-facing cells. */
  grid: SudokuCell[][];
  /** Fully-solved 9×9 grid used for checking and hints. */
  solution: number[][];
  /** Original puzzle shape — used on restart. */
  puzzle: (number | null)[][];
  difficulty: Difficulty;
  seed: number;
  startedAt: number;
  hintsUsed: number;
  errorsCount: number;
  status: GameStatus;
  selectedCell: [number, number] | null;
}

export const BOARD_SIZE = 9 as const;
