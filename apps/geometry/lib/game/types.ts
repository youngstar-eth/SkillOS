export type ObstacleType = "spike" | "block" | "gap";

export interface Obstacle {
  x: number;
  type: ObstacleType;
  height: number;
}

export type GameStatus = "playing" | "gameOver";

export interface GeometryState {
  playerX: number;
  playerY: number;
  playerVy: number;
  groundY: number;
  obstacles: Obstacle[];
  distance: number;
  speed: number;
  isOnGround: boolean;
  elapsedMs: number;
  status: GameStatus;
  seed: number;
  rng: number;
}

// Alias so shared components/types that expect a "GameState" still work.
export type GameState = GeometryState;
