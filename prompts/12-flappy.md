
OYUN: Flappy Bird
TOURNAMENT ID: 11
PORT: 3011
WORKTREE: /Users/inancayvaz/MAS-flappy
BRANCH: game/flappy
DESIGN: Dreamcore — pastel mavi/pembe, yumuşak bulutlar

═══ ADIM 0: TEMPLATE ═══

cd /Users/inancayvaz/MAS-flappy
cp -r templates/game apps/flappy
cd apps/flappy
grep -rl __GAME_NAME__ . | xargs sed -i '' 's/__GAME_NAME__/flappy/g'
grep -rl __GAME_TITLE__ . | xargs sed -i '' 's/__GAME_TITLE__/Flappy/g'
grep -rl __PORT__ . | xargs sed -i '' 's/__PORT__/3011/g'
cd /Users/inancayvaz/MAS-flappy && npm install

═══ ADIM 1: ENGINE ═══

types.ts:

export interface Pipe {
  x: number
  gapY: number       // gap center
  gapSize: number    // 140px default
  passed: boolean
}

export interface FlappyState {
  birdY: number
  birdVy: number
  pipes: Pipe[]
  score: number        // geçilen pipe sayısı
  elapsedMs: number
  status: 'ready' | 'playing' | 'gameOver'
  seed: number
  rng: number
}

engine.ts:

export const BOARD_WIDTH = 400
export const BOARD_HEIGHT = 600
export const BIRD_X = 100
export const BIRD_RADIUS = 14
export const GRAVITY = 0.5
export const FLAP_VELOCITY = -8
export const PIPE_WIDTH = 60
export const PIPE_SPEED = 2.5
export const PIPE_SPAWN_INTERVAL = 1800  // ms
export const GAP_SIZE = 140
export const GAP_MIN_Y = 120
export const GAP_MAX_Y = BOARD_HEIGHT - 120

export function createInitialState(seed: number): FlappyState {
  return {
    birdY: BOARD_HEIGHT / 2,
    birdVy: 0,
    pipes: [],
    score: 0,
    elapsedMs: 0,
    status: 'ready',
    seed,
    rng: seed || 1,
  }
}

export function flap(state: FlappyState): FlappyState {
  if (state.status === 'gameOver') return state
  if (state.status === 'ready') {
    return { ...state, status: 'playing', birdVy: FLAP_VELOCITY }
  }
  return { ...state, birdVy: FLAP_VELOCITY }
}

export function tick(state: FlappyState, dt: number): FlappyState {
  if (state.status !== 'playing') return state
  const frame = Math.min(dt, 50) / 16.67
  let birdY = state.birdY + state.birdVy * frame
  let birdVy = state.birdVy + GRAVITY * frame

  // Ground / ceiling
  if (birdY < BIRD_RADIUS || birdY > BOARD_HEIGHT - BIRD_RADIUS) {
    return { ...state, status: 'gameOver', birdY, birdVy }
  }

  // Move pipes
  let pipes = state.pipes.map(p => ({ ...p, x: p.x - PIPE_SPEED * frame }))
  pipes = pipes.filter(p => p.x > -PIPE_WIDTH)

  // Spawn new pipes (every ~1800ms)
  let rng = state.rng
  const shouldSpawn = pipes.length === 0 || pipes[pipes.length - 1].x < BOARD_WIDTH - 220
  if (shouldSpawn) {
    rng = Math.imul(rng, 2654435761) >>> 0
    const gapY = GAP_MIN_Y + (rng / 0x100000000) * (GAP_MAX_Y - GAP_MIN_Y)
    pipes.push({ x: BOARD_WIDTH, gapY, gapSize: GAP_SIZE, passed: false })
  }

  // Collision detection
  let score = state.score
  for (const pipe of pipes) {
    const inPipeX = BIRD_X + BIRD_RADIUS > pipe.x && BIRD_X - BIRD_RADIUS < pipe.x + PIPE_WIDTH
    if (inPipeX) {
      const gapTop = pipe.gapY - pipe.gapSize / 2
      const gapBottom = pipe.gapY + pipe.gapSize / 2
      if (birdY - BIRD_RADIUS < gapTop || birdY + BIRD_RADIUS > gapBottom) {
        return { ...state, status: 'gameOver', birdY, birdVy, pipes, rng }
      }
    }
    // Score: bird passed pipe
    if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X) {
      pipe.passed = true
      score++
    }
  }

  return {
    ...state, birdY, birdVy, pipes, score, rng,
    elapsedMs: state.elapsedMs + dt,
  }
}

export function calculateScore(state: FlappyState): number {
  return state.score * 10 + Math.floor(state.elapsedMs / 1000)
}

═══ ADIM 2: TESTLER (minimum 12) ═══

createInitialState: ready, bird in middle
flap ready → playing, velocity = FLAP_VELOCITY
flap playing → velocity reset
tick: gravity increases vy
tick: bird hits ground → gameOver
tick: bird hits ceiling → gameOver
tick: pipe spawns when needed
tick: pipes move left
tick: collision with pipe top
tick: collision with pipe bottom
tick: bird in gap → score increments when pipe passes
tick: pipes filtered when off-screen

═══ ADIM 3: UI ═══

components/game/Board.tsx:
  Canvas 400×600, rAF loop
  Render:
    Pastel gradient sky (radial: top pink, bottom blue)
    Parallax cloud layer (slow horizontal drift)
    Pipes: rounded rect green-to-cyan gradient
    Bird: circle with eye + beak + wing flap
  Ground strip at bottom

components/game/ScoreDisplay.tsx:
  Big pastel-pink number, top center
  "Best: N" subtitle

components/game/Game.tsx:
  rAF loop, tick
  Space/Click/Tap → flap
  Ready screen: "Tap to start"
  GameOver: modal with final score
  GameOverSubmit with { score, pipesPassed, durationMs }
  Tournament ID: 11n

═══ ADIM 4: DESIGN — Dreamcore ═══

:root {
  --color-bg: 235 220 250;
  --color-fg: 80 60 100;
  --color-surface: 255 250 255;
  --color-border: 220 200 240;
  --color-accent: 255 160 200;
  --color-accent-2: 160 200 255;
  --color-sky-top: 255 200 230;
  --color-sky-bottom: 200 220 255;
  --color-pipe: 150 220 180;
  --color-bird: 255 210 140;
  --font-primary: 'Quicksand', 'Fredoka', sans-serif;
  --font-display: 'Fredoka', sans-serif;
}

body {
  background: linear-gradient(180deg, rgb(var(--color-sky-top)), rgb(var(--color-sky-bottom)));
  color: rgb(var(--color-fg));
  font-family: var(--font-primary);
  min-height: 100vh;
}

.dream-glow {
  filter: drop-shadow(0 0 12px rgba(255, 200, 230, 0.5));
}

Canvas render hints:
- Bird: yellow circle + white eye + small pink beak
- Cloud SVG: soft white, 30% opacity, slow drift
- Pipe: linear gradient #96DCB4 → #C8F0DC with dark outline

═══ ADIM 5+6: DOĞRULAMA + COMMIT ═══

tsc, tests, build. Commit: "feat: add flappy game (tournament ID 11)"
