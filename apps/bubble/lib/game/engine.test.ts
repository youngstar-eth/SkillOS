/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BALL_SPEED,
  BOARD_WIDTH,
  BUBBLE_RADIUS,
  COLORS,
  GRID_COLS,
  INITIAL_ROWS,
  MAX_AIM_ANGLE,
  calculateScore,
  createInitialState,
  findConnectedSameColor,
  findConnectedToTop,
  getNeighbors,
  gridToPixel,
  pixelToGrid,
  setAim,
  shoot,
  tick,
} from "./engine";
import type { Bubble, BubbleState } from "./types";

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function mkBubble(row: number, col: number, color: Bubble["color"]): Bubble {
  const { x, y } = gridToPixel(row, col);
  return { row, col, color, x, y };
}

function gridFrom(bubbles: Bubble[]): Map<string, Bubble> {
  const m = new Map<string, Bubble>();
  for (const b of bubbles) m.set(`${b.row},${b.col}`, b);
  return m;
}

// ---------- createInitialState ----------------------------------------
describe("createInitialState", () => {
  it("fills INITIAL_ROWS with correct parity-aware widths", () => {
    const s = createInitialState(1);
    // 5 rows, even=10 cols, odd=9 → 10+9+10+9+10 = 48
    const expected = 10 + 9 + 10 + 9 + 10;
    assert.equal(s.grid.size, expected);
    assert.equal(s.status, "aiming");
    assert.equal(s.score, 0);
    assert.ok(COLORS.includes(s.currentShooterColor));
  });

  it("deterministic for a given seed", () => {
    const a = createInitialState(77);
    const b = createInitialState(77);
    assert.equal(a.currentShooterColor, b.currentShooterColor);
    assert.equal(a.grid.size, b.grid.size);
  });
});

// ---------- grid ↔ pixel / neighbours ---------------------------------
describe("gridToPixel / pixelToGrid", () => {
  it("round-trip on valid cells", () => {
    for (const [r, c] of [
      [0, 0],
      [0, 9],
      [1, 0],
      [1, 8],
      [4, 5],
    ]) {
      const { x, y } = gridToPixel(r, c);
      const back = pixelToGrid(x, y);
      assert.equal(back.row, r);
      assert.equal(back.col, c);
    }
  });

  it("odd rows offset horizontally by BUBBLE_RADIUS", () => {
    const even = gridToPixel(0, 0).x;
    const odd = gridToPixel(1, 0).x;
    assert.ok(approx(odd - even, BUBBLE_RADIUS));
  });
});

describe("getNeighbors", () => {
  it("even row neighbour set", () => {
    const n = getNeighbors(2, 5); // even
    assert.deepEqual(n, [
      [1, 4],
      [1, 5],
      [2, 4],
      [2, 6],
      [3, 4],
      [3, 5],
    ]);
  });

  it("odd row neighbour set", () => {
    const n = getNeighbors(3, 5); // odd
    assert.deepEqual(n, [
      [2, 5],
      [2, 6],
      [3, 4],
      [3, 6],
      [4, 5],
      [4, 6],
    ]);
  });
});

// ---------- aim & shoot -----------------------------------------------
describe("setAim / shoot", () => {
  it("setAim clamps to ±MAX_AIM_ANGLE", () => {
    const s = createInitialState(1);
    assert.equal(setAim(s, 99).aimAngle, MAX_AIM_ANGLE);
    assert.equal(setAim(s, -99).aimAngle, -MAX_AIM_ANGLE);
  });

  it("shoot transitions aiming → flying with upward velocity", () => {
    const s = setAim(createInitialState(1), 0); // straight up
    const s1 = shoot(s);
    assert.equal(s1.status, "flying");
    assert.ok(s1.flying !== null);
    assert.ok(approx(s1.flying!.vx, 0));
    assert.ok(s1.flying!.vy < 0);
    assert.ok(approx(Math.abs(s1.flying!.vy), BALL_SPEED, 1e-3));
  });

  it("non-aiming shoot is a no-op", () => {
    const s: BubbleState = { ...createInitialState(1), status: "flying" };
    assert.deepEqual(shoot(s), s);
  });
});

// ---------- flying / wall bounce --------------------------------------
describe("tick: flying bubble walls", () => {
  it("bounces off left wall", () => {
    const s = shoot(setAim(createInitialState(1), -MAX_AIM_ANGLE));
    const pushed: BubbleState = {
      ...s,
      flying: { ...s.flying!, x: BUBBLE_RADIUS + 0.1, vx: -5, vy: -5 },
    };
    const next = tick(pushed, 16.666);
    assert.ok(next.flying!.vx > 0);
  });

  it("bounces off right wall", () => {
    const s = shoot(setAim(createInitialState(1), MAX_AIM_ANGLE));
    const pushed: BubbleState = {
      ...s,
      flying: {
        ...s.flying!,
        x: BOARD_WIDTH - BUBBLE_RADIUS - 0.1,
        vx: 5,
        vy: -5,
      },
    };
    const next = tick(pushed, 16.666);
    assert.ok(next.flying!.vx < 0);
  });
});

// ---------- attach ----------------------------------------------------
describe("attach via tick (top-wall stop)", () => {
  it("a bubble reaching the top attaches at row 0", () => {
    // Empty grid so attach lands at top without collision.
    const s: BubbleState = {
      ...createInitialState(1),
      grid: new Map(),
      status: "flying",
      flying: {
        x: 200,
        y: BUBBLE_RADIUS + 1,
        vx: 0,
        vy: -BALL_SPEED,
        color: "pink",
      },
    };
    const next = tick(s, 16.666);
    assert.equal(next.status, "aiming");
    assert.equal(next.flying, null);
    // One bubble added at row 0.
    const row0 = [...next.grid.values()].filter((b) => b.row === 0);
    assert.equal(row0.length, 1);
    assert.equal(row0[0].color, "pink");
  });
});

// ---------- connected same-colour -------------------------------------
describe("findConnectedSameColor", () => {
  it("finds a 3-ball cluster", () => {
    const grid = gridFrom([
      mkBubble(0, 0, "red"),
      mkBubble(0, 1, "red"),
      mkBubble(0, 2, "red"),
      mkBubble(0, 3, "blue"),
    ]);
    const m = findConnectedSameColor(grid, 0, 0, "red");
    assert.equal(m.size, 3);
    assert.ok(m.has("0,0"));
    assert.ok(m.has("0,1"));
    assert.ok(m.has("0,2"));
    assert.ok(!m.has("0,3"));
  });

  it("single bubble returns size 1", () => {
    const grid = gridFrom([mkBubble(0, 0, "red")]);
    const m = findConnectedSameColor(grid, 0, 0, "red");
    assert.equal(m.size, 1);
  });
});

// ---------- connected to top ------------------------------------------
describe("findConnectedToTop", () => {
  it("bubbles with no row-0 path are floating", () => {
    // Two columns of red, bottom pair disconnected.
    const grid = gridFrom([
      mkBubble(0, 0, "red"),
      // gap: (0,1) missing
      mkBubble(1, 0, "red"),
      // island at row 3
      mkBubble(3, 5, "blue"),
      mkBubble(3, 6, "blue"),
    ]);
    const connected = findConnectedToTop(grid);
    assert.ok(connected.has("0,0"));
    assert.ok(!connected.has("3,5"));
    assert.ok(!connected.has("3,6"));
  });
});

// ---------- resolveMatch via synthesized hit --------------------------
describe("resolve match (integration)", () => {
  it("three-bubble match pops them and rolls shooter colour", () => {
    // Seed (0,0) and (0,1) red. Fly ball from just below (0,1) so it
    // collides, snaps to neighbour (0,2), and completes the red triple.
    const base = createInitialState(1);
    const grid = gridFrom([
      mkBubble(0, 0, "red"),
      mkBubble(0, 1, "red"),
      mkBubble(1, 0, "blue"), // unrelated anchor, stays connected to top
    ]);
    // Ball midway between (0,1) and (0,2), drifting upward — collision
    // with (0,1) happens in one frame and attach lands at (0,2).
    const p1 = gridToPixel(0, 1);
    const s: BubbleState = {
      ...base,
      grid,
      status: "flying",
      currentShooterColor: "red",
      flying: {
        x: p1.x + BUBBLE_RADIUS, // 18 px right of (0,1)
        y: p1.y + 10,
        vx: 0,
        vy: -3,
        color: "red",
      },
    };
    const next = tick(s, 16.666);
    // Possible terminal states: "aiming" (blue still floating somewhere)
    // or "won" (drop cleared the board entirely).
    assert.ok(
      next.status === "aiming" || next.status === "won",
      `unexpected status ${next.status}`,
    );
    assert.ok(next.grid.size <= 1);
    assert.ok(next.score >= 30); // 3 × 10 pop bonus at minimum
    assert.ok(next.bubblesPopped >= 3);
    assert.equal(next.shotsFired, 1);
    assert.equal(next.currentShooterColor, base.nextShooterColor);
  });

  it("2-bubble would-be match does NOT pop", () => {
    const base = createInitialState(1);
    const grid = gridFrom([mkBubble(0, 0, "red")]);
    const p0 = gridToPixel(0, 0);
    const s: BubbleState = {
      ...base,
      grid,
      status: "flying",
      currentShooterColor: "red",
      flying: {
        x: p0.x + BUBBLE_RADIUS, // halfway to (0,1)
        y: p0.y + 10,
        vx: 0,
        vy: -3,
        color: "red",
      },
    };
    const next = tick(s, 16.666);
    // Ball attached; cluster of 2 reds is below the match threshold.
    assert.equal(next.grid.size, 2);
    assert.equal(next.score, 0);
  });
});

// ---------- calculateScore --------------------------------------------
describe("calculateScore", () => {
  it("score + maxCombo × 20", () => {
    const s: BubbleState = {
      ...createInitialState(1),
      score: 120,
      maxCombo: 7,
    };
    assert.equal(calculateScore(s), 120 + 7 * 20);
  });

  it("+500 win bonus", () => {
    const s: BubbleState = {
      ...createInitialState(1),
      score: 500,
      maxCombo: 5,
      status: "won",
    };
    assert.equal(calculateScore(s), 500 + 5 * 20 + 500);
  });
});

// Sanity — constants loaded.
describe("constants", () => {
  it("6 bubble colours", () => assert.equal(COLORS.length, 6));
  it("grid is 10 cols wide", () => assert.equal(GRID_COLS, 10));
  it("5 initial rows", () => assert.equal(INITIAL_ROWS, 5));
});
