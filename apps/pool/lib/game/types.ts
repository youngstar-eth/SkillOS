export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pocketed: boolean;
  isCue: boolean;
}

export interface Pocket {
  x: number;
  y: number;
  radius: number;
}

export type PoolStatus = "aiming" | "simulating" | "finished";

export interface PoolState {
  balls: Ball[];
  pockets: Pocket[];
  aimAngle: number;
  aimPower: number;
  shotsFired: number;
  fouls: number;
  ballsPocketed: number;
  elapsedMs: number;
  status: PoolStatus;
  seed: number;
}
