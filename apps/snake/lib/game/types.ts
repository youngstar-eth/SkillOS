export type Direction = "up" | "down" | "left" | "right";

/** Board coordinates, `[x, y]` with origin top-left. */
export type Cell = [number, number];

export type GameStatus = "playing" | "paused" | "gameOver";

export interface SnakeState {
  /** Head first, tail last. */
  snake: Cell[];
  food: Cell;
  /** Direction the head is currently moving. */
  direction: Direction;
  /** Buffered next direction (queued by input, committed on tick). */
  nextDirection: Direction;
  score: number;
  /** Total food eaten — feeds the speed-up ramp. */
  ateCount: number;
  status: GameStatus;
  /** Total frames advanced — used as food-respawn seed. */
  tick: number;
}

export const BOARD_SIZE = 20 as const;
