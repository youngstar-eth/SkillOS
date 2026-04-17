
OYUN: Tower Defense
TOURNAMENT ID: 17
PORT: 3017
WORKTREE: /Users/inancayvaz/MAS-tower
BRANCH: game/tower
DESIGN: Steampunk

═══ ADIM 1: ENGINE ═══

types.ts:

export type TowerType = 'arrow' | 'cannon' | 'magic'
export type EnemyType = 'grunt' | 'fast' | 'tank'

export interface Tower {
  x: number          // grid col
  y: number          // grid row
  type: TowerType
  cooldownMs: number
  range: number
  damage: number
  fireRateMs: number
}

export interface Enemy {
  id: string
  type: EnemyType
  pathIndex: number       // current path node
  t: number                // progress between pathIndex and pathIndex+1
  hp: number
  maxHp: number
  speed: number            // tiles per second
  reward: number
}

export interface TowerDefenseState {
  grid: ('path' | 'placeable' | 'blocked')[][]    // 10×10
  path: [number, number][]                          // waypoints
  towers: Tower[]
  enemies: Enemy[]
  wave: number
  waveEnemiesRemaining: number
  waveSpawnTimer: number
  lives: number             // 20 start
  gold: number              // 100 start
  score: number
  elapsedMs: number
  status: 'playing' | 'gameOver' | 'won'
  seed: number
  rng: number
}

engine.ts:

export const GRID_ROWS = 10
export const GRID_COLS = 10
export const TILE = 40
export const BOARD_WIDTH = GRID_COLS * TILE
export const BOARD_HEIGHT = GRID_ROWS * TILE
export const INITIAL_LIVES = 20
export const INITIAL_GOLD = 100
export const WAVES_TOTAL = 10

export const TOWER_STATS: Record<TowerType, Omit<Tower, 'x'|'y'|'cooldownMs'>> = {
  arrow: { type: 'arrow', range: 2 * TILE, damage: 10, fireRateMs: 800 },
  cannon: { type: 'cannon', range: 3 * TILE, damage: 25, fireRateMs: 1500 },
  magic: { type: 'magic', range: 2.5 * TILE, damage: 15, fireRateMs: 600 },
}

export const TOWER_COST: Record<TowerType, number> = {
  arrow: 30, cannon: 70, magic: 50,
}

export const ENEMY_STATS: Record<EnemyType, Omit<Enemy, 'id'|'pathIndex'|'t'|'hp'>> = {
  grunt: { type: 'grunt', maxHp: 50, speed: 1.2, reward: 10 },
  fast: { type: 'fast', maxHp: 30, speed: 2.5, reward: 15 },
  tank: { type: 'tank', maxHp: 200, speed: 0.7, reward: 40 },
}

// Path: sabit Z-route
const PATH: [number, number][] = [
  [0, 2], [3, 2], [3, 5], [6, 5], [6, 2], [9, 2],
]

export function createInitialState(seed: number): TowerDefenseState {
  const grid: ('path'|'placeable'|'blocked')[][] = []
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: ('path'|'placeable'|'blocked')[] = []
    for (let c = 0; c < GRID_COLS; c++) row.push('placeable')
    grid.push(row)
  }
  // Mark path tiles
  for (let i = 0; i < PATH.length - 1; i++) {
    const [sc, sr] = PATH[i]
    const [ec, er] = PATH[i+1]
    if (sc === ec) {
      const [a, b] = sr < er ? [sr, er] : [er, sr]
      for (let r = a; r <= b; r++) grid[r][sc] = 'path'
    } else {
      const [a, b] = sc < ec ? [sc, ec] : [ec, sc]
      for (let c = a; c <= b; c++) grid[sr][c] = 'path'
    }
  }
  return {
    grid, path: PATH,
    towers: [], enemies: [],
    wave: 0, waveEnemiesRemaining: 0, waveSpawnTimer: 0,
    lives: INITIAL_LIVES, gold: INITIAL_GOLD, score: 0,
    elapsedMs: 0, status: 'playing',
    seed, rng: seed || 1,
  }
}

export function placeTower(state: TowerDefenseState, col: number, row: number, type: TowerType): TowerDefenseState | null {
  if (state.status !== 'playing') return null
  if (state.grid[row]?.[col] !== 'placeable') return null
  if (state.towers.some(t => t.x === col && t.y === row)) return null
  const cost = TOWER_COST[type]
  if (state.gold < cost) return null
  const stats = TOWER_STATS[type]
  const newTower: Tower = { x: col, y: row, cooldownMs: 0, ...stats }
  return {
    ...state,
    gold: state.gold - cost,
    towers: [...state.towers, newTower],
  }
}

export function startWave(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'playing') return state
  if (state.waveEnemiesRemaining > 0 || state.enemies.length > 0) return state
  const newWave = state.wave + 1
  const count = 5 + newWave * 2
  return {
    ...state,
    wave: newWave,
    waveEnemiesRemaining: count,
    waveSpawnTimer: 0,
  }
}

export function tick(state: TowerDefenseState, dt: number): TowerDefenseState {
  if (state.status !== 'playing') return state

  let rng = state.rng
  let waveSpawnTimer = state.waveSpawnTimer - dt
  let waveEnemiesRemaining = state.waveEnemiesRemaining
  let enemies = [...state.enemies]

  // Spawn enemies
  if (waveEnemiesRemaining > 0 && waveSpawnTimer <= 0) {
    rng = Math.imul(rng, 2654435761) >>> 0
    const r = rng / 0x100000000
    const type: EnemyType = r < 0.6 ? 'grunt' : r < 0.85 ? 'fast' : 'tank'
    const stats = ENEMY_STATS[type]
    enemies.push({
      id: `e-${Date.now()}-${rng}`,
      ...stats, hp: stats.maxHp,
      pathIndex: 0, t: 0,
    })
    waveEnemiesRemaining--
    waveSpawnTimer = 800
  }

  // Move enemies
  let lives = state.lives
  const dtSec = dt / 1000
  enemies = enemies.map(e => {
    let { pathIndex, t } = e
    t += e.speed * dtSec
    while (t >= 1 && pathIndex < state.path.length - 2) {
      pathIndex++
      t -= 1
    }
    return { ...e, pathIndex, t }
  }).filter(e => {
    if (e.pathIndex >= state.path.length - 2 && e.t >= 1) {
      lives--
      return false
    }
    return true
  })

  // Towers fire
  const towers = state.towers.map(tw => ({ ...tw, cooldownMs: Math.max(0, tw.cooldownMs - dt) }))
  let score = state.score
  let gold = state.gold
  for (const tw of towers) {
    if (tw.cooldownMs > 0) continue
    const twX = tw.x * TILE + TILE / 2
    const twY = tw.y * TILE + TILE / 2
    // Find target (first enemy in range)
    for (const e of enemies) {
      if (e.hp <= 0) continue
      const [c1, r1] = state.path[e.pathIndex]
      const [c2, r2] = state.path[e.pathIndex + 1]
      const ex = (c1 + (c2 - c1) * e.t) * TILE + TILE / 2
      const ey = (r1 + (r2 - r1) * e.t) * TILE + TILE / 2
      const d = Math.sqrt((ex - twX)**2 + (ey - twY)**2)
      if (d <= tw.range) {
        e.hp -= tw.damage
        tw.cooldownMs = tw.fireRateMs
        if (e.hp <= 0) {
          score += e.reward * 2
          gold += e.reward
        }
        break
      }
    }
  }
  enemies = enemies.filter(e => e.hp > 0)

  // Lose?
  if (lives <= 0) return { ...state, lives: 0, status: 'gameOver' }
  // Win?
  if (state.wave >= WAVES_TOTAL && waveEnemiesRemaining === 0 && enemies.length === 0) {
    return { ...state, status: 'won', towers, enemies, lives, gold, score }
  }

  return {
    ...state,
    towers, enemies, lives, gold, score,
    waveSpawnTimer, waveEnemiesRemaining,
    elapsedMs: state.elapsedMs + dt,
    rng,
  }
}

export function calculateScore(state: TowerDefenseState): number {
  const winBonus = state.status === 'won' ? 1000 : 0
  const livesBonus = state.lives * 10
  const waveBonus = state.wave * 50
  return state.score + winBonus + livesBonus + waveBonus
}

═══ ADIM 2: TESTLER (min 12) ═══

createInitialState: grid with path
placeTower: valid placeable tile
placeTower: on path → null
placeTower: insufficient gold → null
placeTower: overlapping tower → null
startWave: increments wave, sets remaining
tick: enemy spawns
tick: enemy moves along path
tick: enemy reaches end → lives--
tick: tower fires at in-range enemy
tick: enemy dies → gold + score
tick: lives == 0 → gameOver
tick: wave N=10 cleared → won

═══ ADIM 3: UI ═══

Canvas 400×400 (10×10 grid)
Render:
  Path tiles: brown cobblestone
  Placeable: grass green
  Blocked: dark
  Towers: type-colored (arrow=brown, cannon=gray, magic=purple)
  Range preview on tower selection
  Enemies: body color by type (grunt=gray, fast=yellow, tank=red)
  HP bar above enemy
  Projectile flashes on fire

UI sidebar:
  Wave N / 10
  Lives (heart × N)
  Gold
  Score
  Tower buttons: Arrow ($30), Cannon ($70), Magic ($50)
  Start Wave button

Tournament ID: 17n

═══ ADIM 4: DESIGN — Steampunk ═══

:root {
  --color-bg: 45 30 20;
  --color-fg: 230 210 180;
  --color-surface: 70 50 35;
  --color-accent: 200 140 60;       /* brass */
  --color-accent-2: 160 80 40;      /* copper */
  --color-accent-3: 90 60 40;       /* leather */
  --color-cream: 240 225 200;
  --font-primary: 'IM Fell English', Georgia, serif;
  --font-body: 'Lora', Georgia, serif;
  --font-display: 'IM Fell English SC', serif;
}

body {
  background:
    radial-gradient(at 50% 0%, rgba(200,140,60,0.1), transparent),
    rgb(var(--color-bg));
  color: rgb(var(--color-fg));
  font-family: var(--font-body);
}

.brass-panel {
  background:
    linear-gradient(180deg, rgb(var(--color-accent)), rgb(var(--color-accent-2)));
  border: 2px solid rgb(var(--color-accent-3));
  box-shadow: inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.3);
}
