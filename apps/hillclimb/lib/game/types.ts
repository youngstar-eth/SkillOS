export type GameStatus = "playing" | "gameOver";

export interface HillState {
  carX: number;
  carY: number;
  carVx: number;
  carVy: number;
  carAngle: number; // radian
  carAngularVy: number;
  throttle: number; // -1 (brake), 0, 1 (gas)
  fuel: number; // 0..100
  fuelConsumed: number;
  terrain: number[]; // y values at each x step
  terrainStep: number; // 20px
  distance: number;
  maxDistance: number;
  elapsedMs: number;
  status: GameStatus;
  seed: number;
  rng: number;
}
