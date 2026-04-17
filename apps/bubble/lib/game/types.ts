export type BubbleColor = "red" | "pink" | "yellow" | "blue" | "purple" | "teal";

export interface Bubble {
  row: number;
  col: number;
  color: BubbleColor;
  /** Cached pixel centre (recomputed on row shift / re-layout). */
  x: number;
  y: number;
}

export interface FlyingBubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: BubbleColor;
}

export type GameStatus =
  | "aiming"
  | "flying"
  | "resolving"
  | "won"
  | "gameOver";

export interface BubbleState {
  /** `"row,col"` → Bubble. Map preserved across state updates; cloned on mutations. */
  grid: Map<string, Bubble>;
  flying: FlyingBubble | null;
  nextShooterColor: BubbleColor;
  currentShooterColor: BubbleColor;
  /** Radians; 0 = straight up, bounded to ±MAX_AIM_ANGLE. */
  aimAngle: number;
  shotsFired: number;
  bubblesPopped: number;
  score: number;
  /** Largest single-shot pop (match + drop) — final-score bonus multiplier. */
  maxCombo: number;
  rowsAdded: number;
  status: GameStatus;
  seed: number;
}
