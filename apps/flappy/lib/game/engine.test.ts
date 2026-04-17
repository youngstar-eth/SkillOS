/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BIRD_RADIUS,
  BIRD_X,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FLAP_VELOCITY,
  GAP_SIZE,
  GRAVITY,
  PIPE_SPEED,
  PIPE_WIDTH,
  calculateScore,
  createInitialState,
  flap,
  tick,
} from "./engine";
import type { FlappyState, Pipe } from "./types";

// Advance a state by many small frames, stopping on gameOver.
function run(state: FlappyState, frames: number, dt = 16.67): FlappyState {
  let s = state;
  for (let i = 0; i < frames && s.status === "playing"; i++) {
    s = tick(s, dt);
  }
  return s;
}

describe("createInitialState", () => {
  it("starts ready with the bird centered vertically", () => {
    const s = createInitialState(42);
    assert.equal(s.status, "ready");
    assert.equal(s.birdY, BOARD_HEIGHT / 2);
    assert.equal(s.birdVy, 0);
    assert.equal(s.pipes.length, 0);
    assert.equal(s.score, 0);
    assert.equal(s.elapsedMs, 0);
    assert.equal(s.seed, 42);
  });

  it("guards against a zero seed by coercing rng to 1", () => {
    const s = createInitialState(0);
    assert.equal(s.rng, 1);
  });
});

describe("flap", () => {
  it("flips ready -> playing and applies flap velocity", () => {
    const s = flap(createInitialState(1));
    assert.equal(s.status, "playing");
    assert.equal(s.birdVy, FLAP_VELOCITY);
  });

  it("resets velocity while playing", () => {
    let s = flap(createInitialState(1));
    s = tick(s, 16.67); // accumulate some gravity
    assert.ok(s.birdVy > FLAP_VELOCITY);
    const flapped = flap(s);
    assert.equal(flapped.birdVy, FLAP_VELOCITY);
    assert.equal(flapped.status, "playing");
  });

  it("does not mutate a gameOver state", () => {
    const over: FlappyState = { ...createInitialState(1), status: "gameOver" };
    const after = flap(over);
    assert.equal(after, over);
  });
});

describe("tick", () => {
  it("gravity increases vy while playing", () => {
    const s = flap(createInitialState(1));
    const next = tick(s, 16.67);
    assert.ok(next.birdVy > s.birdVy);
    // Precisely: +GRAVITY per 16.67ms frame.
    assert.ok(Math.abs(next.birdVy - (FLAP_VELOCITY + GRAVITY)) < 1e-6);
  });

  it("bird hitting the ground triggers gameOver", () => {
    let s = flap(createInitialState(1));
    // Drop the bird just above the ground and let gravity finish the job.
    s = { ...s, birdY: BOARD_HEIGHT - BIRD_RADIUS - 1, birdVy: 10 };
    const after = run(s, 10);
    assert.equal(after.status, "gameOver");
  });

  it("bird hitting the ceiling triggers gameOver", () => {
    let s = flap(createInitialState(1));
    s = { ...s, birdY: BIRD_RADIUS + 0.5, birdVy: -10 };
    const after = tick(s, 16.67);
    assert.equal(after.status, "gameOver");
  });

  it("spawns a pipe on the very first playing tick", () => {
    const s = flap(createInitialState(1));
    const after = tick(s, 16.67);
    assert.equal(after.pipes.length, 1);
    assert.equal(after.pipes[0].x, BOARD_WIDTH);
    assert.equal(after.pipes[0].passed, false);
    assert.equal(after.pipes[0].gapSize, GAP_SIZE);
  });

  it("pipes move left over time", () => {
    const s = flap(createInitialState(1));
    const a = tick(s, 16.67);
    const b = tick(a, 16.67);
    assert.ok(b.pipes[0].x < a.pipes[0].x);
    // ~PIPE_SPEED px per 16.67ms frame.
    assert.ok(Math.abs(a.pipes[0].x - b.pipes[0].x - PIPE_SPEED) < 1e-6);
  });

  it("collision with pipe top triggers gameOver", () => {
    const playing = flap(createInitialState(1));
    // Place a pipe around the bird with the gap entirely below it.
    const pipe: Pipe = {
      x: BIRD_X - PIPE_WIDTH / 2,
      gapY: BOARD_HEIGHT - 100,
      gapSize: GAP_SIZE,
      passed: false,
    };
    const s: FlappyState = {
      ...playing,
      pipes: [pipe],
      birdY: BOARD_HEIGHT / 2,
      birdVy: 0,
    };
    const after = tick(s, 16.67);
    assert.equal(after.status, "gameOver");
  });

  it("collision with pipe bottom triggers gameOver", () => {
    const playing = flap(createInitialState(1));
    const pipe: Pipe = {
      x: BIRD_X - PIPE_WIDTH / 2,
      gapY: 50,
      gapSize: GAP_SIZE,
      passed: false,
    };
    const s: FlappyState = {
      ...playing,
      pipes: [pipe],
      birdY: BOARD_HEIGHT - 100,
      birdVy: 0,
    };
    const after = tick(s, 16.67);
    assert.equal(after.status, "gameOver");
  });

  it("bird in the gap survives and score increments once the pipe passes", () => {
    const playing = flap(createInitialState(1));
    // Pipe already past the bird: right edge < BIRD_X, gap aligned with bird.
    const pipe: Pipe = {
      x: BIRD_X - PIPE_WIDTH - 1,
      gapY: BOARD_HEIGHT / 2,
      gapSize: GAP_SIZE,
      passed: false,
    };
    const s: FlappyState = {
      ...playing,
      pipes: [pipe],
      birdY: BOARD_HEIGHT / 2,
      birdVy: 0,
    };
    const after = tick(s, 16.67);
    assert.equal(after.status, "playing");
    assert.equal(after.score, 1);
    assert.equal(after.pipes[0].passed, true);
  });

  it("filters pipes that leave the left edge", () => {
    const playing = flap(createInitialState(1));
    const pipe: Pipe = {
      x: -PIPE_WIDTH - 5,
      gapY: BOARD_HEIGHT / 2,
      gapSize: GAP_SIZE,
      passed: true,
    };
    const s: FlappyState = {
      ...playing,
      pipes: [pipe],
      birdY: BOARD_HEIGHT / 2,
      birdVy: 0,
    };
    const after = tick(s, 16.67);
    // Original pipe dropped; a freshly spawned one replaces it at the right.
    assert.equal(after.pipes.length, 1);
    assert.equal(after.pipes[0].x, BOARD_WIDTH);
  });

  it("does not advance state while ready", () => {
    const s = createInitialState(1);
    const after = tick(s, 100);
    assert.equal(after, s);
  });

  it("does not advance state after gameOver", () => {
    const over: FlappyState = { ...createInitialState(1), status: "gameOver" };
    const after = tick(over, 100);
    assert.equal(after, over);
  });

  it("accumulates elapsedMs while playing", () => {
    const s = flap(createInitialState(1));
    const after = tick(s, 16.67);
    assert.ok(Math.abs(after.elapsedMs - 16.67) < 1e-6);
  });
});

describe("calculateScore", () => {
  it("combines pipes passed and seconds survived", () => {
    const base = createInitialState(1);
    const s: FlappyState = { ...base, score: 3, elapsedMs: 4500 };
    assert.equal(calculateScore(s), 3 * 10 + 4);
  });
});
