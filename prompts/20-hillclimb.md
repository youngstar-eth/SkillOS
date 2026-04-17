
OYUN: Hill Climb Racing
TOURNAMENT ID: 19
PORT: 3019
WORKTREE: /Users/inancayvaz/MAS-hillclimb
BRANCH: game/hillclimb
DESIGN: Dieselpunk

═══ ADIM 1: ENGINE ═══

types.ts:

export interface HillState {
  carX: number
  carY: number
  carVx: number
  carVy: number
  carAngle: number        // radian
  carAngularVy: number
  throttle: number        // -1 (brake), 0, 1 (gas)
  fuel: number             // 0..100
  fuelConsumed: number
  terrain: number[]        // y values at each x step
  terrainStep: number       // 20px
  distance: number
  maxDistance: number
  elapsedMs: number
  status: 'playing' | 'gameOver'
  seed: number
  rng: number
}

engine.ts:

export const BOARD_WIDTH = 800
export const BOARD_HEIGHT = 400
export const CAR_WIDTH = 60
export const CAR_HEIGHT = 30
export const GRAVITY = 0.35
export const TERRAIN_STEP = 20
export const MAX_FUEL = 100
export const FUEL_CONSUMPTION = 0.05    // per tick

export function createInitialState(seed: number): HillState {
  let rng = seed || 1
  const terrain: number[] = []
  const count = 2000
  let height = BOARD_HEIGHT - 100
  for (let i = 0; i < count; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0
    const noise = (rng / 0x100000000 - 0.5) * 8
    height += noise
    // Gentle sine wave overlay
    height += Math.sin(i * 0.02) * 0.5
    terrain.push(Math.max(BOARD_HEIGHT - 250, Math.min(BOARD_HEIGHT - 50, height)))
  }
  return {
    carX: 80, carY: terrain[4] - CAR_HEIGHT,
    carVx: 0, carVy: 0,
    carAngle: 0, carAngularVy: 0,
    throttle: 0, fuel: MAX_FUEL, fuelConsumed: 0,
    terrain, terrainStep: TERRAIN_STEP,
    distance: 0, maxDistance: 0,
    elapsedMs: 0, status: 'playing',
    seed, rng,
  }
}

export function setThrottle(state: HillState, throttle: number): HillState {
  if (state.status !== 'playing') return state
  return { ...state, throttle: Math.max(-1, Math.min(1, throttle)) }
}

function terrainHeightAt(state: HillState, x: number): number {
  const idx = Math.floor(x / TERRAIN_STEP)
  if (idx < 0) return state.terrain[0]
  if (idx >= state.terrain.length - 1) return state.terrain[state.terrain.length - 1]
  const t = (x - idx * TERRAIN_STEP) / TERRAIN_STEP
  return state.terrain[idx] * (1 - t) + state.terrain[idx + 1] * t
}

export function tick(state: HillState, dt: number): HillState {
  if (state.status !== 'playing') return state
  const frame = Math.min(dt, 50) / 16.67

  // Fuel
  let fuel = state.fuel - (state.throttle !== 0 ? FUEL_CONSUMPTION : FUEL_CONSUMPTION * 0.3) * frame
  if (fuel <= 0) return { ...state, fuel: 0, status: 'gameOver' }

  // Terrain follow
  const targetY = terrainHeightAt(state, state.carX + CAR_WIDTH/2) - CAR_HEIGHT
  const heightLeft = terrainHeightAt(state, state.carX)
  const heightRight = terrainHeightAt(state, state.carX + CAR_WIDTH)
  const targetAngle = Math.atan2(heightRight - heightLeft, CAR_WIDTH)

  // Throttle → forward force (angle-corrected)
  const thrust = state.throttle * 0.4
  let carVx = state.carVx + Math.cos(state.carAngle) * thrust * frame
  let carVy = state.carVy + Math.sin(state.carAngle) * thrust * frame

  // Gravity
  carVy += GRAVITY * frame

  // Apply velocity
  let carX = state.carX + carVx * frame
  let carY = state.carY + carVy * frame

  // Ground constraint
  if (carY > targetY) {
    carY = targetY
    carVy = 0
    // Rolling friction
    carVx *= 0.98
  }

  // Angle: spring toward target
  let carAngle = state.carAngle + state.carAngularVy * frame
  const angleDiff = targetAngle - carAngle
  let carAngularVy = state.carAngularVy + angleDiff * 0.2 * frame - state.carAngularVy * 0.15 * frame

  // Flip → death (car upside down)
  if (Math.abs(carAngle) > Math.PI * 0.7) {
    return { ...state, carX, carY, carVx, carVy, carAngle, carAngularVy, fuel, status: 'gameOver' }
  }

  const distance = Math.max(state.distance, carX)

  return {
    ...state, carX, carY, carVx, carVy, carAngle, carAngularVy,
    fuel, fuelConsumed: state.fuelConsumed + FUEL_CONSUMPTION,
    distance, maxDistance: Math.max(state.maxDistance, distance),
    elapsedMs: state.elapsedMs + dt,
  }
}

export function calculateScore(state: HillState): number {
  return Math.floor(state.distance / 5)
}

═══ ADIM 2: TESTLER (min 10) ═══

createInitialState: terrain array, car on ground
setThrottle: clamp -1 to 1
tick: gravity pulls car down
tick: ground constraint
tick: throttle forward moves car
tick: fuel depletes
tick: fuel 0 → gameOver
tick: angle follows terrain
tick: car flip over → gameOver
distance tracks max x

═══ ADIM 3: UI ═══

Canvas 800×400
Camera follows car (horizontal scroll)
Render:
  Terrain as filled polygon (dieselpunk olive)
  Car: chunky side-view (body + 2 wheels)
  Exhaust trail (dark smoke)
  Parallax bg (far hills, silhouettes)
  Fuel gauge top-right
  Distance meter top-left

Controls:
  Right half of screen = gas
  Left half = brake/reverse
  Or arrow keys

Tournament ID: 19n

═══ ADIM 4: DESIGN — Dieselpunk ═══

:root {
  --color-bg: 50 55 40;          /* olive drab */
  --color-fg: 220 210 180;
  --color-surface: 70 65 45;
  --color-accent: 200 110 50;     /* rust orange */
  --color-accent-2: 110 80 50;    /* leather */
  --color-accent-3: 220 180 90;   /* brass */
  --color-danger: 220 50 30;
  --font-primary: 'Bebas Neue', Impact, sans-serif;
  --font-body: 'Roboto Mono', 'JetBrains Mono', monospace;
}

body {
  background:
    linear-gradient(180deg, rgb(80 85 65), rgb(var(--color-bg))),
    repeating-linear-gradient(45deg, rgba(0,0,0,0.03) 0 2px, transparent 2px 10px);
  color: rgb(var(--color-fg));
  font-family: var(--font-body);
}

h1 { font-family: var(--font-primary); letter-spacing: 0.1em; }

.gauge {
  background: rgb(var(--color-surface));
  border: 2px solid rgb(var(--color-accent-3));
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.4);
}

.rivet-border {
  border: 4px solid rgb(var(--color-accent-2));
  border-image: repeating-linear-gradient(45deg, rgb(var(--color-accent-2)), rgb(var(--color-accent-2)) 10px, rgb(var(--color-accent-3)) 10px, rgb(var(--color-accent-3)) 12px) 4;
}
