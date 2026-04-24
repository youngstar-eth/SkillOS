// ───────────────────────────────────────────────────────────────────────────
// Unit tests for the pure SP engine. Node's built-in test runner via tsx —
// no jest/vitest dep. Run from package dir:
//
//   npx tsx --test src/engine.test.ts
//
// Or via the package script: `npm test` (wired through turbo pipeline).
//
// Coverage map:
//   1. awardSP — every verdict-tied kind × every verdict (9 cases)
//   2. awardSP — tournament rank bonus boundaries (rank 0/1/50/51/-1/1000)
//   3. levelForSP — at each threshold, between thresholds, and at the clamp
//   4. spForNextLevel — at L1 mid-band, at exact thresholds, at L10 (null next)
//   5. awardSPBreakdown — base × multiplier surfaces correctly
//
// We do NOT test the "pending" verdict here because the Verdict type
// enforces three values at compile time — the plan's "pending → throw"
// guarantee is provided structurally rather than at runtime. Call sites
// that know pending exists (hooks chained on plausibility waitUntil) skip
// the award entirely until the verdict lands.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  awardSP,
  awardSPBreakdown,
  levelForSP,
  spForNextLevel,
  LEVEL_THRESHOLDS,
} from "./engine";
import type { SPEvent, Verdict } from "./types";

describe("awardSP — verdict-tied events", () => {
  const cases: Array<{ kind: SPEvent["kind"]; base: number }> = [
    { kind: "duel_win", base: 100 },
    { kind: "duel_loss", base: 20 },
    { kind: "solo_submit", base: 50 },
  ];
  const verdicts: Array<{ v: Verdict; mult: number }> = [
    { v: "plausible", mult: 1.0 },
    { v: "suspicious", mult: 0.5 },
    { v: "implausible", mult: 0.0 },
  ];

  for (const c of cases) {
    for (const { v, mult } of verdicts) {
      it(`${c.kind} × ${v} = ${Math.round(c.base * mult)}`, () => {
        const event = { kind: c.kind, verdict: v } as SPEvent;
        assert.equal(awardSP(event), Math.round(c.base * mult));
      });
    }
  }
});

describe("awardSP — tournament rank bonus boundaries", () => {
  const cases: Array<[number, number]> = [
    [1, 100],     // rank 1 = (51 - 1) * 2
    [2, 98],
    [25, 52],
    [50, 2],      // last scoring rank
    [51, 0],      // off the curve
    [0, 0],       // below range
    [-1, 0],      // negative guard
    [1000, 0],    // far above range
  ];
  for (const [rank, expected] of cases) {
    it(`rank ${rank} → ${expected} SP`, () => {
      assert.equal(awardSP({ kind: "tournament_rank_bonus", rank }), expected);
    });
  }
});

describe("levelForSP", () => {
  it("0 SP → L1", () => assert.equal(levelForSP(0), 1));
  it("499 SP → L1 (one shy of threshold)", () => assert.equal(levelForSP(499), 1));
  it("500 SP → L2 (exact threshold)", () => assert.equal(levelForSP(500), 2));
  it("1499 SP → L2", () => assert.equal(levelForSP(1499), 2));
  it("1500 SP → L3", () => assert.equal(levelForSP(1500), 3));
  it("7500 SP → L5", () => assert.equal(levelForSP(7500), 5));
  it("14999 SP → L5", () => assert.equal(levelForSP(14999), 5));
  it("15000 SP → L6", () => assert.equal(levelForSP(15000), 6));
  it("49999 SP → L9", () => assert.equal(levelForSP(49999), 9));
  it("50000 SP → L10", () => assert.equal(levelForSP(50000), 10));
  it("1,000,000 SP → L10 (clamps)", () => assert.equal(levelForSP(1_000_000), 10));

  it("matches LEVEL_THRESHOLDS table at each entry", () => {
    for (const t of LEVEL_THRESHOLDS) {
      assert.equal(levelForSP(t.minSP), t.level);
    }
  });
});

describe("spForNextLevel", () => {
  it("at L1 (0 SP): next=500, remaining=500, current=0", () => {
    assert.deepEqual(spForNextLevel(0), {
      next: 500,
      remaining: 500,
      currentLevelMinSP: 0,
    });
  });

  it("mid-L6 (20000 SP): next=25000, remaining=5000, current=15000", () => {
    assert.deepEqual(spForNextLevel(20000), {
      next: 25000,
      remaining: 5000,
      currentLevelMinSP: 15000,
    });
  });

  it("at L10 exactly (50000 SP): next=null, remaining=0, current=50000", () => {
    assert.deepEqual(spForNextLevel(50000), {
      next: null,
      remaining: 0,
      currentLevelMinSP: 50000,
    });
  });

  it("past L10 (1,000,000 SP): next=null, remaining=0", () => {
    assert.deepEqual(spForNextLevel(1_000_000), {
      next: null,
      remaining: 0,
      currentLevelMinSP: 50000,
    });
  });
});

describe("awardSPBreakdown", () => {
  it("solo_submit suspicious → base 50, multiplier 0.5, sp 25", () => {
    assert.deepEqual(
      awardSPBreakdown({ kind: "solo_submit", verdict: "suspicious" }),
      { base: 50, multiplier: 0.5, sp: 25 },
    );
  });

  it("duel_win implausible → base 100, multiplier 0, sp 0", () => {
    assert.deepEqual(
      awardSPBreakdown({ kind: "duel_win", verdict: "implausible" }),
      { base: 100, multiplier: 0, sp: 0 },
    );
  });

  it("tournament_rank_bonus rank 5 → sp 92, base 92, multiplier 1", () => {
    assert.deepEqual(
      awardSPBreakdown({ kind: "tournament_rank_bonus", rank: 5 }),
      { base: 92, multiplier: 1, sp: 92 },
    );
  });

  it("tournament_rank_bonus out-of-range → zeros", () => {
    assert.deepEqual(
      awardSPBreakdown({ kind: "tournament_rank_bonus", rank: 999 }),
      { base: 0, multiplier: 1, sp: 0 },
    );
  });
});
