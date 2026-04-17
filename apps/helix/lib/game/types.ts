export type SegmentType = "normal" | "danger" | "gap";

export interface Segment {
  startAngle: number; // radian
  endAngle: number; // radian
  type: SegmentType;
}

export interface Platform {
  y: number;
  segments: Segment[];
  passed: boolean;
}

export type GameStatus = "playing" | "gameOver";

export interface HelixState {
  ballY: number; // world y, increases down
  ballVy: number;
  cylinderRotation: number; // radian, user input
  platforms: Platform[];
  score: number; // passed platforms
  combo: number; // consecutive passes without bounce
  elapsedMs: number;
  status: GameStatus;
  seed: number;
  rng: number;
}
