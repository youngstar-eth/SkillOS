export type HazardType = "laser-h" | "laser-v" | "missile";

export interface Hazard {
  x: number;
  y: number;
  width: number;
  height: number;
  type: HazardType;
  speed?: number;
}

export interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

export interface JetpackState {
  playerY: number;
  playerVy: number;
  thrusting: boolean;
  hazards: Hazard[];
  coins: Coin[];
  distance: number;
  coinsCollected: number;
  speed: number;
  elapsedMs: number;
  status: "playing" | "gameOver";
  seed: number;
  rng: number;
}
