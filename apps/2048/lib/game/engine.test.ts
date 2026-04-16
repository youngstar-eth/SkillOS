/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyGrid,
  hasWon,
  isGameOver,
  maxTile,
  move,
  spawnTile,
} from "./engine";
import type { Grid } from "./types";

/** Build a 4x4 grid from a flat array of 16 values (null or number). */
function g(cells: Array<number | null>): Grid {
  const grid = createEmptyGrid();
  for (let i = 0; i < 16; i++) grid[Math.floor(i / 4)][i % 4] = cells[i];
  return grid;
}

/** Make a single row into a 4x4 grid with that row on top, rest empty. */
function rowOnly(row: Array<number | null>): Grid {
  return g([...row, null, null, null, null, null, null, null, null, null, null, null, null]);
}

describe("move — left", () => {
  it("[2,2,null,null] → [4,null,null,null], score=4", () => {
    const r = move(rowOnly([2, 2, null, null]), "left");
    assert.deepEqual(r.grid[0], [4, null, null, null]);
    assert.equal(r.score, 4);
    assert.equal(r.moved, true);
  });

  it("[2,2,2,2] → [4,4,null,null], score=8 (two merges, no chain)", () => {
    const r = move(rowOnly([2, 2, 2, 2]), "left");
    assert.deepEqual(r.grid[0], [4, 4, null, null]);
    assert.equal(r.score, 8);
  });

  it("[2,null,2,2] → [4,2,null,null], score=4", () => {
    const r = move(rowOnly([2, null, 2, 2]), "left");
    assert.deepEqual(r.grid[0], [4, 2, null, null]);
    assert.equal(r.score, 4);
  });

  it("[4,4,8,8] → [8,16,null,null], score=24", () => {
    const r = move(rowOnly([4, 4, 8, 8]), "left");
    assert.deepEqual(r.grid[0], [8, 16, null, null]);
    assert.equal(r.score, 24);
  });

  it("[2,4,2,4] stays put, moved=false", () => {
    const r = move(rowOnly([2, 4, 2, 4]), "left");
    assert.deepEqual(r.grid[0], [2, 4, 2, 4]);
    assert.equal(r.moved, false);
    assert.equal(r.score, 0);
  });

  it("merge does not chain: [4,4,8] → [8,8,null], not [16]", () => {
    const r = move(rowOnly([4, 4, 8, null]), "left");
    assert.deepEqual(r.grid[0], [8, 8, null, null]);
    assert.equal(r.score, 8);
  });
});

describe("move — right / up / down all derive from left", () => {
  it("right: [null,null,2,2] → [null,null,null,4]", () => {
    const r = move(rowOnly([null, null, 2, 2]), "right");
    assert.deepEqual(r.grid[0], [null, null, null, 4]);
    assert.equal(r.moved, true);
  });

  it("up: column [2,2,null,null] → [4,null,null,null] at top", () => {
    const grid = g([
      2, null, null, null,
      2, null, null, null,
      null, null, null, null,
      null, null, null, null,
    ]);
    const r = move(grid, "up");
    assert.equal(r.grid[0][0], 4);
    assert.equal(r.grid[1][0], null);
  });

  it("down: column [null,null,2,2] → [null,null,null,4]", () => {
    const grid = g([
      null, null, null, null,
      null, null, null, null,
      2, null, null, null,
      2, null, null, null,
    ]);
    const r = move(grid, "down");
    assert.equal(r.grid[3][0], 4);
    assert.equal(r.grid[2][0], null);
  });
});

describe("isGameOver", () => {
  it("empty grid is not over", () => {
    assert.equal(isGameOver(createEmptyGrid()), false);
  });

  it("full grid with a possible merge is not over", () => {
    const grid = g([
      2, 4, 8, 16,
      4, 2, 4, 8,
      2, 4, 8, 16,
      4, 2, 4, 8, // 8 & 8 share a vertical boundary with row above
    ]);
    // Actually make a definite horizontal merge — set last two cells equal.
    grid[3][2] = 16;
    grid[3][3] = 16;
    assert.equal(isGameOver(grid), false);
  });

  it("full grid with no possible merge is over", () => {
    const grid = g([
      2, 4, 2, 4,
      4, 2, 4, 2,
      2, 4, 2, 4,
      4, 2, 4, 2,
    ]);
    assert.equal(isGameOver(grid), true);
  });
});

describe("hasWon + maxTile", () => {
  it("grid containing 2048 → hasWon=true", () => {
    const grid = createEmptyGrid();
    grid[1][2] = 2048;
    assert.equal(hasWon(grid), true);
    assert.equal(maxTile(grid), 2048);
  });

  it("grid under 2048 → hasWon=false", () => {
    const grid = createEmptyGrid();
    grid[0][0] = 1024;
    assert.equal(hasWon(grid), false);
    assert.equal(maxTile(grid), 1024);
  });
});

describe("spawnTile", () => {
  it("adds exactly one tile when space is available", () => {
    const before = createEmptyGrid();
    const after = spawnTile(before);
    let countBefore = 0, countAfter = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (before[r][c] !== null) countBefore++;
      if (after[r][c] !== null) countAfter++;
    }
    assert.equal(countAfter - countBefore, 1);
  });

  it("no-op when grid is full", () => {
    const grid = g([
      2, 4, 2, 4,
      4, 2, 4, 2,
      2, 4, 2, 4,
      4, 2, 4, 2,
    ]);
    const after = spawnTile(grid);
    assert.deepEqual(after, grid);
  });

  it("uses deterministic RNG for testability", () => {
    // seeded rng: always 0 → always picks first empty cell + value 2
    const rng = () => 0;
    const grid = createEmptyGrid();
    const after = spawnTile(grid, rng);
    assert.equal(after[0][0], 2);
  });
});
