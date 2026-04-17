export type TowerType = "arrow" | "cannon" | "magic";
export type EnemyType = "grunt" | "fast" | "tank";

export interface Tower {
  x: number; // grid col
  y: number; // grid row
  type: TowerType;
  cooldownMs: number;
  range: number;
  damage: number;
  fireRateMs: number;
}

export interface Enemy {
  id: string;
  type: EnemyType;
  pathIndex: number; // current path node
  t: number; // progress between pathIndex and pathIndex+1
  hp: number;
  maxHp: number;
  speed: number; // tiles per second
  reward: number;
}

export interface TowerDefenseState {
  grid: ("path" | "placeable" | "blocked")[][]; // 10x10
  path: [number, number][]; // waypoints
  towers: Tower[];
  enemies: Enemy[];
  wave: number;
  waveEnemiesRemaining: number;
  waveSpawnTimer: number;
  lives: number; // 20 start
  gold: number; // 100 start
  score: number;
  elapsedMs: number;
  status: "playing" | "gameOver" | "won";
  seed: number;
  rng: number;
}
