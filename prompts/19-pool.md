
OYUN: 8-Ball Pool (simplified — clear table time attack)
TOURNAMENT ID: 18
PORT: 3018
WORKTREE: /Users/inancayvaz/MAS-pool
BRANCH: game/pool
DESIGN: Dark Luxe (Johnnie Walker)

═══ ADIM 1: ENGINE ═══

types.ts:

export interface Ball {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  pocketed: boolean
  isCue: boolean
}

export interface Pocket {
  x: number
  y: number
  radius: number
}

export interface PoolState {
  balls: Ball[]
  pockets: Pocket[]
  aimAngle: number
  aimPower: number     // 0..1
  shotsFired: number
  fouls: number
  ballsPocketed: number
  elapsedMs: number
  status: 'aiming' | 'simulating' | 'finished'
  seed: number
}

engine.ts:

export const BOARD_WIDTH = 800
export const BOARD_HEIGHT = 400
export const BALL_RADIUS = 12
export const POCKET_RADIUS = 20
export const FRICTION = 0.985
export const MIN_SPEED = 0.05

export const POCKETS: Pocket[] = [
  { x: 25, y: 25, radius: POCKET_RADIUS },
  { x: BOARD_WIDTH/2, y: 20, radius: POCKET_RADIUS },
  { x: BOARD_WIDTH-25, y: 25, radius: POCKET_RADIUS },
  { x: 25, y: BOARD_HEIGHT-25, radius: POCKET_RADIUS },
  { x: BOARD_WIDTH/2, y: BOARD_HEIGHT-20, radius: POCKET_RADIUS },
  { x: BOARD_WIDTH-25, y: BOARD_HEIGHT-25, radius: POCKET_RADIUS },
]

export function createInitialState(seed: number): PoolState {
  const balls: Ball[] = []
  // Cue ball
  balls.push({ id: 0, x: 200, y: BOARD_HEIGHT/2, vx: 0, vy: 0, radius: BALL_RADIUS, color: 'white', pocketed: false, isCue: true })
  // 15 balls triangle at (600, center)
  const colors = ['#ff3030', '#3080ff', '#ffcc00', '#30b030', '#7020c0', '#ff8020', '#202020', '#ff3030', '#3080ff', '#ffcc00', '#30b030', '#7020c0', '#ff8020', '#202020', '#e040e0']
  let id = 1
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      const x = 600 + row * (BALL_RADIUS * 2 + 1)
      const y = BOARD_HEIGHT/2 + (k - row/2) * (BALL_RADIUS * 2 + 1)
      balls.push({ id, x, y, vx: 0, vy: 0, radius: BALL_RADIUS, color: colors[id-1], pocketed: false, isCue: false })
      id++
    }
  }
  return {
    balls, pockets: POCKETS,
    aimAngle: 0, aimPower: 0.5,
    shotsFired: 0, fouls: 0, ballsPocketed: 0,
    elapsedMs: 0, status: 'aiming', seed,
  }
}

export function setAim(state: PoolState, angle: number, power: number): PoolState {
  if (state.status !== 'aiming') return state
  return { ...state, aimAngle: angle, aimPower: Math.max(0, Math.min(1, power)) }
}

export function shoot(state: PoolState): PoolState {
  if (state.status !== 'aiming') return state
  const cue = state.balls.find(b => b.isCue && !b.pocketed)
  if (!cue) return state
  const speed = state.aimPower * 20
  return {
    ...state,
    balls: state.balls.map(b => b.isCue ? { ...b, vx: Math.cos(state.aimAngle) * speed, vy: Math.sin(state.aimAngle) * speed } : b),
    status: 'simulating',
    shotsFired: state.shotsFired + 1,
  }
}

export function tick(state: PoolState, dt: number): PoolState {
  if (state.status !== 'simulating') return state
  const frame = Math.min(dt, 50) / 16.67
  let balls = state.balls.map(b => ({ ...b }))
  let fouls = state.fouls
  let pocketed = state.ballsPocketed

  // Integrate motion
  for (const b of balls) {
    if (b.pocketed) continue
    b.x += b.vx * frame
    b.y += b.vy * frame
    b.vx *= Math.pow(FRICTION, frame)
    b.vy *= Math.pow(FRICTION, frame)
    if (Math.abs(b.vx) < MIN_SPEED) b.vx = 0
    if (Math.abs(b.vy) < MIN_SPEED) b.vy = 0
    // Walls
    if (b.x < b.radius + 20) { b.x = b.radius + 20; b.vx = -b.vx * 0.95 }
    if (b.x > BOARD_WIDTH - b.radius - 20) { b.x = BOARD_WIDTH - b.radius - 20; b.vx = -b.vx * 0.95 }
    if (b.y < b.radius + 20) { b.y = b.radius + 20; b.vy = -b.vy * 0.95 }
    if (b.y > BOARD_HEIGHT - b.radius - 20) { b.y = BOARD_HEIGHT - b.radius - 20; b.vy = -b.vy * 0.95 }
  }

  // Ball-ball collisions (O(n²) but only ~16 balls)
  for (let i = 0; i < balls.length; i++) {
    for (let j = i+1; j < balls.length; j++) {
      const a = balls[i], b = balls[j]
      if (a.pocketed || b.pocketed) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.sqrt(dx*dx + dy*dy)
      if (d < a.radius + b.radius && d > 0) {
        const nx = dx/d, ny = dy/d
        // Separate
        const overlap = a.radius + b.radius - d
        a.x -= nx * overlap/2; a.y -= ny * overlap/2
        b.x += nx * overlap/2; b.y += ny * overlap/2
        // Elastic collision along normal
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy
        const velAlongNormal = rvx * nx + rvy * ny
        if (velAlongNormal > 0) continue
        const restitution = 0.95
        const impulse = -(1 + restitution) * velAlongNormal / 2
        a.vx -= impulse * nx; a.vy -= impulse * ny
        b.vx += impulse * nx; b.vy += impulse * ny
      }
    }
  }

  // Pocket detection
  for (const b of balls) {
    if (b.pocketed) continue
    for (const p of state.pockets) {
      const dx = b.x - p.x, dy = b.y - p.y
      if (Math.sqrt(dx*dx + dy*dy) < p.radius) {
        b.pocketed = true
        b.vx = 0; b.vy = 0
        if (b.isCue) fouls++
        else pocketed++
        break
      }
    }
  }

  // All at rest?
  const allRest = balls.every(b => b.pocketed || (b.vx === 0 && b.vy === 0))
  if (allRest) {
    const nonCue = balls.filter(b => !b.isCue)
    const allPocketed = nonCue.every(b => b.pocketed)
    if (allPocketed) {
      return { ...state, balls, status: 'finished', ballsPocketed: pocketed, fouls }
    }
    // Cue ball pocketed → restore
    const cue = balls.find(b => b.isCue)
    if (cue?.pocketed) {
      cue.pocketed = false
      cue.x = 200
      cue.y = BOARD_HEIGHT / 2
      cue.vx = 0; cue.vy = 0
    }
    return { ...state, balls, status: 'aiming', ballsPocketed: pocketed, fouls }
  }

  return { ...state, balls, ballsPocketed: pocketed, fouls, elapsedMs: state.elapsedMs + dt }
}

export function calculateScore(state: PoolState): number {
  const timeBonus = Math.max(0, 300000 - state.elapsedMs) / 100
  const shotPenalty = state.shotsFired * 5
  const foulPenalty = state.fouls * 50
  const base = state.ballsPocketed * 100
  return Math.max(0, Math.floor(base + timeBonus - shotPenalty - foulPenalty))
}

═══ ADIM 2: TESTLER (min 10) ═══

createInitialState: 16 balls, 1 cue + 15 racked
setAim: angle + power clamp
shoot: cue velocity set
tick: friction decelerates
tick: wall bounce
tick: ball-ball collision
tick: pocket detection
tick: cue in pocket → foul + reposition
tick: all balls at rest → aiming (or finished)
all non-cue pocketed → finished

═══ ADIM 3: UI ═══

Canvas 800×400
Felt green bg
Wooden brown rail border
Pockets as dark circles
Balls drawn with radial gradient (3D look)
Aim line from cue ball when aiming
Power meter: bar on side

Controls:
  Pointer angle from cue ball = aimAngle
  Hold + drag back = power (distance = power)
  Release = shoot

Tournament ID: 18n

═══ ADIM 4: DESIGN — Dark Luxe ═══

:root {
  --color-bg: 15 20 15;
  --color-felt: 30 90 55;            /* pool green */
  --color-rail: 90 60 30;            /* wood */
  --color-fg: 235 225 200;
  --color-accent: 200 170 100;       /* old gold */
  --color-accent-2: 160 120 60;
  --font-primary: 'Playfair Display', Georgia, serif;
  --font-body: 'Inter', -apple-system, sans-serif;
}

body {
  background:
    radial-gradient(ellipse at center, rgba(200,170,100,0.06), transparent 60%),
    rgb(var(--color-bg));
  color: rgb(var(--color-fg));
  font-family: var(--font-body);
}

h1 { font-family: var(--font-primary); letter-spacing: 0.05em; }

.gold-border {
  border: 1px solid rgb(var(--color-accent));
  box-shadow: 0 0 20px rgba(200,170,100,0.2);
}
