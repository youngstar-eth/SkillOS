export type CellState = "hidden" | "revealed" | "flagged";

export interface Cell {
  isMine: boolean;
  /** Count of mines in the 8 surrounding cells. Zero for mine cells. */
  adjacentMines: number;
  state: CellState;
}

export type GameStatus = "playing" | "won" | "lost";

export interface MinesweeperState {
  /** board[row][col] */
  board: Cell[][];
  flagCount: number;
  /** Number of non-mine cells currently revealed. */
  revealedCount: number;
  status: GameStatus;
}

/** Single difficulty: classic "beginner" — 9×9 with 10 mines. */
export const BOARD_ROWS = 9 as const;
export const BOARD_COLS = 9 as const;
export const MINE_COUNT = 10 as const;
/** 81 − 10 = 71 non-mine cells. */
export const NON_MINE_CELLS = BOARD_ROWS * BOARD_COLS - MINE_COUNT;
