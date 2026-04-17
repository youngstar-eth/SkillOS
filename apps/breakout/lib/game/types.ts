export interface Vec2 {
  x: number;
  y: number;
}

export type BlockColor = "pink" | "purple" | "cyan" | "yellow";

export interface Block {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Remaining hits; `destroyed` once it drops to 0. */
  hits: number;
  maxHits: number;
  color: BlockColor;
  points: number;
  destroyed: boolean;
}

export type GameStatus =
  | "ready"
  | "playing"
  | "levelComplete"
  | "gameOver"
  | "won";

export interface BreakoutState {
  ball: Vec2;
  ballVelocity: Vec2;
  paddle: { x: number; y: number; width: number };
  blocks: Block[];
  lives: number;
  score: number;
  /** 1-indexed; last level = MAX_LEVELS. */
  level: number;
  /** Current unbroken-block streak; resets on paddle hit or life loss. */
  combo: number;
  maxCombo: number;
  elapsedMs: number;
  status: GameStatus;
  seed: number;
}
