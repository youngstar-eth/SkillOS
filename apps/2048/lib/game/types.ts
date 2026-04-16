export type Cell = number | null;
export type Row = Cell[];
export type Grid = Row[];
export type Direction = "up" | "down" | "left" | "right";

export type MoveResult = {
  grid: Grid;
  score: number;
  moved: boolean;
};

export const GRID_SIZE = 4 as const;
export const WINNING_TILE = 2048 as const;
