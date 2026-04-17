import type {
  Enemy,
  EnemyType,
  Tower,
  TowerDefenseState,
  TowerType,
} from "./types";

export const GRID_ROWS = 10;
export const GRID_COLS = 10;
export const TILE = 40;
export const BOARD_WIDTH = GRID_COLS * TILE;
export const BOARD_HEIGHT = GRID_ROWS * TILE;
export const INITIAL_LIVES = 20;
export const INITIAL_GOLD = 100;
export const WAVES_TOTAL = 10;

export const TOWER_STATS: Record<
  TowerType,
  Omit<Tower, "x" | "y" | "cooldownMs">
> = {
  arrow: { type: "arrow", range: 2 * TILE, damage: 10, fireRateMs: 800 },
  cannon: { type: "cannon", range: 3 * TILE, damage: 25, fireRateMs: 1500 },
  magic: { type: "magic", range: 2.5 * TILE, damage: 15, fireRateMs: 600 },
};

export const TOWER_COST: Record<TowerType, number> = {
  arrow: 30,
  cannon: 70,
  magic: 50,
};

export const ENEMY_STATS: Record<
  EnemyType,
  Omit<Enemy, "id" | "pathIndex" | "t" | "hp">
> = {
  grunt: { type: "grunt", maxHp: 50, speed: 1.2, reward: 10 },
  fast: { type: "fast", maxHp: 30, speed: 2.5, reward: 15 },
  tank: { type: "tank", maxHp: 200, speed: 0.7, reward: 40 },
};

// Path: fixed Z-route — waypoints as [col, row]
const PATH: [number, number][] = [
  [0, 2],
  [3, 2],
  [3, 5],
  [6, 5],
  [6, 2],
  [9, 2],
];

export function createInitialState(seed: number): TowerDefenseState {
  const grid: ("path" | "placeable" | "blocked")[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: ("path" | "placeable" | "blocked")[] = [];
    for (let c = 0; c < GRID_COLS; c++) row.push("placeable");
    grid.push(row);
  }
  // Mark path tiles along each waypoint segment (vertical or horizontal).
  for (let i = 0; i < PATH.length - 1; i++) {
    const [sc, sr] = PATH[i];
    const [ec, er] = PATH[i + 1];
    if (sc === ec) {
      const [a, b] = sr < er ? [sr, er] : [er, sr];
      for (let r = a; r <= b; r++) grid[r][sc] = "path";
    } else {
      const [a, b] = sc < ec ? [sc, ec] : [ec, sc];
      for (let c = a; c <= b; c++) grid[sr][c] = "path";
    }
  }
  return {
    grid,
    path: PATH,
    towers: [],
    enemies: [],
    wave: 0,
    waveEnemiesRemaining: 0,
    waveSpawnTimer: 0,
    lives: INITIAL_LIVES,
    gold: INITIAL_GOLD,
    score: 0,
    elapsedMs: 0,
    status: "playing",
    seed,
    rng: seed || 1,
  };
}

export function placeTower(
  state: TowerDefenseState,
  col: number,
  row: number,
  type: TowerType,
): TowerDefenseState | null {
  if (state.status !== "playing") return null;
  if (state.grid[row]?.[col] !== "placeable") return null;
  if (state.towers.some((t) => t.x === col && t.y === row)) return null;
  const cost = TOWER_COST[type];
  if (state.gold < cost) return null;
  const stats = TOWER_STATS[type];
  const newTower: Tower = { x: col, y: row, cooldownMs: 0, ...stats };
  return {
    ...state,
    gold: state.gold - cost,
    towers: [...state.towers, newTower],
  };
}

export function startWave(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== "playing") return state;
  if (state.waveEnemiesRemaining > 0 || state.enemies.length > 0) return state;
  const newWave = state.wave + 1;
  const count = 5 + newWave * 2;
  return {
    ...state,
    wave: newWave,
    waveEnemiesRemaining: count,
    waveSpawnTimer: 0,
  };
}

export function tick(state: TowerDefenseState, dt: number): TowerDefenseState {
  if (state.status !== "playing") return state;

  let rng = state.rng;
  let waveSpawnTimer = state.waveSpawnTimer - dt;
  let waveEnemiesRemaining = state.waveEnemiesRemaining;
  let enemies = [...state.enemies];

  // Spawn enemies
  if (waveEnemiesRemaining > 0 && waveSpawnTimer <= 0) {
    rng = Math.imul(rng, 2654435761) >>> 0;
    const r = rng / 0x100000000;
    const type: EnemyType = r < 0.6 ? "grunt" : r < 0.85 ? "fast" : "tank";
    const stats = ENEMY_STATS[type];
    enemies.push({
      id: `e-${Date.now()}-${rng}`,
      ...stats,
      hp: stats.maxHp,
      pathIndex: 0,
      t: 0,
    });
    waveEnemiesRemaining--;
    waveSpawnTimer = 800;
  }

  // Move enemies along the path
  let lives = state.lives;
  const dtSec = dt / 1000;
  enemies = enemies
    .map((e) => {
      let { pathIndex, t } = e;
      t += e.speed * dtSec;
      while (t >= 1 && pathIndex < state.path.length - 2) {
        pathIndex++;
        t -= 1;
      }
      return { ...e, pathIndex, t };
    })
    .filter((e) => {
      if (e.pathIndex >= state.path.length - 2 && e.t >= 1) {
        lives--;
        return false;
      }
      return true;
    });

  // Towers fire at first enemy in range
  const towers = state.towers.map((tw) => ({
    ...tw,
    cooldownMs: Math.max(0, tw.cooldownMs - dt),
  }));
  let score = state.score;
  let gold = state.gold;
  for (const tw of towers) {
    if (tw.cooldownMs > 0) continue;
    const twX = tw.x * TILE + TILE / 2;
    const twY = tw.y * TILE + TILE / 2;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const [c1, r1] = state.path[e.pathIndex];
      const [c2, r2] = state.path[e.pathIndex + 1];
      const ex = (c1 + (c2 - c1) * e.t) * TILE + TILE / 2;
      const ey = (r1 + (r2 - r1) * e.t) * TILE + TILE / 2;
      const d = Math.sqrt((ex - twX) ** 2 + (ey - twY) ** 2);
      if (d <= tw.range) {
        e.hp -= tw.damage;
        tw.cooldownMs = tw.fireRateMs;
        if (e.hp <= 0) {
          score += e.reward * 2;
          gold += e.reward;
        }
        break;
      }
    }
  }
  enemies = enemies.filter((e) => e.hp > 0);

  // Lose?
  if (lives <= 0) return { ...state, lives: 0, status: "gameOver" };
  // Win?
  if (
    state.wave >= WAVES_TOTAL &&
    waveEnemiesRemaining === 0 &&
    enemies.length === 0
  ) {
    return { ...state, status: "won", towers, enemies, lives, gold, score };
  }

  return {
    ...state,
    towers,
    enemies,
    lives,
    gold,
    score,
    waveSpawnTimer,
    waveEnemiesRemaining,
    elapsedMs: state.elapsedMs + dt,
    rng,
  };
}

export function calculateScore(state: TowerDefenseState): number {
  const winBonus = state.status === "won" ? 1000 : 0;
  const livesBonus = state.lives * 10;
  const waveBonus = state.wave * 50;
  return state.score + winBonus + livesBonus + waveBonus;
}
