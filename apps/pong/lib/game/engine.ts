import type { PongState } from "./types";

// ---------------------------------------------------------------------------
// Constants — virtual board units. The canvas is scaled via CSS.
// ---------------------------------------------------------------------------
export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 400;
export const PADDLE_WIDTH = 10;
export const PADDLE_HEIGHT = 80;
export const BALL_RADIUS = 6;
export const PADDLE_X_OFFSET = 20;
export const PADDLE_MAX_SPEED = 8;
export const AI_MAX_SPEED = 6;
export const INITIAL_BALL_SPEED = 5;
export const BALL_SPEED_INCREMENT = 0.3;
export const MATCH_DURATION_MS = 60_000;

/** One frame at 60fps, in ms. Used to normalise delta times. */
const FRAME_MS = 1000 / 60;

// ---------------------------------------------------------------------------
// Seeded RNG — deterministic so the match is reproducible per tournament.
// ---------------------------------------------------------------------------
function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = Math.imul(state, 2654435761) >>> 0;
    return state / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
export function createInitialState(seed: number): PongState {
  const rand = seededRandom(seed);
  const vx = rand() > 0.5 ? INITIAL_BALL_SPEED : -INITIAL_BALL_SPEED;
  const vy = (rand() - 0.5) * INITIAL_BALL_SPEED;
  return {
    ball: { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 },
    ballVelocity: { x: vx, y: vy },
    playerPaddle: { y: BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2, vy: 0 },
    aiPaddle: { y: BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2, vy: 0 },
    playerScore: 0,
    aiScore: 0,
    rallyCount: 0,
    totalRallies: 0,
    maxRally: 0,
    ballSpeed: INITIAL_BALL_SPEED,
    elapsedMs: 0,
    durationMs: MATCH_DURATION_MS,
    status: "ready",
    seed,
  };
}

export function startGame(state: PongState): PongState {
  return { ...state, status: "playing", elapsedMs: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Apply a new velocity to the player paddle. Used by keyboard handlers
 * (which move the paddle via vy) without committing position change until
 * the next `tick`.
 */
export function setPlayerPaddleVelocity(
  state: PongState,
  vy: number,
): PongState {
  return { ...state, playerPaddle: { ...state.playerPaddle, vy } };
}

/**
 * Advance the player paddle. Two modes:
 *   - `targetY != null`: cursor/touch follow, clamped to `PADDLE_MAX_SPEED`
 *     per frame. Paddle centres on `targetY`.
 *   - `targetY == null`: keyboard — integrate the existing `vy`.
 */
export function updatePlayerPaddle(
  state: PongState,
  targetY: number | null,
  dt: number,
): PongState {
  if (state.status !== "playing") return state;
  const frame = dt / FRAME_MS;
  let newY = state.playerPaddle.y;
  let newVy = state.playerPaddle.vy;

  if (targetY !== null) {
    const want = targetY - PADDLE_HEIGHT / 2;
    const diff = want - state.playerPaddle.y;
    const maxStep = PADDLE_MAX_SPEED * frame;
    const step = clamp(diff, -maxStep, maxStep);
    newY = state.playerPaddle.y + step;
    newVy = step / Math.max(1, frame);
  } else {
    newY = state.playerPaddle.y + state.playerPaddle.vy * frame;
  }

  newY = clamp(newY, 0, BOARD_HEIGHT - PADDLE_HEIGHT);
  return { ...state, playerPaddle: { y: newY, vy: newVy } };
}

/**
 * AI paddle logic:
 *   - If the ball is receding, drift back toward board centre (idle).
 *   - If the ball is incoming, predict the y-impact with a one-wall-bounce
 *     simplification, then ease toward it. The 0.1 damping factor keeps
 *     the AI beatable — too tight and it's impossible.
 */
export function updateAiPaddle(state: PongState, dt: number): PongState {
  if (state.status !== "playing") return state;
  const frame = dt / FRAME_MS;
  const ballIncoming = state.ballVelocity.x > 0;

  if (!ballIncoming) {
    const center = BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    const diff = center - state.aiPaddle.y;
    const step = clamp(diff, -AI_MAX_SPEED * 0.5 * frame, AI_MAX_SPEED * 0.5 * frame);
    const newY = clamp(state.aiPaddle.y + step, 0, BOARD_HEIGHT - PADDLE_HEIGHT);
    return { ...state, aiPaddle: { y: newY, vy: step } };
  }

  const timeToReach =
    (BOARD_WIDTH - PADDLE_X_OFFSET - state.ball.x) /
    Math.max(0.001, state.ballVelocity.x);
  let predictedY = state.ball.y + state.ballVelocity.y * timeToReach;

  // Reflect off top/bottom walls (simplified — one-level unfolding loop).
  for (let i = 0; i < 4; i++) {
    if (predictedY < 0) predictedY = -predictedY;
    else if (predictedY > BOARD_HEIGHT) predictedY = 2 * BOARD_HEIGHT - predictedY;
    else break;
  }

  const targetTop = predictedY - PADDLE_HEIGHT / 2;
  const diff = targetTop - state.aiPaddle.y;
  // 0.1 * diff per frame = smooth ease; clamp to AI_MAX_SPEED * frame.
  const step = clamp(diff * 0.1 * frame, -AI_MAX_SPEED * frame, AI_MAX_SPEED * frame);
  const newY = clamp(state.aiPaddle.y + step, 0, BOARD_HEIGHT - PADDLE_HEIGHT);
  return { ...state, aiPaddle: { y: newY, vy: step } };
}

/**
 * Integrate the ball: wall bounces, paddle collisions (with angle from
 * hit offset), scoring, speed ramp. Returns a new state — this function
 * never mutates its input.
 */
export function updateBall(state: PongState, dt: number): PongState {
  if (state.status !== "playing") return state;
  const frame = dt / FRAME_MS;

  let x = state.ball.x + state.ballVelocity.x * frame;
  let y = state.ball.y + state.ballVelocity.y * frame;
  let vx = state.ballVelocity.x;
  let vy = state.ballVelocity.y;
  let rally = state.rallyCount;
  let totalRallies = state.totalRallies;
  let maxRally = state.maxRally;
  let ballSpeed = state.ballSpeed;
  let playerScore = state.playerScore;
  let aiScore = state.aiScore;

  // Top / bottom wall bounces
  if (y < BALL_RADIUS) {
    y = BALL_RADIUS;
    vy = -vy;
  } else if (y > BOARD_HEIGHT - BALL_RADIUS) {
    y = BOARD_HEIGHT - BALL_RADIUS;
    vy = -vy;
  }

  // Player (left) paddle collision
  const playerRight = PADDLE_X_OFFSET + PADDLE_WIDTH;
  if (
    vx < 0 &&
    x - BALL_RADIUS <= playerRight &&
    x - BALL_RADIUS >= PADDLE_X_OFFSET - PADDLE_WIDTH &&
    y >= state.playerPaddle.y &&
    y <= state.playerPaddle.y + PADDLE_HEIGHT
  ) {
    x = playerRight + BALL_RADIUS;
    vx = -vx;
    const hitOffset =
      (y - state.playerPaddle.y - PADDLE_HEIGHT / 2) / (PADDLE_HEIGHT / 2);
    vy = hitOffset * ballSpeed * 0.75;
    ballSpeed += BALL_SPEED_INCREMENT;
    // Renormalise magnitude so the ball doesn't slow after a steep-angle hit.
    const mag = Math.sqrt(vx * vx + vy * vy);
    const scale = ballSpeed / mag;
    vx *= scale;
    vy *= scale;
    rally++;
    totalRallies++;
    if (rally > maxRally) maxRally = rally;
  }

  // AI (right) paddle collision
  const aiLeft = BOARD_WIDTH - PADDLE_X_OFFSET - PADDLE_WIDTH;
  if (
    vx > 0 &&
    x + BALL_RADIUS >= aiLeft &&
    x + BALL_RADIUS <= aiLeft + 2 * PADDLE_WIDTH &&
    y >= state.aiPaddle.y &&
    y <= state.aiPaddle.y + PADDLE_HEIGHT
  ) {
    x = aiLeft - BALL_RADIUS;
    vx = -vx;
    const hitOffset =
      (y - state.aiPaddle.y - PADDLE_HEIGHT / 2) / (PADDLE_HEIGHT / 2);
    vy = hitOffset * ballSpeed * 0.75;
    ballSpeed += BALL_SPEED_INCREMENT;
    const mag = Math.sqrt(vx * vx + vy * vy);
    const scale = ballSpeed / mag;
    vx *= scale;
    vy *= scale;
    rally++;
    totalRallies++;
    if (rally > maxRally) maxRally = rally;
  }

  // Scoring — ball left the board horizontally.
  if (x < -BALL_RADIUS) {
    aiScore++;
    return resetAfterGoal(state, {
      aiScore,
      playerScore,
      totalRallies,
      maxRally,
      serveDirection: 1, // next ball serves toward AI
    });
  }
  if (x > BOARD_WIDTH + BALL_RADIUS) {
    playerScore++;
    return resetAfterGoal(state, {
      aiScore,
      playerScore,
      totalRallies,
      maxRally,
      serveDirection: -1, // serves toward player
    });
  }

  return {
    ...state,
    ball: { x, y },
    ballVelocity: { x: vx, y: vy },
    rallyCount: rally,
    totalRallies,
    maxRally,
    ballSpeed,
  };
}

/**
 * Reset ball to centre with a fresh serve. Score counters update, rally
 * resets, ball speed returns to initial. Uses `seed + totalRallies` as a
 * pseudo-random source for the vertical component to stay deterministic.
 */
function resetAfterGoal(
  state: PongState,
  opts: {
    playerScore: number;
    aiScore: number;
    totalRallies: number;
    maxRally: number;
    serveDirection: 1 | -1;
  },
): PongState {
  const rand = seededRandom(state.seed + state.totalRallies + state.aiScore * 7);
  const vy = (rand() - 0.5) * INITIAL_BALL_SPEED;
  return {
    ...state,
    ball: { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 },
    ballVelocity: {
      x: INITIAL_BALL_SPEED * opts.serveDirection,
      y: vy,
    },
    playerScore: opts.playerScore,
    aiScore: opts.aiScore,
    totalRallies: opts.totalRallies,
    maxRally: opts.maxRally,
    rallyCount: 0,
    ballSpeed: INITIAL_BALL_SPEED,
  };
}

/** Advance the world by dt milliseconds. No-op unless `status === "playing"`. */
export function tick(
  state: PongState,
  dt: number,
  playerTargetY: number | null,
): PongState {
  if (state.status !== "playing") return state;
  let next = state;
  next = updatePlayerPaddle(next, playerTargetY, dt);
  next = updateAiPaddle(next, dt);
  next = updateBall(next, dt);
  const elapsed = next.elapsedMs + dt;
  if (elapsed >= next.durationMs) {
    return { ...next, elapsedMs: next.durationMs, status: "finished" };
  }
  return { ...next, elapsedMs: elapsed };
}

/**
 * Final score: rally points (every paddle hit = +10) plus a goal-differential
 * bonus (player–AI × 50). Floored at 0 — you never leave with a negative
 * on-chain submission.
 */
export function calculateScore(state: PongState): number {
  const rallyPoints = state.totalRallies * 10;
  const goalDiff = (state.playerScore - state.aiScore) * 50;
  return Math.max(0, rallyPoints + goalDiff);
}
