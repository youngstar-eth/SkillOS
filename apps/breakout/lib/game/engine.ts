import type { Block, BlockColor, BreakoutState, Vec2 } from "./types";

// ---------------------------------------------------------------------------
// Board & paddle / ball constants — virtual units (Canvas scales via CSS).
// ---------------------------------------------------------------------------
export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 600;
export const PADDLE_WIDTH = 120;
export const PADDLE_HEIGHT = 12;
export const PADDLE_Y = BOARD_HEIGHT - 40;
export const BALL_RADIUS = 7;
export const INITIAL_BALL_SPEED = 5;
export const MAX_BALL_SPEED = 10;
export const INITIAL_LIVES = 3;

export const BLOCK_WIDTH = 70;
export const BLOCK_HEIGHT = 22;
export const BLOCK_GAP = 4;
export const BLOCK_ROWS = 6;
export const BLOCK_COLS = 10;
export const BLOCKS_START_Y = 60;
export const MAX_LEVELS = 5;

const FRAME_MS = 1000 / 60;

function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = Math.imul(state, 2654435761) >>> 0;
    return state / 0x100000000;
  };
}

interface Tier {
  color: BlockColor;
  points: number;
  maxHits: number;
}

const TIERS: readonly Tier[] = [
  { color: "pink", points: 50, maxHits: 3 }, // top row
  { color: "purple", points: 40, maxHits: 2 },
  { color: "cyan", points: 30, maxHits: 2 },
  { color: "cyan", points: 20, maxHits: 1 },
  { color: "yellow", points: 10, maxHits: 1 },
  { color: "yellow", points: 10, maxHits: 1 }, // bottom row
];

/**
 * Build the block grid for `level`. Level 1 is always solid; from level 2
 * onwards we randomly carve ~10% gaps per tile for visual variety (and to
 * make clean ball-through-the-gap shots possible).
 */
export function createBlocks(level: number, seed: number): Block[] {
  const blocks: Block[] = [];
  const rand = seededRandom(seed + level * 37);

  for (let row = 0; row < BLOCK_ROWS; row++) {
    for (let col = 0; col < BLOCK_COLS; col++) {
      if (level > 1 && rand() < 0.1) continue;

      const tier = TIERS[row];
      const x = col * (BLOCK_WIDTH + BLOCK_GAP) + 20;
      const y = BLOCKS_START_Y + row * (BLOCK_HEIGHT + BLOCK_GAP);
      blocks.push({
        x,
        y,
        width: BLOCK_WIDTH,
        height: BLOCK_HEIGHT,
        hits: tier.maxHits,
        maxHits: tier.maxHits,
        color: tier.color,
        points: tier.points,
        destroyed: false,
      });
    }
  }
  return blocks;
}

export function createInitialState(seed: number): BreakoutState {
  return {
    ball: { x: BOARD_WIDTH / 2, y: PADDLE_Y - BALL_RADIUS - 2 },
    ballVelocity: { x: 0, y: 0 },
    paddle: {
      x: BOARD_WIDTH / 2 - PADDLE_WIDTH / 2,
      y: PADDLE_Y,
      width: PADDLE_WIDTH,
    },
    blocks: createBlocks(1, seed),
    lives: INITIAL_LIVES,
    score: 0,
    level: 1,
    combo: 0,
    maxCombo: 0,
    elapsedMs: 0,
    status: "ready",
    seed,
  };
}

/**
 * Launch the ball from `ready`. Serve angle is seeded per-level so all
 * players on the same tournament see the same first trajectory.
 */
export function launchBall(state: BreakoutState): BreakoutState {
  if (state.status !== "ready") return state;
  const rand = seededRandom(state.seed + state.level * 17);
  // -30°..+30° from straight up.
  const angle = -Math.PI / 2 + ((rand() - 0.5) * Math.PI) / 3;
  return {
    ...state,
    status: "playing",
    ballVelocity: {
      x: Math.cos(angle) * INITIAL_BALL_SPEED,
      y: Math.sin(angle) * INITIAL_BALL_SPEED,
    },
  };
}

/**
 * Move the paddle. `targetX` is the board-virtual X the paddle CENTRE
 * should track (cursor or touch). In `ready` we also glue the ball to
 * the paddle so the player can position the launch.
 */
export function updatePaddle(
  state: BreakoutState,
  targetX: number | null,
): BreakoutState {
  if (state.status !== "playing" && state.status !== "ready") return state;
  let newX = state.paddle.x;
  if (targetX !== null) {
    newX = targetX - state.paddle.width / 2;
  }
  newX = Math.max(0, Math.min(BOARD_WIDTH - state.paddle.width, newX));

  if (state.status === "ready") {
    return {
      ...state,
      paddle: { ...state.paddle, x: newX },
      ball: { x: newX + state.paddle.width / 2, y: state.ball.y },
    };
  }
  return { ...state, paddle: { ...state.paddle, x: newX } };
}

/**
 * Axis-aligned ball-vs-block reflection. Normalise the overlap against
 * each half-extent, then flip whichever axis has the greater ratio. This
 * is a simpler "minimum-translation" approximation that handles
 * corners well enough for Breakout without full SAT.
 */
function reflectBall(
  ball: Vec2,
  velocity: Vec2,
  block: Block,
): { velocity: Vec2; ball: Vec2 } {
  const bx = block.x + block.width / 2;
  const by = block.y + block.height / 2;
  const dx = ball.x - bx;
  const dy = ball.y - by;
  const absDx = Math.abs(dx) / (block.width / 2);
  const absDy = Math.abs(dy) / (block.height / 2);

  if (absDx > absDy) {
    return {
      velocity: { x: -velocity.x, y: velocity.y },
      ball: {
        x: dx > 0 ? block.x + block.width + BALL_RADIUS : block.x - BALL_RADIUS,
        y: ball.y,
      },
    };
  }
  return {
    velocity: { x: velocity.x, y: -velocity.y },
    ball: {
      x: ball.x,
      y: dy > 0 ? block.y + block.height + BALL_RADIUS : block.y - BALL_RADIUS,
    },
  };
}

/**
 * Advance the world by `dt` ms. `targetX` is the current cursor/touch X
 * (or null for keyboard). Handles paddle movement, ball physics, wall /
 * paddle / block collisions, scoring, combo, life loss, level transitions.
 */
export function tick(
  state: BreakoutState,
  dt: number,
  targetX: number | null,
): BreakoutState {
  if (state.status === "ready" && targetX !== null) {
    return updatePaddle(state, targetX);
  }
  if (state.status !== "playing") return state;

  // Clamp dt so background-tab catch-up can't teleport the ball.
  const frame = Math.min(dt, 50) / FRAME_MS;
  let next = updatePaddle(state, targetX);

  let x = next.ball.x + next.ballVelocity.x * frame;
  let y = next.ball.y + next.ballVelocity.y * frame;
  let vx = next.ballVelocity.x;
  let vy = next.ballVelocity.y;

  // Side / top walls
  if (x < BALL_RADIUS) {
    x = BALL_RADIUS;
    vx = -vx;
  } else if (x > BOARD_WIDTH - BALL_RADIUS) {
    x = BOARD_WIDTH - BALL_RADIUS;
    vx = -vx;
  }
  if (y < BALL_RADIUS) {
    y = BALL_RADIUS;
    vy = -vy;
  }

  // Paddle collision — angle controlled by horizontal offset from centre.
  const p = next.paddle;
  let comboReset = false;
  if (
    vy > 0 &&
    y + BALL_RADIUS >= p.y &&
    y - BALL_RADIUS <= p.y + PADDLE_HEIGHT &&
    x + BALL_RADIUS >= p.x &&
    x - BALL_RADIUS <= p.x + p.width
  ) {
    y = p.y - BALL_RADIUS;
    const currentSpeed = Math.sqrt(vx * vx + vy * vy);
    const hitOffset = (x - p.x - p.width / 2) / (p.width / 2); // -1..+1
    const newVx = hitOffset * currentSpeed * 0.8;
    const newVy = -Math.sqrt(
      Math.max(0.1, currentSpeed * currentSpeed - newVx * newVx),
    );
    vx = newVx;
    vy = newVy;
    comboReset = true;
  }

  // Block collisions — only the first overlap per tick; good enough since
  // ball speed is bounded and block spacing is uniform.
  const newBlocks = next.blocks.map((b) => ({ ...b }));
  let scoreDelta = 0;
  let destroyedThisTick = 0;

  for (const b of newBlocks) {
    if (b.destroyed) continue;
    if (
      x + BALL_RADIUS >= b.x &&
      x - BALL_RADIUS <= b.x + b.width &&
      y + BALL_RADIUS >= b.y &&
      y - BALL_RADIUS <= b.y + b.height
    ) {
      const r = reflectBall({ x, y }, { x: vx, y: vy }, b);
      x = r.ball.x;
      y = r.ball.y;
      vx = r.velocity.x;
      vy = r.velocity.y;
      b.hits -= 1;
      if (b.hits <= 0) {
        b.destroyed = true;
        scoreDelta += b.points;
        destroyedThisTick += 1;
      }
      break;
    }
  }

  // Combo: reset on paddle hit, increment on block destruction, unchanged
  // on non-destroy hit (cyan top-hit on a 2-hp block).
  let newCombo = next.combo;
  if (comboReset) newCombo = 0;
  if (destroyedThisTick > 0) newCombo += destroyedThisTick;
  const comboBonus = destroyedThisTick > 0 && newCombo >= 5 ? newCombo * 10 : 0;
  const newScore = next.score + scoreDelta + comboBonus;

  // Speed cap
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > MAX_BALL_SPEED) {
    vx = (vx / speed) * MAX_BALL_SPEED;
    vy = (vy / speed) * MAX_BALL_SPEED;
  }

  // Fell off bottom — lose life.
  if (y > BOARD_HEIGHT + BALL_RADIUS) {
    const newLives = next.lives - 1;
    if (newLives <= 0) {
      return {
        ...next,
        status: "gameOver",
        lives: 0,
        score: newScore,
        combo: 0,
        blocks: newBlocks,
      };
    }
    return {
      ...next,
      lives: newLives,
      status: "ready",
      ball: {
        x: next.paddle.x + next.paddle.width / 2,
        y: PADDLE_Y - BALL_RADIUS - 2,
      },
      ballVelocity: { x: 0, y: 0 },
      score: newScore,
      combo: 0,
      blocks: newBlocks,
    };
  }

  // Level clear
  const remaining = newBlocks.filter((b) => !b.destroyed).length;
  if (remaining === 0) {
    const nextLevel = next.level + 1;
    if (nextLevel > MAX_LEVELS) {
      return {
        ...next,
        status: "won",
        score: newScore,
        blocks: newBlocks,
        maxCombo: Math.max(next.maxCombo, newCombo),
      };
    }
    return {
      ...next,
      status: "ready",
      level: nextLevel,
      blocks: createBlocks(nextLevel, next.seed),
      ball: {
        x: next.paddle.x + next.paddle.width / 2,
        y: PADDLE_Y - BALL_RADIUS - 2,
      },
      ballVelocity: { x: 0, y: 0 },
      score: newScore,
      combo: 0,
      maxCombo: Math.max(next.maxCombo, newCombo),
    };
  }

  return {
    ...next,
    ball: { x, y },
    ballVelocity: { x: vx, y: vy },
    blocks: newBlocks,
    score: newScore,
    combo: newCombo,
    maxCombo: Math.max(next.maxCombo, newCombo),
    elapsedMs: next.elapsedMs + dt,
  };
}

/**
 * Final submittable score: running score + max-combo×25 + 1000 win bonus.
 * Combo bonus rewards clean back-to-back block breaks, win bonus nudges
 * players toward completing all 5 levels instead of farming level 1.
 */
export function calculateScore(state: BreakoutState): number {
  const winBonus = state.status === "won" ? 1000 : 0;
  return state.score + state.maxCombo * 25 + winBonus;
}
