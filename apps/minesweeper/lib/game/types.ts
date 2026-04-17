export type CellState = "hidden" | "revealed" | "flagged" | "question";

export interface Cell {
  isMine: boolean;
  /** Count of mines in the 8 surrounding cells. Zero for mine cells. */
  adjacentMines: number;
  state: CellState;
}

export type Difficulty = "beginner" | "intermediate";

export type GameStatus = "ready" | "playing" | "won" | "lost";

export interface MinesweeperState {
  /** board[row][col] */
  board: Cell[][];
  rows: number;
  cols: number;
  mineCount: number;
  /** Flags placed — can be >mineCount (mis-flagging is allowed). */
  flagCount: number;
  /** Number of non-mine cells currently revealed. */
  revealedCount: number;
  status: GameStatus;
  seed: number;
  /** `Date.now()` at first reveal; null while status === "ready". */
  startedAt: number | null;
  difficulty: Difficulty;
}

export const DIFFICULTY = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
} as const;
