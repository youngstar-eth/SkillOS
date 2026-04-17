export interface Anchor {
  x: number;
  y: number;
  radius: number;
}

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  deadly: boolean;
}

export type GameStatus = "playing" | "won" | "gameOver";

export interface StickmanState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ropeAnchor: Anchor | null;
  ropeLength: number | null;
  anchors: Anchor[];
  obstacles: Obstacle[];
  flagX: number;
  flagY: number;
  cameraX: number;
  status: GameStatus;
  distance: number;
  seed: number;
  rng: number;
}
