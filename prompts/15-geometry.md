
OYUN: Geometry Dash (lite)
TOURNAMENT ID: 14
PORT: 3014
WORKTREE: /Users/inancayvaz/MAS-geometry
BRANCH: game/geometry
DESIGN: Glitchcore

═══ ADIM 0: TEMPLATE ═══

(aynı pattern)

═══ ADIM 1: ENGINE ═══

types.ts:

export type ObstacleType = 'spike' | 'block' | 'gap'

export interface Obstacle {
  x: number
  type: ObstacleType
  height: number   // spike height / block height
}

export interface GeometryState {
  playerX: number      // fixed ~100
  playerY: number
  playerVy: number
  groundY: number
  obstacles: Obstacle[]
  distance: number      // world x
  speed: number         // horizontal speed, increases over time
  isOnGround: boolean
  elapsedMs: number
  status: 'playing' | 'gameOver'
  seed: number
  rng: number
}

engine.ts:

export const BOARD_WIDTH = 800
export const BOARD_HEIGHT = 400
export const PLAYER_SIZE = 30
export const GROUND_Y = 340
export const GRAVITY = 0.8
export const JUMP_VELOCITY = -12
export const INITIAL_SPEED = 5
export const SPEED_INCREMENT_PER_SEC = 0.08

export function createInitialState(seed: number): GeometryState {
  let rng = seed || 1
  const obstacles: Obstacle[] = []
  let x = BOARD_WIDTH + 200
  for (let i = 0; i < 30; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0
    const r = rng / 0x100000000
    const type: ObstacleType = r < 0.5 ? 'spike' : r < 0.85 ? 'block' : 'gap'
    rng = Math.imul(rng, 2654435761) >>> 0
    const height = 30 + (rng / 0x100000000) * 40
    obstacles.push({ x, type, height })
    rng = Math.imul(rng, 2654435761) >>> 0
    x += 150 + (rng / 0x100000000) * 200
  }
  return {
    playerX: 100, playerY: GROUND_Y - PLAYER_SIZE,
    playerVy: 0, groundY: GROUND_Y,
    obstacles, distance: 0,
    speed: INITIAL_SPEED,
    isOnGround: true,
    elapsedMs: 0, status: 'playing',
    seed, rng,
  }
}

export function jump(state: GeometryState): GeometryState {
  if (state.status !== 'playing') return state
  if (!state.isOnGround) return state
  return { ...state, playerVy: JUMP_VELOCITY, isOnGround: false }
}

export function tick(state: GeometryState, dt: number): GeometryState {
  if (state.status !== 'playing') return state
  const frame = Math.min(dt, 50) / 16.67
  let playerY = state.playerY + state.playerVy * frame
  let playerVy = state.playerVy + GRAVITY * frame
  let isOnGround = false

  if (playerY >= state.groundY - PLAYER_SIZE) {
    playerY = state.groundY - PLAYER_SIZE
    playerVy = 0
    isOnGround = true
  }

  // Move obstacles left
  const obstacles = state.obstacles.map(o => ({
    ...o, x: o.x - state.speed * frame,
  })).filter(o => o.x > -100)

  // Collision check
  for (const ob of obstacles) {
    if (
      ob.x < state.playerX + PLAYER_SIZE &&
      ob.x + 40 > state.playerX
    ) {
      if (ob.type === 'spike') {
        if (playerY + PLAYER_SIZE > state.groundY - ob.height) {
          return { ...state, playerY, playerVy, status: 'gameOver' }
        }
      }
      if (ob.type === 'block') {
        // Must land on top
        if (playerY + PLAYER_SIZE > state.groundY - ob.height && !isOnGround) {
          // Side hit
          if (playerY + PLAYER_SIZE > state.groundY - ob.height + 10) {
            return { ...state, playerY, playerVy, status: 'gameOver' }
          }
          // Land on top
          playerY = state.groundY - ob.height - PLAYER_SIZE
          playerVy = 0
          isOnGround = true
        }
      }
      if (ob.type === 'gap' && isOnGround) {
        // Ground falls away here — must jump over
        if (state.playerX + PLAYER_SIZE > ob.x && state.playerX < ob.x + 80) {
          return { ...state, playerY, playerVy, status: 'gameOver' }
        }
      }
    }
  }

  const newSpeed = state.speed + SPEED_INCREMENT_PER_SEC * (dt / 1000)

  return {
    ...state, playerY, playerVy, obstacles,
    isOnGround,
    speed: newSpeed,
    distance: state.distance + state.speed * frame,
    elapsedMs: state.elapsedMs + dt,
  }
}

export function calculateScore(state: GeometryState): number {
  return Math.floor(state.distance / 10)
}

═══ ADIM 2: TESTLER (min 12) ═══

createInitialState: obstacles array, ground player
jump: velocity, onGround false
jump: midair → noop
tick: gravity
tick: land on ground
tick: obstacles move left
tick: obstacles filtered off-screen
tick: spike hit → gameOver
tick: block side hit → gameOver
tick: block top land → stand on it
tick: gap unjumped → gameOver
tick: speed increases over time
distance accumulates

═══ ADIM 3: UI ═══

Canvas 800×400, rAF loop

Render:
  Black bg
  Player: cyan square with rotation animation mid-air
  Ground: solid line, dashed pattern
  Spikes: triangles, red
  Blocks: colored rects (purple/magenta)
  Gaps: no ground + pit shown

Controls: Space/Tap/Click = jump

Glitch effect on death: scanlines + RGB shift overlay for 500ms

Tournament ID: 14n

═══ ADIM 4: DESIGN — Glitchcore ═══

:root {
  --color-bg: 8 8 12;
  --color-fg: 230 230 240;
  --color-surface: 20 20 30;
  --color-accent: 0 240 255;       /* cyan */
  --color-accent-2: 255 0 180;     /* magenta */
  --color-danger: 255 60 60;
  --color-warning: 255 200 0;
  --font-primary: 'Space Grotesk', sans-serif;
  --font-display: 'Major Mono Display', monospace;
}

body {
  background: rgb(var(--color-bg));
  color: rgb(var(--color-fg));
  font-family: var(--font-primary);
  position: relative;
}

body::before {
  content: '';
  position: fixed; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.015) 0 1px,
    transparent 1px 3px
  );
  z-index: 100;
}

.glitch-text {
  text-shadow:
    2px 0 rgb(var(--color-accent)),
    -2px 0 rgb(var(--color-accent-2));
  animation: glitch 3s infinite;
}
@keyframes glitch {
  0%, 90% { text-shadow: 2px 0 cyan, -2px 0 magenta; }
  92% { text-shadow: -3px 0 cyan, 3px 0 magenta; }
  94% { text-shadow: 1px 0 cyan, -1px 0 magenta; }
}
