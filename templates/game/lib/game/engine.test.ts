/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addPoints,
  calculateScore,
  createInitialState,
  endGame,
} from "./engine";

describe("createInitialState", () => {
  it("starts at zero, playing status", () => {
    const s = createInitialState(0);
    assert.equal(s.score, 0);
    assert.equal(s.status, "playing");
  });
});

describe("addPoints", () => {
  it("adds delta while playing", () => {
    const s = addPoints(createInitialState(0), 10);
    assert.equal(s.score, 10);
  });

  it("no-op after game over", () => {
    const s = endGame(createInitialState(0));
    const after = addPoints(s, 50);
    assert.equal(after.score, s.score);
  });
});

describe("calculateScore", () => {
  it("clamps negative totals to 0", () => {
    const s = { ...createInitialState(0), score: -5 };
    assert.equal(calculateScore(s), 0);
  });
});
