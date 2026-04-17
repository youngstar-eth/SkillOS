
OYUN: Crossy Road
TOURNAMENT ID: 12
PORT: 3012
WORKTREE: /Users/inancayvaz/MAS-crossy
BRANCH: game/crossy
DESIGN: Pixel 8-bit (PICO-8 palette — 16 renk, chunky pixels)

═══ ADIM 0: TEMPLATE ═══

cd /Users/inancayvaz/MAS-crossy
cp -r templates/game apps/crossy
cd apps/crossy
grep -rl __GAME_NAME__ . | xargs sed -i '' 's/__GAME_NAME__/crossy/g'
grep -rl __GAME_TITLE__ . | xargs sed -i '' 's/__GAME_TITLE__/Crossy/g'
grep -rl __PORT__ . | xargs sed -i '' 's/__PORT__/3012/g'
cd /Users/inancayvaz/MAS-crossy && npm install

═══ ADIM 1: ENGINE ═══

types.ts:

export type RowType = 'grass' | 'road' | 'water' | 'rail'

export interface Vehicle {
  x: number
  width: number
  speed: number    // positive = right, negative = left
}

export interface Log {
  x: number
  width: number
  speed: number
}

export interface Row {
  y: number
  type: RowType
  vehicles?: Vehicle[]
  logs?: Log[]
  speed?: number
  direction?: 1 | -1
}

export interface CrossyState {
  player: { x: number; y: number; onLog?: Log | null }
  rows: Row[]          // 0'dan yukarı, index arttıkça score artar
  cameraY: number       // player'ın sabit ekran pozisyonu için
  maxY: number          // en yüksek ulaştığı y (score bu)
  elapsedMs: number
  status: 'playing' | 'gameOver'
  seed: number
  rng: number
}

engine.ts:

export const TILE = 48
export const COLS = 9
export const BOARD_WIDTH = TILE * COLS
export const BOARD_HEIGHT = TILE * 11
export const ROW_SPAWN_AHEAD = 20
export const SAFE_ROWS_START = 3

export function createInitialState(seed: number): CrossyState {
  let rng = seed || 1
  const rows: Row[] = []
  for (let i = 0; i < SAFE_ROWS_START; i++) {
    rows.push({ y: i, type: 'grass' })
  }
  for (let i = SAFE_ROWS_START; i < ROW_SPAWN_AHEAD; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0
    const r = rng / 0x100000000
    const type: RowType = r < 0.45 ? 'road' : r < 0.75 ? 'water' : 'grass'
    if (type === 'road') {
      rng = Math.imul(rng, 2654435761) >>> 0
      const dir = (rng & 1) ? 1 : -1
      rng = Math.imul(rng, 2654435761) >>> 0
      const speed = (0.8 + (rng / 0x100000000) * 1.6) * dir
      const vehicles: Vehicle[] = []
      let vx = dir > 0 ? -200 : BOARD_WIDTH + 100
      for (let k = 0; k < 3; k++) {
        rng = Math.imul(rng, 2654435761) >>> 0
        const width = TILE * (1 + Math.floor((rng / 0x100000000) * 2))
        vehicles.push({ x: vx, width, speed })
        vx += (width + TILE * 2.5) * dir
      }
      rows.push({ y: i, type, vehicles, speed, direction: dir })
    } else if (type === 'water') {
      rng = Math.imul(rng, 2654435761) >>> 0
      const dir = (rng & 1) ? 1 : -1
      rng = Math.imul(rng, 2654435761) >>> 0
      const speed = (0.5 + (rng / 0x100000000) * 1.0) * dir
      const logs: Log[] = []
      let lx = 0
      for (let k = 0; k < 3; k++) {
        rng = Math.imul(rng, 2654435761) >>> 0
        const width = TILE * (2 + Math.floor((rng / 0x100000000) * 2))
        logs.push({ x: lx, width, speed })
        lx += width + TILE * 2
      }
      rows.push({ y: i, type, logs, speed, direction: dir })
    } else {
      rows.push({ y: i, type: 'grass' })
    }
  }
  return {
    player: { x: Math.floor(COLS / 2) * TILE, y: 0 },
    rows, cameraY: 0, maxY: 0,
    elapsedMs: 0, status: 'playing', seed, rng,
  }
}

export function move(state: CrossyState, dir: 'up' | 'down' | 'left' | 'right'): CrossyState {
  if (state.status !== 'playing') return state
  let { x, y } = state.player
  if (dir === 'up') y++
  if (dir === 'down' && y > 0) y--
  if (dir === 'left' && x > 0) x -= TILE
  if (dir === 'right' && x < (COLS - 1) * TILE) x += TILE
  const newState = { ...state, player: { x, y }, maxY: Math.max(state.maxY, y) }
  return newState
}

export function tick(state: CrossyState, dt: number): CrossyState {
  if (state.status !== 'playing') return state
  const frame = Math.min(dt, 50) / 16.67
  const rows = state.rows.map(r => {
    if (r.vehicles) {
      return {
        ...r,
        vehicles: r.vehicles.map(v => {
          let newX = v.x + v.speed * frame * TILE / 10
          if (v.speed > 0 && newX > BOARD_WIDTH + 200) newX = -v.width - 50
          if (v.speed < 0 && newX < -v.width - 200) newX = BOARD_WIDTH + 50
          return { ...v, x: newX }
        })
      }
    }
    if (r.logs) {
      return {
        ...r,
        logs: r.logs.map(l => {
          let newX = l.x + l.speed * frame * TILE / 10
          if (l.speed > 0 && newX > BOARD_WIDTH + 100) newX = -l.width - 50
          if (l.speed < 0 && newX < -l.width - 100) newX = BOARD_WIDTH + 50
          return { ...l, x: newX }
        })
      }
    }
    return r
  })

  // Player on log?
  const playerRow = rows.find(r => r.y === state.player.y)
  let playerX = state.player.x
  let onLog: Log | null = null
  if (playerRow?.type === 'water' && playerRow.logs) {
    const px = state.player.x + TILE / 2
    for (const log of playerRow.logs) {
      if (px >= log.x && px <= log.x + log.width) {
        onLog = log
        playerX += log.speed * frame * TILE / 10
        break
      }
    }
    if (!onLog) return { ...state, rows, status: 'gameOver' }
    if (playerX < 0 || playerX > BOARD_WIDTH - TILE) return { ...state, rows, status: 'gameOver' }
  }

  // Collision with vehicle
  if (playerRow?.type === 'road' && playerRow.vehicles) {
    const px = state.player.x
    for (const v of playerRow.vehicles) {
      if (px + TILE > v.x && px < v.x + v.width) {
        return { ...state, rows, status: 'gameOver' }
      }
    }
  }

  return {
    ...state,
    rows,
    player: { ...state.player, x: playerX, onLog },
    elapsedMs: state.elapsedMs + dt,
  }
}

export function calculateScore(state: CrossyState): number {
  return state.maxY * 10
}

═══ ADIM 2: TESTLER (min 12) ═══

createInitialState: safe rows at start
move up: y++
move down: y-- (not below 0)
move left/right: x bounded
tick: vehicles move
tick: vehicles wrap around
tick: logs move
player on log: carried along with log
player on log at edge: gameOver
player on water without log: gameOver
player hit by vehicle: gameOver
player on grass: safe
maxY tracks highest reached y

═══ ADIM 3: UI ═══

Canvas 432×528 (9×11 tiles × 48px)
Top-down render:
  Grass: green, dotted texture
  Road: gray, dashed yellow center lines
  Water: blue with wave pattern
  Player: chicken sprite (yellow block + beak + eye)
  Vehicles: colored rectangles (car, truck shapes)
  Logs: brown rectangles, wood texture

Camera follows player up (player always at y=row 2 from bottom).

Controls:
  Arrow keys: up/down/left/right
  Swipe: same
  Tap top of screen: up (most common)

Tournament ID: 12n

═══ ADIM 4: DESIGN — Pixel 8-bit ═══

:root {
  --color-bg: 29 43 83;        /* PICO-8 dark blue */
  --color-fg: 255 241 232;     /* PICO-8 tan */
  --color-surface: 95 87 79;
  --color-border: 194 195 199;
  --color-accent: 255 236 39;  /* yellow */
  --color-grass: 0 135 81;     /* green */
  --color-road: 95 87 79;      /* dark gray */
  --color-water: 41 173 255;   /* blue */
  --color-danger: 255 0 77;    /* pink-red */
  --font-primary: 'Press Start 2P', 'JetBrains Mono', monospace;
  --font-body: 'JetBrains Mono', monospace;
}

body {
  background: rgb(var(--color-bg));
  color: rgb(var(--color-fg));
  font-family: var(--font-primary);
  image-rendering: pixelated;
}

.pixel-button {
  background: rgb(var(--color-accent));
  color: rgb(var(--color-bg));
  border: 4px solid rgb(var(--color-fg));
  box-shadow: 4px 4px 0 rgb(var(--color-bg));
  font-family: var(--font-primary);
  letter-spacing: 0.1em;
}

Canvas: ctx.imageSmoothingEnabled = false. Chunky pixel art.
