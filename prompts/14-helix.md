
OYUN: Helix Jump
TOURNAMENT ID: 13
PORT: 3013
WORKTREE: /Users/inancayvaz/MAS-helix
BRANCH: game/helix
DESIGN: Memphis — bold geometric, squiggles, primary + black

═══ ADIM 0: TEMPLATE ═══

cd /Users/inancayvaz/MAS-helix
cp -r templates/game apps/helix
cd apps/helix
grep -rl __GAME_NAME__ . | xargs sed -i '' 's/__GAME_NAME__/helix/g'
grep -rl __GAME_TITLE__ . | xargs sed -i '' 's/__GAME_TITLE__/Helix/g'
grep -rl __PORT__ . | xargs sed -i '' 's/__PORT__/3013/g'
cd /Users/inancayvaz/MAS-helix && npm install

═══ ADIM 1: ENGINE ═══

types.ts:

export type SegmentType = 'normal' | 'danger' | 'gap'

export interface Segment {
  startAngle: number   // radian
  endAngle: number     // radian
  type: SegmentType
}

export interface Platform {
  y: number
  segments: Segment[]
  passed: boolean
}

export interface HelixState {
  ballY: number          // world y, increases down
  ballVy: number
  cylinderRotation: number   // radian, user input
  platforms: Platform[]
  score: number          // passed platforms
  combo: number          // consecutive passes without bounce
  elapsedMs: number
  status: 'playing' | 'gameOver'
  seed: number
  rng: number
}

engine.ts:

export const BALL_RADIUS = 16
export const CYLINDER_RADIUS = 100
export const PLATFORM_THICKNESS = 24
export const PLATFORM_SPACING = 120
export const GRAVITY = 0.4
export const BOUNCE_VELOCITY = -11
export const TERMINAL_VELOCITY = 15

export function createInitialState(seed: number): HelixState {
  let rng = seed || 1
  const platforms: Platform[] = []
  for (let i = 0; i < 50; i++) {
    platforms.push(generatePlatform(i * PLATFORM_SPACING + PLATFORM_SPACING, rng))
    rng = Math.imul(rng, 2654435761) >>> 0
  }
  return {
    ballY: 0, ballVy: 0,
    cylinderRotation: 0,
    platforms,
    score: 0, combo: 0,
    elapsedMs: 0, status: 'playing',
    seed, rng,
  }
}

function generatePlatform(y: number, seedOffset: number): Platform {
  // 6 sector (her biri 60°). 1-2 gap, 0-1 danger, rest normal
  const segments: Segment[] = []
  const sectorCount = 6
  const sectorSize = (Math.PI * 2) / sectorCount
  let rng = seedOffset
  const gapSector = Math.abs(rng % sectorCount)
  rng = Math.imul(rng, 2654435761) >>> 0
  const dangerSector = Math.abs(rng % sectorCount)
  for (let i = 0; i < sectorCount; i++) {
    let type: SegmentType = 'normal'
    if (i === gapSector) type = 'gap'
    else if (i === dangerSector && i !== gapSector) type = 'danger'
    segments.push({
      startAngle: i * sectorSize,
      endAngle: (i + 1) * sectorSize,
      type,
    })
  }
  return { y, segments, passed: false }
}

export function rotateCylinder(state: HelixState, delta: number): HelixState {
  if (state.status !== 'playing') return state
  return { ...state, cylinderRotation: state.cylinderRotation + delta }
}

export function tick(state: HelixState, dt: number): HelixState {
  if (state.status !== 'playing') return state
  const frame = Math.min(dt, 50) / 16.67
  let ballY = state.ballY + state.ballVy * frame
  let ballVy = Math.min(TERMINAL_VELOCITY, state.ballVy + GRAVITY * frame)
  let score = state.score
  let combo = state.combo

  // Platform collision
  const platforms = state.platforms.map(p => ({ ...p }))
  for (const platform of platforms) {
    const relY = platform.y - ballY
    if (relY > -PLATFORM_THICKNESS && relY < BALL_RADIUS && ballVy > 0) {
      // Find ball sector (angle relative to rotated cylinder)
      const ballAngle = (state.cylinderRotation + Math.PI * 2) % (Math.PI * 2)
      let hitSegment: Segment | undefined
      for (const seg of platform.segments) {
        if (ballAngle >= seg.startAngle && ballAngle < seg.endAngle) {
          hitSegment = seg
          break
        }
      }
      if (!hitSegment || hitSegment.type === 'gap') {
        // Falls through
        if (!platform.passed) {
          platform.passed = true
          score++
          combo++
        }
      } else if (hitSegment.type === 'danger') {
        // Game over if combo < 3 (skill: perfect chain breaks danger)
        if (combo < 3) {
          return { ...state, ballY: platform.y, ballVy: 0, status: 'gameOver', score }
        }
        // Else break through
        if (!platform.passed) { platform.passed = true; score++; combo++ }
      } else {
        // Normal → bounce
        ballY = platform.y - BALL_RADIUS
        ballVy = BOUNCE_VELOCITY
        combo = 0
        break
      }
    }
  }

  return {
    ...state, ballY, ballVy,
    platforms, score, combo,
    elapsedMs: state.elapsedMs + dt,
  }
}

export function calculateScore(state: HelixState): number {
  return state.score * 10
}

═══ ADIM 2: TESTLER (min 12) ═══

createInitialState: 50 platforms, spaced correctly
generatePlatform: 6 segments, at least 1 gap
rotateCylinder: rotation accumulates
tick: gravity applies
tick: terminal velocity cap
tick: bounce on normal segment
tick: pass through gap → score++
tick: danger + low combo → gameOver
tick: danger + combo >= 3 → pass through
combo: increments on pass, resets on bounce
tick: ball falls terminal velocity max
platform.passed prevents double counting

═══ ADIM 3: UI ═══

Canvas 400×600, rAF loop

Render:
  Cylinder top-down projection:
    Draw ellipse at each platform's screen-y (fake 3D)
    6 sectors colored by type
    Gap = transparent, normal = color, danger = red with spikes

  Ball fixed at screen-y = 200 (camera follows ball down)
  cylinderRotation = horizontal drag

  Combo counter: "×3", "×5" with pulse on trigger

Controls:
  Mouse/touch horizontal drag → rotate cylinder
  Arrows left/right → rotate fixed step

Tournament ID: 13n

═══ ADIM 4: DESIGN — Memphis ═══

:root {
  --color-bg: 255 250 235;
  --color-fg: 15 15 15;
  --color-surface: 255 255 255;
  --color-border: 15 15 15;
  --color-accent: 255 60 100;      /* hot pink */
  --color-accent-2: 80 200 230;    /* cyan */
  --color-accent-3: 255 200 50;    /* yellow */
  --color-accent-4: 140 100 230;   /* purple */
  --color-danger: 255 50 50;
  --font-primary: 'Archivo Black', Impact, sans-serif;
  --font-body: 'Rubik', sans-serif;
}

body {
  background:
    repeating-linear-gradient(45deg, rgba(255,60,100,0.08) 0 20px, transparent 20px 40px),
    rgb(var(--color-bg));
  color: rgb(var(--color-fg));
  font-family: var(--font-body);
}

.memphis-card {
  border: 3px solid black;
  box-shadow: 6px 6px 0 black;
  background: white;
}

Pattern variations: chevrons, dots, squiggles via SVG backgrounds.
