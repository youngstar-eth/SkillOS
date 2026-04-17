/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_LEAVES_PER_CLICK,
  INITIAL_UPGRADES,
  MATCH_DURATION_MS,
  buyUpgrade,
  calculateScore,
  click,
  createInitialState,
  getUpgradeCost,
  tick,
} from "./engine";
import type { ClickerState } from "./types";

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ---------- createInitialState ----------------------------------------
describe("createInitialState", () => {
  it("starts at zero leaves with all upgrades un-owned", () => {
    const s = createInitialState(0);
    assert.equal(s.leaves, 0);
    assert.equal(s.totalClicks, 0);
    assert.equal(s.totalLeavesEarned, 0);
    assert.equal(s.leavesPerSecond, 0);
    assert.equal(s.leavesPerClick, BASE_LEAVES_PER_CLICK);
    assert.equal(s.status, "playing");
    assert.equal(s.durationMs, MATCH_DURATION_MS);
    assert.equal(s.upgrades.length, INITIAL_UPGRADES.length);
    for (const u of s.upgrades) assert.equal(u.owned, 0);
  });
});

// ---------- click -----------------------------------------------------
describe("click", () => {
  it("adds leavesPerClick per click and counts", () => {
    const s = createInitialState(0);
    const s1 = click(click(click(s)));
    assert.equal(s1.leaves, 3);
    assert.equal(s1.totalClicks, 3);
    assert.equal(s1.totalLeavesEarned, 3);
  });

  it("is a no-op once finished", () => {
    const s: ClickerState = { ...createInitialState(0), status: "finished" };
    assert.deepEqual(click(s), s);
  });
});

// ---------- getUpgradeCost --------------------------------------------
describe("getUpgradeCost", () => {
  it("returns base cost when owned=0", () => {
    const seedling = INITIAL_UPGRADES.find((u) => u.id === "seedling")!;
    assert.equal(getUpgradeCost({ ...seedling }), seedling.baseCost);
  });

  it("scales geometrically with owned", () => {
    const seedling = INITIAL_UPGRADES.find((u) => u.id === "seedling")!;
    const c5 = getUpgradeCost({ ...seedling, owned: 5 });
    // 10 * 1.15^5 = 20.11 → ceil 21
    assert.equal(c5, Math.ceil(seedling.baseCost * Math.pow(seedling.costMultiplier, 5)));
  });
});

// ---------- buyUpgrade ------------------------------------------------
describe("buyUpgrade", () => {
  it("is a no-op when under-funded", () => {
    const s = createInitialState(0); // 0 leaves
    assert.deepEqual(buyUpgrade(s, "seedling"), s);
  });

  it("deducts cost and increments owned + LPS", () => {
    // Give the player 50 leaves by hand so we can buy a Seedling (10).
    const s: ClickerState = { ...createInitialState(0), leaves: 50 };
    const s1 = buyUpgrade(s, "seedling");
    const seedling = s1.upgrades.find((u) => u.id === "seedling")!;
    assert.equal(seedling.owned, 1);
    assert.equal(s1.leaves, 40);
    assert.ok(approx(s1.leavesPerSecond, 0.2));
  });

  it("exponential cost ramp on repeat buys", () => {
    const s: ClickerState = { ...createInitialState(0), leaves: 1_000_000 };
    let cur = s;
    for (let i = 0; i < 3; i++) cur = buyUpgrade(cur, "seedling");
    const costs = [10, 12, 14]; // ceil(10 * 1.15^n) for n=0..2
    const totalCost = costs.reduce((a, b) => a + b, 0);
    assert.equal(cur.leaves, 1_000_000 - totalCost);
    const seedling = cur.upgrades.find((u) => u.id === "seedling")!;
    assert.equal(seedling.owned, 3);
  });

  it("click multiplier: leavesPerClick multiplies by 2 per Breeze Blessing", () => {
    const s: ClickerState = { ...createInitialState(0), leaves: 100_000 };
    const s1 = buyUpgrade(s, "wind");
    assert.equal(s1.leavesPerClick, 2);
    const s2 = buyUpgrade(s1, "wind");
    assert.equal(s2.leavesPerClick, 4);
  });

  it("respects maxOwned cap on Breeze Blessing (5)", () => {
    const s: ClickerState = { ...createInitialState(0), leaves: 1_000_000_000 };
    let cur = s;
    for (let i = 0; i < 7; i++) cur = buyUpgrade(cur, "wind");
    const wind = cur.upgrades.find((u) => u.id === "wind")!;
    assert.equal(wind.owned, 5);
    // 2^5 = 32 LPC
    assert.equal(cur.leavesPerClick, 32);
  });

  it("unknown id is a no-op", () => {
    const s: ClickerState = { ...createInitialState(0), leaves: 999 };
    assert.deepEqual(buyUpgrade(s, "nope"), s);
  });
});

// ---------- tick ------------------------------------------------------
describe("tick", () => {
  it("accrues passive income proportional to dt", () => {
    const s: ClickerState = {
      ...createInitialState(0),
      leaves: 0,
      leavesPerSecond: 10,
    };
    const s1 = tick(s, 1000); // 1 second → +10
    assert.ok(approx(s1.leaves, 10));
    assert.ok(approx(s1.totalLeavesEarned, 10));
  });

  it("flips to finished at or past duration and prorates the final tick", () => {
    const s: ClickerState = {
      ...createInitialState(0),
      elapsedMs: MATCH_DURATION_MS - 100,
      leavesPerSecond: 10,
    };
    const s1 = tick(s, 500); // only 100ms of "real" time remains
    assert.equal(s1.status, "finished");
    assert.equal(s1.elapsedMs, MATCH_DURATION_MS);
    // Expected passive: 10 * 0.1 = 1, not 10 * 0.5 = 5.
    assert.ok(approx(s1.leaves, 1));
  });

  it("is a no-op when finished", () => {
    const s: ClickerState = { ...createInitialState(0), status: "finished" };
    assert.deepEqual(tick(s, 1000), s);
  });
});

// ---------- calculateScore --------------------------------------------
describe("calculateScore", () => {
  it("0 leaves → 0 score", () => {
    assert.equal(calculateScore(createInitialState(0)), 0);
  });

  it("log10 × 1000 scaling", () => {
    const mk = (leaves: number): ClickerState => ({
      ...createInitialState(0),
      totalLeavesEarned: leaves,
    });
    // 999 → floor(log10(1000) * 1000) = 3000
    assert.equal(calculateScore(mk(999)), 3000);
    // 1M → floor(log10(1e6 + 1) * 1000) ≈ 6000
    assert.equal(calculateScore(mk(1_000_000)), 6000);
    // 1B → ~9000
    assert.equal(calculateScore(mk(1_000_000_000)), 9000);
  });
});
