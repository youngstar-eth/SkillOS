/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_HEIGHT,
  CEILING_Y,
  FLOOR_Y,
  GRAVITY,
  INITIAL_SPEED,
  MAX_VY,
  PLAYER_RADIUS,
  PLAYER_X,
  THRUST,
  calculateScore,
  createInitialState,
  setThrust,
  tick,
} from "./engine";
import type { JetpackState } from "./types";

const FRAME_MS = 16.67;

describe("createInitialState", () => {
  it("produces hazards and coins arrays deterministic per seed", () => {
    const s = createInitialState(42);
    assert.ok(s.hazards.length > 0, "hazards populated");
    assert.ok(s.coins.length > 0, "coins populated");
    assert.equal(s.status, "playing");
    assert.equal(s.distance, 0);
    assert.equal(s.coinsCollected, 0);
    assert.equal(s.speed, INITIAL_SPEED);
    assert.equal(s.playerY, BOARD_HEIGHT / 2);
    assert.equal(s.playerVy, 0);

    const s2 = createInitialState(42);
    assert.equal(s2.hazards.length, s.hazards.length);
    assert.equal(s2.coins.length, s.coins.length);
  });
});

describe("setThrust", () => {
  it("turns thrust on", () => {
    const s = createInitialState(1);
    const t = setThrust(s, true);
    assert.equal(t.thrusting, true);
  });

  it("turns thrust off", () => {
    const s = setThrust(createInitialState(1), true);
    const t = setThrust(s, false);
    assert.equal(t.thrusting, false);
  });

  it("is a no-op after gameOver", () => {
    const s: JetpackState = { ...createInitialState(1), status: "gameOver" };
    const t = setThrust(s, true);
    assert.equal(t.thrusting, false);
  });
});

describe("tick physics", () => {
  it("gravity pulls player down without thrust", () => {
    const s = createInitialState(1);
    const after = tick(s, FRAME_MS);
    assert.ok(after.playerVy > 0, "vy should be positive (downward)");
    assert.ok(
      after.playerY >= s.playerY,
      "playerY should fall or stay clamped",
    );
    // exactly GRAVITY * 1 frame
    assert.equal(Math.round(after.playerVy * 100) / 100, GRAVITY);
  });

  it("thrust reduces vy (pushes upward)", () => {
    const s = setThrust(createInitialState(1), true);
    const after = tick(s, FRAME_MS);
    assert.ok(after.playerVy < 0, "vy should be negative (upward)");
    assert.equal(Math.round(after.playerVy * 100) / 100, THRUST);
  });

  it("ceiling clamp: player cannot go above CEILING_Y + PLAYER_RADIUS", () => {
    const s: JetpackState = {
      ...createInitialState(1),
      playerY: CEILING_Y + PLAYER_RADIUS + 1,
      playerVy: -MAX_VY,
      thrusting: true,
    };
    const after = tick(s, FRAME_MS);
    assert.equal(after.playerY, CEILING_Y + PLAYER_RADIUS);
    assert.equal(after.playerVy, 0);
  });

  it("floor clamp: player cannot go below FLOOR_Y - PLAYER_RADIUS", () => {
    const s: JetpackState = {
      ...createInitialState(1),
      playerY: FLOOR_Y - PLAYER_RADIUS - 1,
      playerVy: MAX_VY,
    };
    const after = tick(s, FRAME_MS);
    assert.equal(after.playerY, FLOOR_Y - PLAYER_RADIUS);
    assert.equal(after.playerVy, 0);
  });

  it("max vy clamp: vy cannot exceed MAX_VY", () => {
    const s: JetpackState = {
      ...createInitialState(1),
      playerY: BOARD_HEIGHT / 2,
      playerVy: MAX_VY,
    };
    const after = tick(s, FRAME_MS);
    assert.ok(after.playerVy <= MAX_VY, "vy clamped to MAX_VY");
    assert.ok(after.playerVy >= -MAX_VY, "vy clamped above -MAX_VY");
  });

  it("collides with hazard -> status gameOver", () => {
    const s: JetpackState = {
      ...createInitialState(1),
      playerY: 250,
      playerVy: 0,
      hazards: [
        {
          x: PLAYER_X - 20,
          y: 250 - 10,
          width: 40,
          height: 40,
          type: "laser-h",
        },
      ],
      coins: [],
    };
    const after = tick(s, FRAME_MS);
    assert.equal(after.status, "gameOver");
  });

  it("collects coin within radius", () => {
    const s: JetpackState = {
      ...createInitialState(1),
      playerY: 250,
      playerVy: 0,
      hazards: [],
      coins: [{ x: PLAYER_X, y: 250, collected: false }],
    };
    const after = tick(s, FRAME_MS);
    assert.equal(after.coinsCollected, 1);
  });

  it("filters offscreen hazards and coins", () => {
    const s: JetpackState = {
      ...createInitialState(1),
      hazards: [
        { x: -500, y: 100, width: 40, height: 40, type: "laser-h" },
        { x: 400, y: 100, width: 40, height: 40, type: "laser-h" },
      ],
      coins: [
        { x: -100, y: 100, collected: false },
        { x: 400, y: 100, collected: false },
      ],
    };
    const after = tick(s, FRAME_MS);
    assert.equal(after.hazards.length, 1, "far offscreen hazard filtered");
    assert.equal(after.coins.length, 1, "far offscreen coin filtered");
  });

  it("speed increases over time", () => {
    const s = createInitialState(1);
    const after = tick(s, FRAME_MS);
    assert.ok(after.speed > s.speed, "speed increments with dt");
  });

  it("distance accumulates while playing", () => {
    const s = createInitialState(1);
    const after = tick(s, FRAME_MS);
    assert.ok(after.distance > 0, "distance advances");
    assert.ok(after.elapsedMs > 0, "elapsedMs advances");
  });

  it("tick is a no-op after gameOver", () => {
    const s: JetpackState = {
      ...createInitialState(1),
      status: "gameOver",
    };
    const after = tick(s, FRAME_MS);
    assert.equal(after, s);
  });
});

describe("calculateScore", () => {
  it("sums distance/5 plus coins*50", () => {
    const s: JetpackState = {
      ...createInitialState(1),
      distance: 500,
      coinsCollected: 3,
    };
    assert.equal(calculateScore(s), Math.floor(500 / 5) + 3 * 50);
  });

  it("is zero at initial state", () => {
    assert.equal(calculateScore(createInitialState(1)), 0);
  });
});
