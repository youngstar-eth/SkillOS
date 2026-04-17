import type { FlappyState, Pipe } from "./types";

export const BOARD_WIDTH = 400;
export const BOARD_HEIGHT = 600;
export const BIRD_X = 100;
export const BIRD_RADIUS = 14;
export const GRAVITY = 0.5;
export const FLAP_VELOCITY = -8;
export const PIPE_WIDTH = 60;
export const PIPE_SPEED = 2.5;
export const PIPE_SPAWN_INTERVAL = 1800;
export const GAP_SIZE = 140;
export const GAP_MIN_Y = 120;
export const GAP_MAX_Y = BOARD_HEIGHT - 120;

export function createInitialState(seed: number): FlappyState {
  return {
    birdY: BOARD_HEIGHT / 2,
    birdVy: 0,
    pipes: [],
    score: 0,
    elapsedMs: 0,
    status: "ready",
    seed,
    rng: seed || 1,
  };
}

export function flap(state: FlappyState): FlappyState {
  if (state.status === "gameOver") return state;
  if (state.status === "ready") {
    return { ...state, status: "playing", birdVy: FLAP_VELOCITY };
  }
  return { ...state, birdVy: FLAP_VELOCITY };
}

export function tick(state: FlappyState, dt: number): FlappyState {
  if (state.status !== "playing") return state;
  const frame = Math.min(dt, 50) / 16.67;
  const birdY = state.birdY + state.birdVy * frame;
  const birdVy = state.birdVy + GRAVITY * frame;

  // Ground / ceiling collision.
  if (birdY < BIRD_RADIUS || birdY > BOARD_HEIGHT - BIRD_RADIUS) {
    return { ...state, status: "gameOver", birdY, birdVy };
  }

  // Move pipes left; drop any that left the playfield.
  let pipes: Pipe[] = state.pipes.map((p) => ({
    ...p,
    x: p.x - PIPE_SPEED * frame,
  }));
  pipes = pipes.filter((p) => p.x > -PIPE_WIDTH);

  // Spawn a fresh pipe when the last one has travelled far enough.
  let rng = state.rng;
  const shouldSpawn =
    pipes.length === 0 || pipes[pipes.length - 1].x < BOARD_WIDTH - 220;
  if (shouldSpawn) {
    rng = Math.imul(rng, 2654435761) >>> 0;
    const gapY = GAP_MIN_Y + (rng / 0x100000000) * (GAP_MAX_Y - GAP_MIN_Y);
    pipes.push({ x: BOARD_WIDTH, gapY, gapSize: GAP_SIZE, passed: false });
  }

  // Collision + score bookkeeping per pipe.
  let score = state.score;
  for (const pipe of pipes) {
    const inPipeX =
      BIRD_X + BIRD_RADIUS > pipe.x && BIRD_X - BIRD_RADIUS < pipe.x + PIPE_WIDTH;
    if (inPipeX) {
      const gapTop = pipe.gapY - pipe.gapSize / 2;
      const gapBottom = pipe.gapY + pipe.gapSize / 2;
      if (birdY - BIRD_RADIUS < gapTop || birdY + BIRD_RADIUS > gapBottom) {
        return { ...state, status: "gameOver", birdY, birdVy, pipes, rng };
      }
    }
    if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X) {
      pipe.passed = true;
      score++;
    }
  }

  return {
    ...state,
    birdY,
    birdVy,
    pipes,
    score,
    rng,
    elapsedMs: state.elapsedMs + dt,
  };
}

export function calculateScore(state: FlappyState): number {
  return state.score * 10 + Math.floor(state.elapsedMs / 1000);
}
