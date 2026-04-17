/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BALL_RADIUS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  INITIAL_BALL_SPEED,
  MATCH_DURATION_MS,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_X_OFFSET,
  calculateScore,
  createInitialState,
  setPlayerPaddleVelocity,
  startGame,
  tick,
  updateAiPaddle,
  updateBall,
  updatePlayerPaddle,
} from "./engine";
import type { PongState } from "./types";

// ---------- createInitialState ----------------------------------------
describe("createInitialState", () => {
  it("centres the ball and both paddles; status=ready", () => {
    const s = createInitialState(1);
    assert.equal(s.status, "ready");
    assert.equal(s.ball.x, BOARD_WIDTH / 2);
    assert.equal(s.ball.y, BOARD_HEIGHT / 2);
    assert.equal(s.playerPaddle.y, BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2);
    assert.equal(s.aiPaddle.y, BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2);
    assert.equal(s.playerScore, 0);
    assert.equal(s.aiScore, 0);
    assert.equal(s.totalRallies, 0);
    assert.equal(s.durationMs, MATCH_DURATION_MS);
  });

  it("is deterministic for the same seed", () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    assert.deepEqual(a.ballVelocity, b.ballVelocity);
  });
});

describe("startGame", () => {
  it("flips status to playing and resets elapsed", () => {
    const s = createInitialState(1);
    const started = startGame({ ...s, elapsedMs: 100 });
    assert.equal(started.status, "playing");
    assert.equal(started.elapsedMs, 0);
  });
});

// ---------- player paddle ---------------------------------------------
describe("setPlayerPaddleVelocity", () => {
  it("stores vy for keyboard-driven movement", () => {
    const s = startGame(createInitialState(1));
    const next = setPlayerPaddleVelocity(s, -5);
    assert.equal(next.playerPaddle.vy, -5);
  });
});

const approx = (a: number, b: number, eps = 0.01) =>
  Math.abs(a - b) < eps;

describe("updatePlayerPaddle", () => {
  it("follows cursor target and clamps to board", () => {
    const s = startGame(createInitialState(1));
    const afterTop = updatePlayerPaddle(
      { ...s, playerPaddle: { y: 50, vy: 0 } },
      -9999,
      16.666,
    );
    // One full frame at PADDLE_MAX_SPEED (=8) → 50 - 8 = 42 within epsilon.
    assert.ok(approx(afterTop.playerPaddle.y, 42), `got ${afterTop.playerPaddle.y}`);
    const pinned = updatePlayerPaddle(
      { ...s, playerPaddle: { y: 0, vy: 0 } },
      -9999,
      16.67,
    );
    assert.equal(pinned.playerPaddle.y, 0); // floored at 0
  });

  it("keyboard mode integrates vy", () => {
    const s = startGame(createInitialState(1));
    const withVel = setPlayerPaddleVelocity(s, 4);
    const next = updatePlayerPaddle(withVel, null, 16.666);
    // vy=4 × (1 frame) ≈ 4 within epsilon.
    assert.ok(approx(next.playerPaddle.y, withVel.playerPaddle.y + 4));
  });

  it("does nothing when not playing", () => {
    const s = createInitialState(1); // ready
    const next = updatePlayerPaddle(s, 0, 16.67);
    assert.deepEqual(next, s);
  });
});

// ---------- AI paddle -------------------------------------------------
describe("updateAiPaddle", () => {
  it("drifts toward centre when the ball is receding", () => {
    const s: PongState = {
      ...startGame(createInitialState(1)),
      ball: { x: BOARD_WIDTH / 2, y: 0 },
      ballVelocity: { x: -INITIAL_BALL_SPEED, y: 0 },
      aiPaddle: { y: 0, vy: 0 },
    };
    const next = updateAiPaddle(s, 16.67);
    // Should begin drifting down toward centre (positive delta).
    assert.ok(next.aiPaddle.y > 0);
  });

  it("tracks the ball when it's incoming", () => {
    const s: PongState = {
      ...startGame(createInitialState(1)),
      ball: { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT - 20 },
      ballVelocity: { x: INITIAL_BALL_SPEED, y: 0 },
      aiPaddle: { y: 20, vy: 0 },
    };
    const next = updateAiPaddle(s, 16.67);
    assert.ok(next.aiPaddle.y > 20); // moved down toward ball
  });
});

// ---------- ball ------------------------------------------------------
describe("updateBall", () => {
  it("bounces off the top wall", () => {
    const s: PongState = {
      ...startGame(createInitialState(1)),
      ball: { x: 400, y: BALL_RADIUS - 1 },
      ballVelocity: { x: 0, y: -5 },
    };
    const next = updateBall(s, 16.67);
    assert.ok(next.ballVelocity.y > 0);
    assert.ok(next.ball.y >= BALL_RADIUS);
  });

  it("bounces off the bottom wall", () => {
    const s: PongState = {
      ...startGame(createInitialState(1)),
      ball: { x: 400, y: BOARD_HEIGHT - BALL_RADIUS + 1 },
      ballVelocity: { x: 0, y: 5 },
    };
    const next = updateBall(s, 16.67);
    assert.ok(next.ballVelocity.y < 0);
  });

  it("collides with the player paddle — bounces right and counts rally", () => {
    const paddleY = BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    const s: PongState = {
      ...startGame(createInitialState(1)),
      ball: {
        x: PADDLE_X_OFFSET + PADDLE_WIDTH + BALL_RADIUS + 1,
        y: BOARD_HEIGHT / 2,
      },
      ballVelocity: { x: -5, y: 0 },
      playerPaddle: { y: paddleY, vy: 0 },
    };
    const next = updateBall(s, 16.67);
    assert.ok(next.ballVelocity.x > 0, "vx should flip positive");
    assert.equal(next.rallyCount, 1);
    assert.equal(next.totalRallies, 1);
    assert.ok(next.ballSpeed > INITIAL_BALL_SPEED);
  });

  it("collides with the AI paddle — bounces left", () => {
    const aiLeft = BOARD_WIDTH - PADDLE_X_OFFSET - PADDLE_WIDTH;
    const paddleY = BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    const s: PongState = {
      ...startGame(createInitialState(1)),
      ball: { x: aiLeft - BALL_RADIUS - 1, y: BOARD_HEIGHT / 2 },
      ballVelocity: { x: 5, y: 0 },
      aiPaddle: { y: paddleY, vy: 0 },
    };
    const next = updateBall(s, 16.67);
    assert.ok(next.ballVelocity.x < 0, "vx should flip negative");
  });

  it("ball past left edge → AI scores and ball recentres", () => {
    const s: PongState = {
      ...startGame(createInitialState(1)),
      ball: { x: -BALL_RADIUS - 5, y: 100 },
      ballVelocity: { x: -5, y: 0 },
      aiScore: 0,
    };
    const next = updateBall(s, 16.67);
    assert.equal(next.aiScore, 1);
    assert.equal(next.ball.x, BOARD_WIDTH / 2);
    assert.equal(next.ball.y, BOARD_HEIGHT / 2);
    assert.equal(next.rallyCount, 0);
    // Serve toward AI (positive vx) after AI scores.
    assert.ok(next.ballVelocity.x > 0);
  });

  it("ball past right edge → player scores", () => {
    const s: PongState = {
      ...startGame(createInitialState(1)),
      ball: { x: BOARD_WIDTH + BALL_RADIUS + 5, y: 100 },
      ballVelocity: { x: 5, y: 0 },
      playerScore: 0,
    };
    const next = updateBall(s, 16.67);
    assert.equal(next.playerScore, 1);
    assert.ok(next.ballVelocity.x < 0, "serve toward player");
  });
});

// ---------- tick ------------------------------------------------------
describe("tick", () => {
  it("does nothing unless status is playing", () => {
    const s = createInitialState(1); // ready
    assert.deepEqual(tick(s, 16.67, null), s);
    const finished = { ...s, status: "finished" as const };
    assert.deepEqual(tick(finished, 16.67, null), finished);
  });

  it("flips to finished when the clock runs out", () => {
    const s: PongState = {
      ...startGame(createInitialState(1)),
      elapsedMs: MATCH_DURATION_MS - 10,
    };
    const next = tick(s, 100, null);
    assert.equal(next.status, "finished");
    assert.equal(next.elapsedMs, MATCH_DURATION_MS);
  });

  it("advances elapsedMs while playing", () => {
    const s = startGame(createInitialState(1));
    const next = tick(s, 33, 200);
    assert.equal(next.elapsedMs, 33);
  });
});

// ---------- calculateScore --------------------------------------------
describe("calculateScore", () => {
  it("rally × 10 + (player − AI) × 50", () => {
    const s: PongState = {
      ...createInitialState(1),
      totalRallies: 12,
      playerScore: 3,
      aiScore: 1,
    };
    assert.equal(calculateScore(s), 12 * 10 + (3 - 1) * 50);
  });

  it("floored at 0 on a bad match", () => {
    const s: PongState = {
      ...createInitialState(1),
      totalRallies: 0,
      playerScore: 0,
      aiScore: 5,
    };
    assert.equal(calculateScore(s), 0);
  });
});
