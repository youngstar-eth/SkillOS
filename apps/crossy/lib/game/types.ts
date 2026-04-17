export type RowType = "grass" | "road" | "water" | "rail";

export interface Vehicle {
  x: number;
  width: number;
  speed: number; // positive = right, negative = left
}

export interface Log {
  x: number;
  width: number;
  speed: number;
}

export interface Row {
  y: number;
  type: RowType;
  vehicles?: Vehicle[];
  logs?: Log[];
  speed?: number;
  direction?: 1 | -1;
}

export interface CrossyState {
  player: { x: number; y: number; onLog?: Log | null };
  rows: Row[]; // 0 and up, index up = score up
  cameraY: number; // player fixed on-screen position
  maxY: number; // highest y reached (score basis)
  elapsedMs: number;
  status: "playing" | "gameOver";
  seed: number;
  rng: number;
}
