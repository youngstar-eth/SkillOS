export type CellValue = number | null; // 1–9 or empty

export interface SudokuCell {
  value: CellValue;
  /** True if the cell was part of the initial puzzle; cannot be changed. */
  isGiven: boolean;
}

export type GameStatus = "playing" | "solved";

export interface SudokuState {
  /** 9×9 grid of user-facing cells. */
  grid: SudokuCell[][];
  /** Fully-solved 9×9 grid used for score evaluation. */
  solution: number[][];
  /** Original puzzle shape — used on reset. */
  puzzle: (number | null)[][];
  startedAt: number;
  status: GameStatus;
  selectedCell: [number, number] | null;
}

export const BOARD_SIZE = 9 as const;
