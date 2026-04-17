/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_HEIGHT,
  CAR_HEIGHT,
  FUEL_CONSUMPTION,
  MAX_FUEL,
  calculateScore,
  createInitialState,
  setThrottle,
  tick,
} from "./engine";

describe("createInitialState", () => {
  it("produces a terrain array of 2000 samples, car sitting on the ground", () => {
    const s = createInitialState(42);
    assert.equal(s.terrain.length, 2000);
    assert.equal(s.status, "playing");
    assert.equal(s.fuel, MAX_FUEL);
    assert.equal(s.throttle, 0);
    assert.equal(s.carX, 80);
    // Car rests on top of terrain[4] (80 / 20 == 4).
    assert.equal(s.carY, s.terrain[4] - CAR_HEIGHT);
    // Terrain stays inside the vertical band.
    for (const h of s.terrain) {
      assert.ok(h >= BOARD_HEIGHT - 250);
      assert.ok(h <= BOARD_HEIGHT - 50);
    }
  });

  it("is deterministic — same seed produces identical terrain", () => {
    const a = createInitialState(1234);
    const b = createInitialState(1234);
    assert.deepEqual(a.terrain, b.terrain);
  });

  it("different seeds produce different terrain", () => {
    const a = createInitialState(1);
    const b = createInitialState(999999);
    assert.notDeepEqual(a.terrain, b.terrain);
  });
});

describe("setThrottle", () => {
  it("clamps throttle between -1 and 1", () => {
    const s = createInitialState(1);
    assert.equal(setThrottle(s, 5).throttle, 1);
    assert.equal(setThrottle(s, -5).throttle, -1);
    assert.equal(setThrottle(s, 0.5).throttle, 0.5);
    assert.equal(setThrottle(s, -0.3).throttle, -0.3);
  });

  it("is a no-op when the game is over", () => {
    const s = createInitialState(1);
    const dead = { ...s, status: "gameOver" as const };
    const after = setThrottle(dead, 1);
    assert.equal(after.throttle, 0);
    assert.equal(after.status, "gameOver");
  });
});

describe("tick", () => {
  it("gravity pulls a floating car downward", () => {
    const s = createInitialState(7);
    const floating = { ...s, carY: 0, carVy: 0 };
    const after = tick(floating, 16.67);
    assert.ok(after.carVy > 0, "downward velocity should accumulate");
    assert.ok(after.carY > floating.carY, "car should move down");
  });

  it("ground constraint snaps the car to the terrain", () => {
    const s = createInitialState(7);
    const sunken = { ...s, carY: BOARD_HEIGHT + 100, carVy: 10 };
    const after = tick(sunken, 16.67);
    assert.ok(after.carY < sunken.carY, "should be snapped back up");
    assert.equal(after.carVy, 0, "vertical velocity reset on ground");
  });

  it("forward throttle accelerates the car horizontally", () => {
    let s = createInitialState(7);
    s = setThrottle(s, 1);
    const startVx = s.carVx;
    for (let i = 0; i < 20; i++) s = tick(s, 16.67);
    assert.ok(s.carVx > startVx, "vx should increase with positive throttle");
    assert.ok(s.carX > 80, "car should have moved forward");
  });

  it("fuel depletes over time while playing", () => {
    const s0 = createInitialState(7);
    const s1 = tick(s0, 16.67);
    assert.ok(s1.fuel < s0.fuel, "fuel should decrease each tick");
    assert.ok(s0.fuel - s1.fuel <= FUEL_CONSUMPTION + 1e-9);
  });

  it("fuel reaching 0 flips the game to gameOver", () => {
    let s = createInitialState(7);
    s = { ...s, fuel: 0.01, throttle: 1 };
    const after = tick(s, 16.67);
    assert.equal(after.status, "gameOver");
    assert.equal(after.fuel, 0);
  });

  it("car angle responds to terrain slope over time", () => {
    let s = createInitialState(123);
    s = setThrottle(s, 1);
    let sawAngle = false;
    for (let i = 0; i < 200; i++) {
      s = tick(s, 16.67);
      if (Math.abs(s.carAngle) > 0.01) {
        sawAngle = true;
        break;
      }
      if (s.status !== "playing") break;
    }
    assert.ok(sawAngle, "car angle should respond to sloped terrain");
  });

  it("extreme flip (angle > 0.7π) ends the game", () => {
    const s = createInitialState(7);
    const flipped = { ...s, carAngle: Math.PI * 0.9 };
    const after = tick(flipped, 16.67);
    assert.equal(after.status, "gameOver");
  });

  it("distance and maxDistance track progress forward", () => {
    let s = createInitialState(55);
    s = setThrottle(s, 1);
    for (let i = 0; i < 30; i++) s = tick(s, 16.67);
    assert.ok(s.distance > 0, "distance should have grown");
    assert.ok(s.maxDistance >= s.distance);
  });

  it("tick on a finished game is a no-op", () => {
    const s = createInitialState(7);
    const dead = { ...s, status: "gameOver" as const };
    const after = tick(dead, 16.67);
    assert.equal(after, dead);
  });

  it("elapsedMs accumulates with each tick", () => {
    let s = createInitialState(7);
    const before = s.elapsedMs;
    s = tick(s, 16.67);
    s = tick(s, 16.67);
    assert.ok(s.elapsedMs > before);
    assert.ok(Math.abs(s.elapsedMs - 33.34) < 0.5);
  });
});

describe("calculateScore", () => {
  it("is floor(distance / 5)", () => {
    const s = createInitialState(1);
    assert.equal(calculateScore({ ...s, distance: 0 }), 0);
    assert.equal(calculateScore({ ...s, distance: 50 }), 10);
    assert.equal(calculateScore({ ...s, distance: 53 }), 10);
    assert.equal(calculateScore({ ...s, distance: 1234 }), 246);
  });
});
