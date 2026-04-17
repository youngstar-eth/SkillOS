
OYUN: Stickman Hook
TOURNAMENT ID: 16
PORT: 3016
WORKTREE: /Users/inancayvaz/MAS-stickman
BRANCH: game/stickman
DESIGN: Grunge

═══ ADIM 1: ENGINE ═══

types.ts:

export interface Anchor {
  x: number
  y: number
  radius: number     // click detection
}

export interface StickmanState {
  x: number
  y: number
  vx: number
  vy: number
  ropeAnchor: Anchor | null
  ropeLength: number | null
  anchors: Anchor[]     // map anchors
  obstacles: { x: number; y: number; w: number; h: number; deadly: boolean }[]
  flagX: number          // goal
  flagY: number
  cameraX: number
  status: 'playing' | 'won' | 'gameOver'
  distance: number       // for score
  seed: number
  rng: number
}

engine.ts:

export const GRAVITY = 0.3
export const ROPE_SPRING = 0.02     // tension
export const BOARD_WIDTH = 800
export const BOARD_HEIGHT = 500
export const PLAYER_SIZE = 12

export function createInitialState(seed: number): StickmanState {
  let rng = seed || 1
  const anchors: Anchor[] = []
  const obstacles = []
  let x = 300
  for (let i = 0; i < 20; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0
    const yOffset = (rng / 0x100000000 - 0.5) * 200
    anchors.push({ x, y: 150 + yOffset, radius: 15 })
    rng = Math.imul(rng, 2654435761) >>> 0
    x += 200 + (rng / 0x100000000) * 100
  }
  return {
    x: 100, y: 300, vx: 0, vy: 0,
    ropeAnchor: null, ropeLength: null,
    anchors, obstacles,
    flagX: x + 100, flagY: 300,
    cameraX: 0,
    status: 'playing', distance: 0,
    seed, rng,
  }
}

export function attachRope(state: StickmanState, ax: number, ay: number): StickmanState {
  if (state.status !== 'playing') return state
  // Find anchor closest to clicked point
  let closest: Anchor | null = null
  let minDist = Infinity
  for (const a of state.anchors) {
    const dx = a.x - ax
    const dy = a.y - ay
    const d = Math.sqrt(dx*dx + dy*dy)
    if (d < a.radius + 30 && d < minDist) {  // forgiveness radius
      minDist = d
      closest = a
    }
  }
  if (!closest) return state
  const dx = closest.x - state.x
  const dy = closest.y - state.y
  const length = Math.sqrt(dx*dx + dy*dy)
  return { ...state, ropeAnchor: closest, ropeLength: length }
}

export function releaseRope(state: StickmanState): StickmanState {
  return { ...state, ropeAnchor: null, ropeLength: null }
}

export function tick(state: StickmanState, dt: number): StickmanState {
  if (state.status !== 'playing') return state
  const frame = Math.min(dt, 50) / 16.67
  let { x, y, vx, vy } = state
  vy += GRAVITY * frame
  x += vx * frame
  y += vy * frame

  // Rope constraint (spring-ish)
  if (state.ropeAnchor && state.ropeLength) {
    const dx = x - state.ropeAnchor.x
    const dy = y - state.ropeAnchor.y
    const d = Math.sqrt(dx*dx + dy*dy)
    if (d > state.ropeLength) {
      // Pull back toward anchor
      const overshoot = d - state.ropeLength
      const nx = dx / d, ny = dy / d
      x -= nx * overshoot
      y -= ny * overshoot
      // Reflect velocity along rope (tangential)
      const dot = vx * nx + vy * ny
      vx -= nx * dot
      vy -= ny * dot
      // Small damping
      vx *= 0.99
      vy *= 0.99
    }
  }

  // Floor
  if (y > BOARD_HEIGHT - PLAYER_SIZE) {
    return { ...state, x, y: BOARD_HEIGHT - PLAYER_SIZE, vx: 0, vy: 0, status: 'gameOver' }
  }

  // Flag reached
  const dfx = state.flagX - x
  const dfy = state.flagY - y
  if (Math.sqrt(dfx*dfx + dfy*dfy) < 25) {
    return { ...state, x, y, vx, vy, status: 'won' }
  }

  return {
    ...state, x, y, vx, vy,
    distance: Math.max(state.distance, x),
    cameraX: Math.max(0, x - 200),
  }
}

export function calculateScore(state: StickmanState): number {
  const base = Math.floor(state.distance)
  const winBonus = state.status === 'won' ? 500 : 0
  return base + winBonus
}

═══ ADIM 2: TESTLER (min 10) ═══

createInitialState: anchors, flag position
attachRope: snap to closest anchor within radius
attachRope: miss (too far) → state unchanged
releaseRope: anchor null
tick: gravity applies
tick: rope tension pulls back
tick: velocity reflects tangentially
tick: floor → gameOver
tick: flag → won
distance tracks max x
calculateScore: distance + win bonus

═══ ADIM 3: UI ═══

Canvas 800×500, rAF loop
Render:
  Muted bg (olive/rust gradient)
  Anchors: small circles with ring
  Rope: line from player to anchor
  Player: stickman SVG (circle head + lines)
  Obstacles: dark rects
  Flag: at end point

Controls:
  Mouse click/tap → attachRope at click point
  Release click → releaseRope

Tournament ID: 16n

═══ ADIM 4: DESIGN — Grunge ═══

:root {
  --color-bg: 35 30 25;
  --color-fg: 220 210 195;
  --color-surface: 55 45 35;
  --color-accent: 180 80 60;         /* rust */
  --color-accent-2: 120 130 80;      /* olive */
  --color-cream: 240 230 210;
  --color-danger: 200 50 40;
  --font-primary: 'Permanent Marker', 'Marker Felt', cursive;
  --font-body: 'Special Elite', 'Courier Prime', monospace;
}

body {
  background:
    url("data:image/svg+xml,...grunge-noise..."),
    rgb(var(--color-bg));
  color: rgb(var(--color-fg));
  font-family: var(--font-body);
}

h1, h2 { font-family: var(--font-primary); letter-spacing: 0.04em; }

.grunge-frame {
  border: 3px solid rgb(var(--color-fg));
  box-shadow:
    inset 0 0 30px rgba(0,0,0,0.5),
    4px 4px 0 rgba(0,0,0,0.4);
}
