/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BALL_RADIUS,
  BLOCK_COLS,
  BLOCK_ROWS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  INITIAL_LIVES,
  MAX_BALL_SPEED,
  MAX_LEVELS,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_Y,
  calculateScore,
  createBlocks,
  createInitialState,
  launchBall,
  tick,
  updatePaddle,
} from "./engine";
import type { BreakoutState } from "./types";

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

/**
 * A "filler" block placed far outside the test's ball path, so the level
 * doesn't auto-clear to `ready` and confuse the assertion under test.
 */
const FILLER_BLOCK = {
  x: 0,
  y: 0,
  width: 5,
  height: 5,
  hits: 99,
  maxHits: 99,
  color: "yellow" as const,
  points: 0,
  destroyed: false,
};

// ---------- createInitialState ----------------------------------------
describe("createInitialState", () => {
  it("starts ready with 3 lives, full level-1 board", () => {
    const s = createInitialState(0);
    assert.equal(s.lives, INITIAL_LIVES);
    assert.equal(s.status, "ready");
    assert.equal(s.level, 1);
    assert.equal(s.score, 0);
    assert.equal(s.combo, 0);
    assert.equal(s.blocks.length, BLOCK_ROWS * BLOCK_COLS);
    // Ball rests on paddle.
    assert.ok(approx(s.ball.x, BOARD_WIDTH / 2));
  });
});

// ---------- createBlocks ----------------------------------------------
describe("createBlocks", () => {
  it("level 1 is fully solid", () => {
    const blocks = createBlocks(1, 123);
    assert.equal(blocks.length, BLOCK_ROWS * BLOCK_COLS);
  });

  it("levels ≥ 2 introduce gaps (statistical)", () => {
    const blocks = createBlocks(3, 123);
    assert.ok(blocks.length < BLOCK_ROWS * BLOCK_COLS);
  });

  it("tier colors: row 0 pink, row 2 cyan, row 5 yellow", () => {
    const blocks = createBlocks(1, 0);
    const byRow = (r: number) =>
      blocks.find(
        (b) => b.y === 60 + r * (22 + 4) && b.x === 20,
      );
    assert.equal(byRow(0)?.color, "pink");
    assert.equal(byRow(2)?.color, "cyan");
    assert.equal(byRow(5)?.color, "yellow");
  });
});

// ---------- launchBall ------------------------------------------------
describe("launchBall", () => {
  it("transitions ready → playing with upward velocity", () => {
    const s = createInitialState(1);
    const s1 = launchBall(s);
    assert.equal(s1.status, "playing");
    assert.ok(s1.ballVelocity.y < 0);
  });

  it("no-op from non-ready", () => {
    const s: BreakoutState = {
      ...createInitialState(1),
      status: "playing",
    };
    assert.deepEqual(launchBall(s), s);
  });
});

// ---------- updatePaddle ----------------------------------------------
describe("updatePaddle", () => {
  it("clamps to board bounds", () => {
    const s = createInitialState(1);
    const left = updatePaddle(s, -9999);
    assert.equal(left.paddle.x, 0);
    const right = updatePaddle(s, 99999);
    assert.equal(right.paddle.x, BOARD_WIDTH - PADDLE_WIDTH);
  });

  it("ball follows paddle in ready state", () => {
    const s = createInitialState(1);
    const moved = updatePaddle(s, 200);
    assert.equal(moved.ball.x, moved.paddle.x + moved.paddle.width / 2);
  });

  it("ball stays put once playing", () => {
    const s = launchBall(createInitialState(1));
    const startBall = { ...s.ball };
    const moved = updatePaddle(s, 200);
    assert.deepEqual(moved.ball, startBall);
  });
});

// ---------- tick: wall bounces ----------------------------------------
describe("tick: wall bounces", () => {
  it("bounces off left wall", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: BALL_RADIUS + 0.1, y: 300 },
      ballVelocity: { x: -5, y: 0 },
    };
    const next = tick(s, 16.666, null);
    assert.ok(next.ballVelocity.x > 0);
  });

  it("bounces off top wall", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: 400, y: BALL_RADIUS + 0.1 },
      ballVelocity: { x: 0, y: -5 },
      blocks: [{ ...FILLER_BLOCK }],
    };
    const next = tick(s, 16.666, null);
    assert.ok(next.ballVelocity.y > 0);
  });
});

// ---------- tick: paddle collision ------------------------------------
describe("tick: paddle collision", () => {
  it("ball bounces up off paddle and x-velocity picks up hit offset", () => {
    const paddleCenterX = BOARD_WIDTH / 2;
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      paddle: {
        x: paddleCenterX - PADDLE_WIDTH / 2,
        y: PADDLE_Y,
        width: PADDLE_WIDTH,
      },
      // Just above the paddle's right edge.
      ball: { x: paddleCenterX + PADDLE_WIDTH / 3, y: PADDLE_Y - BALL_RADIUS },
      ballVelocity: { x: 0, y: 5 },
      blocks: [{ ...FILLER_BLOCK }],
    };
    const next = tick(s, 16.666, null);
    assert.ok(next.ballVelocity.y < 0, "ball should be going up");
    assert.ok(next.ballVelocity.x > 0, "right-of-centre hit → positive vx");
  });

  it("paddle hit resets combo", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      paddle: {
        x: BOARD_WIDTH / 2 - PADDLE_WIDTH / 2,
        y: PADDLE_Y,
        width: PADDLE_WIDTH,
      },
      ball: { x: BOARD_WIDTH / 2, y: PADDLE_Y - BALL_RADIUS },
      ballVelocity: { x: 0, y: 5 },
      blocks: [],
      combo: 12,
      maxCombo: 12,
    };
    const next = tick(s, 16.666, null);
    assert.equal(next.combo, 0);
    assert.equal(next.maxCombo, 12); // maxCombo preserved
  });
});

// ---------- tick: block collision -------------------------------------
describe("tick: block collision", () => {
  it("single-hit block destroyed, score + combo update", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: 100, y: 200 },
      ballVelocity: { x: 0, y: -5 },
      blocks: [
        {
          x: 80,
          y: 180,
          width: 70,
          height: 22,
          hits: 1,
          maxHits: 1,
          color: "yellow",
          points: 10,
          destroyed: false,
        },
        { ...FILLER_BLOCK },
      ],
    };
    const next = tick(s, 16.666, null);
    // Find the test block we aimed at.
    const target = next.blocks.find((b) => b.x === 80 && b.y === 180);
    assert.ok(target?.destroyed);
    assert.equal(next.score, 10);
    assert.equal(next.combo, 1);
  });

  it("multi-hit block: first hit subtracts 1, stays alive", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: 100, y: 200 },
      ballVelocity: { x: 0, y: -5 },
      blocks: [
        {
          x: 80,
          y: 180,
          width: 70,
          height: 22,
          hits: 3,
          maxHits: 3,
          color: "pink",
          points: 50,
          destroyed: false,
        },
      ],
    };
    const next = tick(s, 16.666, null);
    assert.equal(next.blocks[0].destroyed, false);
    assert.equal(next.blocks[0].hits, 2);
    assert.equal(next.score, 0); // only credited on destroy
  });
});

// ---------- tick: life loss / game over -------------------------------
describe("tick: life loss and game over", () => {
  it("ball past bottom → lose a life, back to ready", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: 400, y: BOARD_HEIGHT + BALL_RADIUS + 10 },
      ballVelocity: { x: 0, y: 5 },
      blocks: [],
      lives: 3,
    };
    const next = tick(s, 16.666, null);
    assert.equal(next.lives, 2);
    assert.equal(next.status, "ready");
    assert.equal(next.combo, 0);
  });

  it("last life lost → gameOver with lives=0", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: 400, y: BOARD_HEIGHT + BALL_RADIUS + 10 },
      ballVelocity: { x: 0, y: 5 },
      blocks: [],
      lives: 1,
    };
    const next = tick(s, 16.666, null);
    assert.equal(next.status, "gameOver");
    assert.equal(next.lives, 0);
  });
});

// ---------- tick: level progression -----------------------------------
describe("tick: level progression", () => {
  it("breaking the last block of a non-final level advances", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: 100, y: 200 },
      ballVelocity: { x: 0, y: -5 },
      blocks: [
        {
          x: 80,
          y: 180,
          width: 70,
          height: 22,
          hits: 1,
          maxHits: 1,
          color: "yellow",
          points: 10,
          destroyed: false,
        },
      ],
      level: 1,
    };
    const next = tick(s, 16.666, null);
    assert.equal(next.status, "ready");
    assert.equal(next.level, 2);
    assert.equal(next.combo, 0);
    // Fresh level-2 board.
    assert.ok(next.blocks.length > 0);
    assert.ok(next.blocks.every((b) => !b.destroyed));
  });

  it("breaking the last block of the final level → won", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: 100, y: 200 },
      ballVelocity: { x: 0, y: -5 },
      blocks: [
        {
          x: 80,
          y: 180,
          width: 70,
          height: 22,
          hits: 1,
          maxHits: 1,
          color: "yellow",
          points: 10,
          destroyed: false,
        },
      ],
      level: MAX_LEVELS,
    };
    const next = tick(s, 16.666, null);
    assert.equal(next.status, "won");
  });
});

// ---------- tick: speed cap -------------------------------------------
describe("tick: speed cap", () => {
  it("ball speed is capped at MAX_BALL_SPEED", () => {
    const s: BreakoutState = {
      ...launchBall(createInitialState(1)),
      ball: { x: 400, y: 300 },
      ballVelocity: { x: 20, y: 20 }, // magnitude > MAX
      blocks: [],
    };
    const next = tick(s, 16.666, null);
    const sp = Math.sqrt(
      next.ballVelocity.x ** 2 + next.ballVelocity.y ** 2,
    );
    assert.ok(sp <= MAX_BALL_SPEED + 1e-6);
  });
});

// ---------- tick: status gating ---------------------------------------
describe("tick: status gating", () => {
  it("playing required — gameOver frozen", () => {
    const s: BreakoutState = {
      ...createInitialState(1),
      status: "gameOver",
    };
    assert.deepEqual(tick(s, 16.666, null), s);
  });

  it("ready: paddle follows pointer without advancing physics", () => {
    const s = createInitialState(1);
    const next = tick(s, 16.666, 100);
    assert.equal(next.status, "ready");
    assert.ok(approx(next.paddle.x, 100 - PADDLE_WIDTH / 2));
  });
});

// ---------- calculateScore --------------------------------------------
describe("calculateScore", () => {
  it("base score + maxCombo × 25", () => {
    const s: BreakoutState = {
      ...createInitialState(1),
      score: 500,
      maxCombo: 10,
    };
    assert.equal(calculateScore(s), 500 + 10 * 25);
  });

  it("+1000 win bonus on `won`", () => {
    const s: BreakoutState = {
      ...createInitialState(1),
      score: 3_000,
      maxCombo: 20,
      status: "won",
    };
    assert.equal(calculateScore(s), 3_000 + 20 * 25 + 1_000);
  });
});

// padding
assert.ok(PADDLE_HEIGHT > 0);
