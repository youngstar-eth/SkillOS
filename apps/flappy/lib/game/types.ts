export interface Pipe {
  x: number;
  gapY: number;
  gapSize: number;
  passed: boolean;
}

export type FlappyStatus = "ready" | "playing" | "gameOver";

export interface FlappyState {
  birdY: number;
  birdVy: number;
  pipes: Pipe[];
  score: number;
  elapsedMs: number;
  status: FlappyStatus;
  seed: number;
  rng: number;
}
