/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BALL_RADIUS,
  BOUNCE_VELOCITY,
  GRAVITY,
  PLATFORM_COUNT,
  PLATFORM_SPACING,
  TERMINAL_VELOCITY,
  calculateScore,
  createInitialState,
  rotateCylinder,
  tick,
} from "./engine";
import type { HelixState } from "./types";

const TAU = Math.PI * 2;

/** Rotate the state so the ball sits inside the segment of the given type on `platform`. */
function alignWithSegment(
  state: HelixState,
  platformIndex: number,
  type: "gap" | "normal" | "danger",
): HelixState {
  const platform = state.platforms[platformIndex];
  const seg = platform.segments.find((s) => s.type === type);
  if (!seg) {
    throw new Error(`no segment of type ${type} on platform ${platformIndex}`);
  }
  const mid = (seg.startAngle + seg.endAngle) / 2;
  return { ...state, cylinderRotation: mid };
}

/** Put ball right above a platform, moving downward. */
function placeAbove(
  state: HelixState,
  platformIndex: number,
  vy = 5,
): HelixState {
  const p = state.platforms[platformIndex];
  return { ...state, ballY: p.y - BALL_RADIUS + 1, ballVy: vy };
}

describe("createInitialState", () => {
  it("produces the configured number of platforms", () => {
    const s = createInitialState(12345);
    assert.equal(s.platforms.length, PLATFORM_COUNT);
  });

  it("spaces platforms by PLATFORM_SPACING", () => {
    const s = createInitialState(1);
    assert.equal(s.platforms[0].y, PLATFORM_SPACING);
    assert.equal(s.platforms[1].y, PLATFORM_SPACING * 2);
    assert.equal(
      s.platforms[PLATFORM_COUNT - 1].y,
      PLATFORM_SPACING * PLATFORM_COUNT,
    );
  });

  it("initialises all game-state fields", () => {
    const s = createInitialState(7);
    assert.equal(s.ballY, 0);
    assert.equal(s.ballVy, 0);
    assert.equal(s.cylinderRotation, 0);
    assert.equal(s.score, 0);
    assert.equal(s.combo, 0);
    assert.equal(s.status, "playing");
    assert.equal(s.seed, 7);
  });
});

describe("generatePlatform (via initial state)", () => {
  it("every platform has exactly 6 segments covering 2π", () => {
    const s = createInitialState(42);
    for (const p of s.platforms) {
      assert.equal(p.segments.length, 6);
      assert.ok(Math.abs(p.segments[0].startAngle - 0) < 1e-9);
      assert.ok(Math.abs(p.segments[5].endAngle - TAU) < 1e-9);
    }
  });

  it("every platform has at least one gap segment", () => {
    const s = createInitialState(99);
    for (const p of s.platforms) {
      assert.ok(p.segments.some((seg) => seg.type === "gap"));
    }
  });
});

describe("rotateCylinder", () => {
  it("accumulates rotation", () => {
    let s = createInitialState(1);
    s = rotateCylinder(s, 0.5);
    s = rotateCylinder(s, 0.25);
    assert.ok(Math.abs(s.cylinderRotation - 0.75) < 1e-9);
  });

  it("no-op after gameOver", () => {
    const s: HelixState = { ...createInitialState(1), status: "gameOver" };
    const after = rotateCylinder(s, 1.5);
    assert.equal(after.cylinderRotation, 0);
  });
});

describe("tick", () => {
  it("applies gravity to ballVy", () => {
    const s = createInitialState(1);
    const after = tick(s, 16.67);
    // One full frame of gravity.
    assert.ok(Math.abs(after.ballVy - GRAVITY) < 1e-6);
  });

  it("caps ballVy at terminal velocity", () => {
    const s: HelixState = {
      ...createInitialState(1),
      ballVy: TERMINAL_VELOCITY - 0.01,
    };
    const after = tick(s, 16.67);
    assert.ok(after.ballVy <= TERMINAL_VELOCITY + 1e-9);
    // Further ticks never exceed it.
    const later = tick(after, 16.67);
    assert.ok(later.ballVy <= TERMINAL_VELOCITY + 1e-9);
  });

  it("bounces off a normal segment (combo resets, ballVy negative)", () => {
    let s = createInitialState(1);
    // Make ball arrive on platform 0 lined up with a normal segment.
    s = alignWithSegment(s, 0, "normal");
    s = placeAbove(s, 0, 5);
    s = { ...s, combo: 4 };
    const after = tick(s, 16.67);
    assert.equal(after.ballVy, BOUNCE_VELOCITY);
    assert.equal(after.combo, 0);
    assert.equal(after.status, "playing");
  });

  it("passes through a gap and scores", () => {
    let s = createInitialState(1);
    s = alignWithSegment(s, 0, "gap");
    s = placeAbove(s, 0, 5);
    const after = tick(s, 16.67);
    assert.equal(after.score, 1);
    assert.equal(after.combo, 1);
    assert.equal(after.status, "playing");
  });

  it("danger + low combo ends the game", () => {
    let s = createInitialState(1);
    // Find a platform that actually has a danger segment.
    const idx = s.platforms.findIndex((p) =>
      p.segments.some((seg) => seg.type === "danger"),
    );
    assert.ok(idx >= 0, "expected at least one platform with a danger segment");
    s = alignWithSegment(s, idx, "danger");
    s = placeAbove(s, idx, 5);
    s = { ...s, combo: 0 };
    const after = tick(s, 16.67);
    assert.equal(after.status, "gameOver");
  });

  it("danger + combo >= 3 breaks through and keeps playing", () => {
    let s = createInitialState(1);
    const idx = s.platforms.findIndex((p) =>
      p.segments.some((seg) => seg.type === "danger"),
    );
    assert.ok(idx >= 0);
    s = alignWithSegment(s, idx, "danger");
    s = placeAbove(s, idx, 5);
    s = { ...s, combo: 3 };
    const after = tick(s, 16.67);
    assert.equal(after.status, "playing");
    assert.equal(after.score, 1);
    assert.equal(after.combo, 4);
  });

  it("combo increments on gap pass, resets on normal bounce", () => {
    let s = createInitialState(1);
    // pass gap on platform 0
    s = alignWithSegment(s, 0, "gap");
    s = placeAbove(s, 0, 5);
    s = tick(s, 16.67);
    assert.equal(s.combo, 1);
    // Now bounce on platform 1.
    s = alignWithSegment(s, 1, "normal");
    s = placeAbove(s, 1, 5);
    s = tick(s, 16.67);
    assert.equal(s.combo, 0);
  });

  it("does not double-count the same platform (passed flag)", () => {
    let s = createInitialState(1);
    s = alignWithSegment(s, 0, "gap");
    s = placeAbove(s, 0, 5);
    s = tick(s, 16.67);
    const scoreAfterFirst = s.score;
    // Tick again while still overlapping the same platform.
    s = placeAbove(s, 0, 5);
    s = tick(s, 16.67);
    assert.equal(s.score, scoreAfterFirst);
  });

  it("frozen after gameOver (tick is a no-op)", () => {
    const s: HelixState = { ...createInitialState(1), status: "gameOver" };
    const after = tick(s, 100);
    assert.equal(after, s);
  });

  it("ballY moves downward under positive velocity", () => {
    const s: HelixState = { ...createInitialState(1), ballVy: 3 };
    const after = tick(s, 16.67);
    assert.ok(after.ballY > s.ballY);
  });
});

describe("calculateScore", () => {
  it("multiplies passed platforms by 10", () => {
    const s: HelixState = { ...createInitialState(1), score: 5 };
    assert.equal(calculateScore(s), 50);
  });

  it("clamps negatives to 0", () => {
    const s: HelixState = { ...createInitialState(1), score: -1 };
    assert.equal(calculateScore(s), 0);
  });
});
