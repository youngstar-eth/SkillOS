/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_SIZE,
  DIFFICULTY_REMOVE,
  calculateScore,
  createInitialState,
  createPuzzle,
  generateSolution,
  getConflicts,
  getHint,
  isComplete,
  matchesSolution,
  setCellValue,
  toggleNote,
} from "./engine";
import type { SudokuCell } from "./types";

// ---------- helpers -----------------------------------------------------

const sortedDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function solutionToCells(sol: number[][]): SudokuCell[][] {
  return sol.map((row) =>
    row.map((v) => ({
      value: v,
      isGiven: false,
      notes: new Set<number>(),
    })),
  );
}

// ---------- generateSolution -------------------------------------------
describe("generateSolution", () => {
  const sol = generateSolution(42);

  it("produces a 9×9 grid of digits 1–9", () => {
    assert.equal(sol.length, 9);
    for (const row of sol) {
      assert.equal(row.length, 9);
      for (const v of row) {
        assert.ok(v >= 1 && v <= 9, `got ${v}`);
      }
    }
  });

  it("every row contains exactly 1–9", () => {
    for (const row of sol) {
      assert.deepEqual([...row].sort((a, b) => a - b), sortedDigits);
    }
  });

  it("every column contains exactly 1–9", () => {
    for (let c = 0; c < 9; c++) {
      const col = sol.map((r) => r[c]).sort((a, b) => a - b);
      assert.deepEqual(col, sortedDigits);
    }
  });

  it("every 3×3 box contains exactly 1–9", () => {
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const vals: number[] = [];
        for (let r = br * 3; r < br * 3 + 3; r++) {
          for (let c = bc * 3; c < bc * 3 + 3; c++) {
            vals.push(sol[r][c]);
          }
        }
        assert.deepEqual(vals.sort((a, b) => a - b), sortedDigits);
      }
    }
  });

  it("is deterministic for a given seed", () => {
    assert.deepEqual(generateSolution(123), generateSolution(123));
    assert.deepEqual(generateSolution(1), generateSolution(1));
  });

  it("different seeds produce different grids (statistical)", () => {
    const a = generateSolution(1);
    const b = generateSolution(2);
    // Very unlikely to be identical — check any cell differs.
    let differs = false;
    for (let r = 0; r < 9 && !differs; r++) {
      for (let c = 0; c < 9 && !differs; c++) {
        if (a[r][c] !== b[r][c]) differs = true;
      }
    }
    assert.ok(differs, "expected seed 1 and 2 to produce different grids");
  });
});

// ---------- createPuzzle -----------------------------------------------
describe("createPuzzle", () => {
  const sol = generateSolution(99);

  it("removes the correct number of cells per difficulty", () => {
    for (const diff of ["easy", "medium", "hard"] as const) {
      const p = createPuzzle(sol, diff, 99);
      let empties = 0;
      for (const row of p) for (const v of row) if (v === null) empties++;
      assert.equal(empties, DIFFICULTY_REMOVE[diff]);
    }
  });

  it("non-null cells match the solution exactly", () => {
    const p = createPuzzle(sol, "medium", 99);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (p[r][c] !== null) assert.equal(p[r][c], sol[r][c]);
      }
    }
  });

  it("is deterministic for a given (solution, difficulty, seed)", () => {
    const a = createPuzzle(sol, "easy", 7);
    const b = createPuzzle(sol, "easy", 7);
    assert.deepEqual(a, b);
  });
});

// ---------- createInitialState -----------------------------------------
describe("createInitialState", () => {
  it("marks `isGiven` correctly for clue cells only", () => {
    const s = createInitialState("easy", 13);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = s.grid[r][c];
        assert.equal(cell.isGiven, cell.value !== null);
      }
    }
  });

  it("status starts as playing with empty notes", () => {
    const s = createInitialState("easy", 0);
    assert.equal(s.status, "playing");
    for (const row of s.grid) {
      for (const c of row) {
        assert.equal(c.notes.size, 0);
      }
    }
  });
});

// ---------- setCellValue -----------------------------------------------
describe("setCellValue", () => {
  it("given cells are immune", () => {
    const s = createInitialState("easy", 1);
    // Find a given cell.
    let gr = -1;
    let gc = -1;
    outer: for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (s.grid[r][c].isGiven) {
          gr = r;
          gc = c;
          break outer;
        }
      }
    }
    const next = setCellValue(s, gr, gc, 1);
    assert.equal(next.grid[gr][gc].value, s.grid[gr][gc].value);
  });

  it("wrong value increments errorsCount", () => {
    const s = createInitialState("easy", 2);
    // Find a non-given empty cell; wrong value = (solution+1) mod 9 +1
    let er = -1;
    let ec = -1;
    outer: for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!s.grid[r][c].isGiven) {
          er = r;
          ec = c;
          break outer;
        }
      }
    }
    const wrong = ((s.solution[er][ec] % 9) + 1); // always != solution
    const next = setCellValue(s, er, ec, wrong);
    assert.equal(next.errorsCount, 1);
    assert.equal(next.grid[er][ec].value, wrong);
  });

  it("completing with correct values transitions to solved", () => {
    const s0 = createInitialState("easy", 3);
    let s = s0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!s.grid[r][c].isGiven) {
          s = setCellValue(s, r, c, s.solution[r][c]);
        }
      }
    }
    assert.equal(s.status, "solved");
    assert.equal(s.errorsCount, 0);
  });

  it("clearing with null resets the cell", () => {
    const s0 = createInitialState("easy", 4);
    // Find empty non-given cell.
    let er = -1, ec = -1;
    outer: for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!s0.grid[r][c].isGiven) {
          er = r; ec = c; break outer;
        }
      }
    }
    const s1 = setCellValue(s0, er, ec, 5);
    const s2 = setCellValue(s1, er, ec, null);
    assert.equal(s2.grid[er][ec].value, null);
  });
});

// ---------- toggleNote --------------------------------------------------
describe("toggleNote", () => {
  it("adds and removes notes on an empty non-given cell", () => {
    const s0 = createInitialState("easy", 5);
    let er = -1, ec = -1;
    outer: for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!s0.grid[r][c].isGiven) { er = r; ec = c; break outer; }
      }
    }
    const s1 = toggleNote(s0, er, ec, 3);
    assert.ok(s1.grid[er][ec].notes.has(3));
    const s2 = toggleNote(s1, er, ec, 3);
    assert.ok(!s2.grid[er][ec].notes.has(3));
  });

  it("no-op on a given cell", () => {
    const s0 = createInitialState("easy", 6);
    let gr = -1, gc = -1;
    outer: for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (s0.grid[r][c].isGiven) { gr = r; gc = c; break outer; }
      }
    }
    const s1 = toggleNote(s0, gr, gc, 5);
    assert.equal(s1.grid[gr][gc].notes.size, 0);
  });
});

// ---------- getHint -----------------------------------------------------
describe("getHint", () => {
  it("fills the first empty cell with the correct value and bumps hintsUsed", () => {
    const s0 = createInitialState("easy", 9);
    const s1 = getHint(s0);
    assert.equal(s1.hintsUsed, 1);
    // Find the first empty cell in s0; it should now be filled in s1.
    outer: for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (s0.grid[r][c].value === null) {
          assert.equal(s1.grid[r][c].value, s0.solution[r][c]);
          break outer;
        }
      }
    }
  });

  it("no-op once solved", () => {
    const s = { ...createInitialState("easy", 10), status: "solved" as const };
    assert.deepEqual(getHint(s), s);
  });
});

// ---------- isComplete / matchesSolution --------------------------------
describe("isComplete / matchesSolution", () => {
  it("isComplete: false when any cell is null", () => {
    const s = createInitialState("easy", 11);
    assert.equal(isComplete(s.grid), false);
  });

  it("matchesSolution: full-solution grid matches itself", () => {
    const sol = generateSolution(12);
    assert.equal(matchesSolution(solutionToCells(sol), sol), true);
  });

  it("matchesSolution: single flipped cell fails", () => {
    const sol = generateSolution(13);
    const cells = solutionToCells(sol);
    cells[0][0].value = (sol[0][0] % 9) + 1;
    assert.equal(matchesSolution(cells, sol), false);
  });
});

// ---------- getConflicts ------------------------------------------------
describe("getConflicts", () => {
  it("no conflicts on a valid complete solution", () => {
    const sol = generateSolution(14);
    const conflicts = getConflicts(solutionToCells(sol));
    assert.equal(conflicts.size, 0);
  });

  it("flags a row collision", () => {
    const sol = generateSolution(15);
    const cells = solutionToCells(sol);
    // Force (0,0) and (0,1) to the same value.
    cells[0][0].value = 5;
    cells[0][1].value = 5;
    const conflicts = getConflicts(cells);
    assert.ok(conflicts.has("0,0"));
    assert.ok(conflicts.has("0,1"));
  });

  it("flags a column collision", () => {
    const sol = generateSolution(16);
    const cells = solutionToCells(sol);
    cells[0][0].value = 7;
    cells[1][0].value = 7;
    const conflicts = getConflicts(cells);
    assert.ok(conflicts.has("0,0"));
    assert.ok(conflicts.has("1,0"));
  });

  it("flags a 3×3 box collision", () => {
    const sol = generateSolution(17);
    const cells = solutionToCells(sol);
    cells[0][0].value = 3;
    cells[1][1].value = 3;
    const conflicts = getConflicts(cells);
    assert.ok(conflicts.has("0,0"));
    assert.ok(conflicts.has("1,1"));
  });
});

// ---------- calculateScore ----------------------------------------------
describe("calculateScore", () => {
  it("returns 0 when not solved", () => {
    const s = createInitialState("easy", 20);
    assert.equal(calculateScore(s, 60_000), 0);
  });

  it("easy solved: 5000 base minus penalties, floored at 1000", () => {
    const s = { ...createInitialState("easy", 21), status: "solved" as const };
    // 1s elapsed, no hints / errors → 5000 - 1 = 4999
    assert.equal(calculateScore(s, 1_000), 4999);
    // Massive penalty triggers floor.
    const slow = { ...s, hintsUsed: 100 };
    assert.equal(calculateScore(slow, 10_000), 1_000);
  });

  it("difficulty multiplier scales base", () => {
    const medium = {
      ...createInitialState("medium", 22),
      status: "solved" as const,
    };
    const hard = {
      ...createInitialState("hard", 22),
      status: "solved" as const,
    };
    // At 0 duration, base is 5000 × multiplier.
    assert.equal(calculateScore(medium, 0), 10_000);
    assert.equal(calculateScore(hard, 0), 20_000);
  });
});

// ---------- BOARD_SIZE sanity ------------------------------------------
describe("BOARD_SIZE", () => {
  it("is 9", () => {
    assert.equal(BOARD_SIZE, 9);
  });
});
