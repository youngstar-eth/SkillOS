export interface Vec2 {
  x: number;
  y: number;
}

export interface Paddle {
  /** Top-y of the paddle in virtual board units (0..BOARD_HEIGHT). */
  y: number;
  /** Current velocity in px/frame at 60fps. */
  vy: number;
}

export type GameStatus = "ready" | "playing" | "finished";

export interface PongState {
  ball: Vec2;
  ballVelocity: Vec2;
  playerPaddle: Paddle;
  aiPaddle: Paddle;
  /** Goals scored on the AI. */
  playerScore: number;
  /** Goals the AI scored on you. */
  aiScore: number;
  /** Paddle hits in the CURRENT rally. */
  rallyCount: number;
  /** Total paddle hits across the whole match (feeds final score). */
  totalRallies: number;
  /** Longest rally seen this match (reported at game-over). */
  maxRally: number;
  /** Current ball speed (increases with each hit). */
  ballSpeed: number;
  elapsedMs: number;
  durationMs: number;
  status: GameStatus;
  seed: number;
}
