/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Cell, GemColor, Match3State } from "./types";
import {
  areAdjacent,
  calculateScore,
  COLS,
  createInitialState,
  findMatches,
  INITIAL_MOVES,
  resolve,
  ROWS,
  swap,
} from "./engine";

function makeCell(color: GemColor | null, id = "x"): Cell {
  return { color, id };
}

/** Build a grid from a shorthand 8×8 color layout. Dots (".") = null. */
function gridFromPattern(rows: string[]): Cell[][] {
  const map: Record<string, GemColor | null> = {
    R: "red",
    Y: "yellow",
    G: "green",
    B: "blue",
    P: "purple",
    K: "pink",
    ".": null,
  };
  return rows.map((row, r) =>
    row.split("").map((ch, c) => makeCell(map[ch] ?? null, `${r}-${c}`)),
  );
}

function stateFromGrid(grid: Cell[][]): Match3State {
  return {
    grid,
    rows: grid.length,
    cols: grid[0].length,
    score: 0,
    movesLeft: INITIAL_MOVES,
    combo: 0,
    maxCombo: 0,
    totalMatches: 0,
    gemsPopped: 0,
    selected: null,
    status: "resolving",
    seed: 1,
    rng: 1,
  };
}

describe("createInitialState", () => {
  it("produces an 8x8 grid with no initial matches", () => {
    const s = createInitialState(42);
    assert.equal(s.grid.length, ROWS);
    assert.equal(s.grid[0].length, COLS);
    assert.equal(findMatches(s.grid).size, 0);
    assert.equal(s.score, 0);
    assert.equal(s.movesLeft, INITIAL_MOVES);
    assert.equal(s.status, "playing");
  });

  it("is deterministic given the same seed", () => {
    const a = createInitialState(12345);
    const b = createInitialState(12345);
    const flatten = (s: Match3State) =>
      s.grid.map((row) => row.map((c) => c.color).join(",")).join("|");
    assert.equal(flatten(a), flatten(b));
  });
});

describe("areAdjacent", () => {
  it("treats 4-directional neighbors as adjacent", () => {
    assert.equal(areAdjacent([0, 0], [0, 1]), true);
    assert.equal(areAdjacent([0, 0], [1, 0]), true);
    assert.equal(areAdjacent([2, 2], [2, 1]), true);
    assert.equal(areAdjacent([2, 2], [1, 2]), true);
  });

  it("rejects diagonals and distance > 1", () => {
    assert.equal(areAdjacent([0, 0], [1, 1]), false);
    assert.equal(areAdjacent([0, 0], [0, 2]), false);
    assert.equal(areAdjacent([0, 0], [0, 0]), false);
  });
});

describe("swap", () => {
  it("returns null for non-adjacent swaps", () => {
    const grid = gridFromPattern([
      "RRYRRRRR",
      "YYRYYYYY",
      "RRYRRRRR",
      "YYRYYYYY",
      "RRYRRRRR",
      "YYRYYYYY",
      "RRYRRRRR",
      "YYRYYYYY",
    ]);
    const s = { ...stateFromGrid(grid), status: "playing" as const };
    assert.equal(swap(s, [0, 0], [0, 2]), null);
  });

  it("returns null for adjacent swap that creates no match", () => {
    const grid = gridFromPattern([
      "RYRYRYRY",
      "YRYRYRYR",
      "RYRYRYRY",
      "YRYRYRYR",
      "RYRYRYRY",
      "YRYRYRYR",
      "RYRYRYRY",
      "YRYRYRYR",
    ]);
    const s = { ...stateFromGrid(grid), status: "playing" as const };
    assert.equal(swap(s, [0, 0], [0, 1]), null);
  });

  it("accepts an adjacent swap that creates a horizontal 3", () => {
    // Row 0: swap (0,2) and (0,3) → R R R Y Y Y Y Y makes 3 Rs + 3 Ys.
    const grid = gridFromPattern([
      "RRYRYYYY",
      "GBGBGBGB",
      "BGBGBGBG",
      "GBGBGBGB",
      "BGBGBGBG",
      "GBGBGBGB",
      "BGBGBGBG",
      "GBGBGBGB",
    ]);
    const s = { ...stateFromGrid(grid), status: "playing" as const };
    const next = swap(s, [0, 2], [0, 3]);
    assert.ok(next);
    assert.equal(next!.status, "resolving");
    assert.equal(next!.movesLeft, INITIAL_MOVES - 1);
  });
});

describe("findMatches", () => {
  it("detects a horizontal 3", () => {
    const grid = gridFromPattern([
      "RRRYGBPK",
      "YGBPKRYG",
      "BPKRYGBP",
      "PKRYGBPK",
      "KRYGBPKR",
      "RYGBPKRY",
      "YGBPKRYG",
      "GBPKRYGB",
    ]);
    const matches = findMatches(grid);
    assert.ok(matches.has("0,0"));
    assert.ok(matches.has("0,1"));
    assert.ok(matches.has("0,2"));
    assert.equal(matches.size, 3);
  });

  it("detects a horizontal 4 with four cells flagged", () => {
    const grid = gridFromPattern([
      "RRRRGBPK",
      "YGBPKRYG",
      "BPKRYGBP",
      "PKRYGBPK",
      "KRYGBPKR",
      "RYGBPKRY",
      "YGBPKRYG",
      "GBPKRYGB",
    ]);
    const matches = findMatches(grid);
    assert.equal(matches.size, 4);
    for (let c = 0; c < 4; c++) assert.ok(matches.has(`0,${c}`));
  });

  it("detects a vertical 3", () => {
    const grid = gridFromPattern([
      "RYGBPKRY",
      "RGBPKRYG",
      "RBPKRYGB",
      "YPKRYGBP",
      "GKRYGBPK",
      "BRYGBPKR",
      "PYGBPKRY",
      "KGBPKRYG",
    ]);
    const matches = findMatches(grid);
    assert.ok(matches.has("0,0"));
    assert.ok(matches.has("1,0"));
    assert.ok(matches.has("2,0"));
    assert.equal(matches.size, 3);
  });

  it("detects an L-shape as 5 flagged cells", () => {
    // Horizontal RRR at row 0 + Vertical RRR down column 0. Shared (0,0) = 5 cells.
    const grid = gridFromPattern([
      "RRRYGBPK",
      "RYGBPKRY",
      "RGBPKRYG",
      "PKRYGBPK",
      "KRYGBPKR",
      "RYGBPKRY",
      "YGBPKRYG",
      "GBPKRYGB",
    ]);
    const matches = findMatches(grid);
    assert.equal(matches.size, 5);
    assert.ok(matches.has("0,0"));
    assert.ok(matches.has("0,1"));
    assert.ok(matches.has("0,2"));
    assert.ok(matches.has("1,0"));
    assert.ok(matches.has("2,0"));
  });

  it("returns empty set when no match exists", () => {
    const grid = gridFromPattern([
      "RYRYRYRY",
      "YRYRYRYR",
      "RYRYRYRY",
      "YRYRYRYR",
      "RYRYRYRY",
      "YRYRYRYR",
      "RYRYRYRY",
      "YRYRYRYR",
    ]);
    assert.equal(findMatches(grid).size, 0);
  });
});

describe("resolve", () => {
  it("pops matched cells and scores them", () => {
    const grid = gridFromPattern([
      "RRRYGBPK",
      "YBGPKRYG",
      "BGPKRYGB",
      "PKRYGBPK",
      "KRYGBPKR",
      "YBGPKRYY",
      "GPKRYGBG",
      "BKRYGBPB",
    ]);
    const next = resolve(stateFromGrid(grid));
    // 3 matched cells on chain 1 → 3 × 10 × 1 = 30 score.
    assert.equal(next.score, 30);
    assert.equal(next.totalMatches, 3);
    assert.equal(next.gemsPopped, 3);
    // Board should contain no lingering matches after resolve.
    assert.equal(findMatches(next.grid).size, 0);
  });

  it("applies gravity so nulls end up at the top of each column", () => {
    // Single vertical column gravity check — three Rs at column 0 rows 0-2.
    const grid = gridFromPattern([
      "RYGBPKYG",
      "RBGPKRYG",
      "RGPKRYGB",
      "PKRYGBPK",
      "KRYGBPKR",
      "YBGPKRYY",
      "GPKRYGBG",
      "BKRYGBPB",
    ]);
    const baseRng = 99999;
    const state: Match3State = {
      ...stateFromGrid(grid),
      rng: baseRng,
    };
    const next = resolve(state);
    // Column 0: original remainder below the match was ["P","K","Y","G","B"].
    // After gravity these fall to rows 3..7 (bottom), and rows 0..2 get new spawns.
    assert.equal(next.grid[3][0].color, "purple");
    assert.equal(next.grid[4][0].color, "pink");
    assert.equal(next.grid[5][0].color, "yellow");
    assert.equal(next.grid[6][0].color, "green");
    assert.equal(next.grid[7][0].color, "blue");
  });

  it("spawns new gems for every emptied cell", () => {
    const grid = gridFromPattern([
      "RRRYGBPK",
      "YBGPKRYG",
      "BGPKRYGB",
      "PKRYGBPK",
      "KRYGBPKR",
      "YBGPKRYY",
      "GPKRYGBG",
      "BKRYGBPB",
    ]);
    const next = resolve(stateFromGrid(grid));
    // Every cell must be filled.
    for (let r = 0; r < next.rows; r++) {
      for (let c = 0; c < next.cols; c++) {
        assert.notEqual(next.grid[r][c].color, null);
      }
    }
  });

  it("chains cascading matches and tracks combo length", () => {
    // Column 0 is [Y,R,R,R,Y,Y,G,B] — vertical RRR at rows 1-3 pops first.
    // After gravity col 0 becomes [new,new,new,Y,Y,Y,G,B] creating a second
    // vertical YYY match at rows 3-5 → combo reaches 2 regardless of spawns.
    const grid = gridFromPattern([
      "YGBPKRYB",
      "RYBGKRGP",
      "RBYKGPRY",
      "RYGBPKYR",
      "YBPGRYBG",
      "YGKRYBPK",
      "GPRYBKGY",
      "BKYBGRPK",
    ]);
    const next = resolve(stateFromGrid(grid));
    assert.ok(next.maxCombo >= 2, `expected cascade, got ${next.maxCombo}`);
    assert.ok(next.totalMatches >= 6);
  });

  it("combo resets to 0 once resolve finishes", () => {
    const grid = gridFromPattern([
      "RRRYGBPK",
      "YBGPKRYG",
      "BGPKRYGB",
      "PKRYGBPK",
      "KRYGBPKR",
      "YBGPKRYY",
      "GPKRYGBG",
      "BKRYGBPB",
    ]);
    const next = resolve(stateFromGrid(grid));
    assert.equal(next.combo, 0);
    // But maxCombo should remain recorded.
    assert.ok(next.maxCombo >= 1);
  });
});

describe("movesLeft + gameOver", () => {
  it("decrements movesLeft on a valid swap", () => {
    const grid = gridFromPattern([
      "RRYRYYYY",
      "GBGBGBGB",
      "BGBGBGBG",
      "GBGBGBGB",
      "BGBGBGBG",
      "GBGBGBGB",
      "BGBGBGBG",
      "GBGBGBGB",
    ]);
    const s = { ...stateFromGrid(grid), status: "playing" as const };
    const next = swap(s, [0, 2], [0, 3]);
    assert.ok(next);
    assert.equal(next!.movesLeft, INITIAL_MOVES - 1);
  });

  it("flips status to gameOver when movesLeft reaches 0 after resolve", () => {
    const grid = gridFromPattern([
      "RRRYGBPK",
      "YBGPKRYG",
      "BGPKRYGB",
      "PKRYGBPK",
      "KRYGBPKR",
      "YBGPKRYY",
      "GPKRYGBG",
      "BKRYGBPB",
    ]);
    const s: Match3State = {
      ...stateFromGrid(grid),
      movesLeft: 0,
      status: "resolving",
    };
    const next = resolve(s);
    assert.equal(next.status, "gameOver");
  });
});

describe("calculateScore", () => {
  it("adds a bonus of 50 per point of maxCombo", () => {
    const s: Match3State = {
      ...stateFromGrid(gridFromPattern([
        "RYGBPKRY",
        "YGBPKRYG",
        "GBPKRYGB",
        "BPKRYGBP",
        "PKRYGBPK",
        "KRYGBPKR",
        "RYGBPKRY",
        "YGBPKRYG",
      ])),
      score: 120,
      maxCombo: 3,
      status: "gameOver",
    };
    assert.equal(calculateScore(s), 120 + 3 * 50);
  });
});
