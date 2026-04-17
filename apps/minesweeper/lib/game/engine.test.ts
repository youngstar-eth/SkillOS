/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTY,
  calculateScore,
  createEmptyBoard,
  createInitialState,
  placeMines,
  reveal,
  toggleFlag,
} from "./engine";
import type { Cell, MinesweeperState } from "./types";

// -------- helpers --------
const countMines = (board: Cell[][]) =>
  board.reduce((n, row) => n + row.filter((c) => c.isMine).length, 0);

const countRevealed = (board: Cell[][]) =>
  board.reduce(
    (n, row) => n + row.filter((c) => c.state === "revealed").length,
    0,
  );

/** Build a test board with mines placed at the given coords (no flood/etc). */
function seededBoard(
  rows: number,
  cols: number,
  mines: Array<[number, number]>,
): Cell[][] {
  const b = createEmptyBoard(rows, cols);
  for (const [r, c] of mines) b[r][c].isMine = true;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (b[r][c].isMine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && b[nr][nc].isMine) n++;
        }
      }
      b[r][c].adjacentMines = n;
    }
  }
  return b;
}

// -------- createInitialState --------
describe("createInitialState", () => {
  it("beginner preset: 9×9 / 10 mines / ready", () => {
    const s = createInitialState("beginner", 0);
    assert.equal(s.rows, 9);
    assert.equal(s.cols, 9);
    assert.equal(s.mineCount, 10);
    assert.equal(s.status, "ready");
    assert.equal(s.flagCount, 0);
    assert.equal(s.revealedCount, 0);
    assert.equal(s.startedAt, null);
    assert.equal(s.board.length, 9);
    assert.equal(s.board[0].length, 9);
    // no mines placed yet
    assert.equal(countMines(s.board), 0);
  });

  it("intermediate preset: 16×16 / 40 mines", () => {
    const s = createInitialState("intermediate", 0);
    assert.equal(s.rows, 16);
    assert.equal(s.mineCount, 40);
    assert.equal(s.difficulty, "intermediate");
  });
});

// -------- placeMines --------
describe("placeMines", () => {
  it("places exactly mineCount mines", () => {
    const board = createEmptyBoard(9, 9);
    const out = placeMines(board, 9, 9, 10, 123, 4, 4);
    assert.equal(countMines(out), 10);
  });

  it("respects the 3×3 safe zone around the first click", () => {
    const board = createEmptyBoard(9, 9);
    const out = placeMines(board, 9, 9, 10, 42, 4, 4);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        assert.equal(
          out[4 + dr][4 + dc].isMine,
          false,
          `safe-zone cell (${4 + dr},${4 + dc}) is a mine`,
        );
      }
    }
  });

  it("places mineCount even when seed is pathological (fallback path)", () => {
    // A seed producing many collisions still fills to mineCount via
    // the linear-scan fallback.
    const board = createEmptyBoard(5, 5);
    // Leave a 3×3 safe zone (9 cells) → 25 - 9 = 16 available, pack 15 mines.
    const out = placeMines(board, 5, 5, 15, 0, 2, 2);
    assert.equal(countMines(out), 15);
  });

  it("correctly computes adjacentMines on a known layout", () => {
    // Mines at (0,0), (0,2). Check the row-0/1 counts.
    const b = seededBoard(3, 3, [
      [0, 0],
      [0, 2],
    ]);
    assert.equal(b[0][1].adjacentMines, 2); // between the two mines
    assert.equal(b[1][0].adjacentMines, 1);
    assert.equal(b[1][1].adjacentMines, 2);
    assert.equal(b[1][2].adjacentMines, 1);
    assert.equal(b[2][1].adjacentMines, 0);
  });
});

// -------- reveal --------
describe("reveal", () => {
  it("first click transitions ready → playing and stamps startedAt", () => {
    const s0 = createInitialState("beginner", 7);
    const s1 = reveal(s0, 4, 4);
    assert.equal(s1.status !== "ready", true);
    assert.ok(s1.startedAt !== null);
    // At least one cell revealed.
    assert.ok(countRevealed(s1.board) >= 1);
  });

  it("stepping on a mine reveals every mine and flips to lost", () => {
    const s0: MinesweeperState = {
      ...createInitialState("beginner", 0),
      status: "playing",
      board: seededBoard(3, 3, [
        [0, 0],
        [2, 2],
      ]),
      rows: 3,
      cols: 3,
      mineCount: 2,
      startedAt: 1,
    };
    const s1 = reveal(s0, 0, 0);
    assert.equal(s1.status, "lost");
    assert.equal(s1.board[0][0].state, "revealed");
    assert.equal(s1.board[2][2].state, "revealed");
  });

  it("flood fills zero-adjacency region", () => {
    // 3×3 board, mine only at (2,2). Clicking (0,0) (adjacency 0 all the
    // way to (1,1)) reveals all 8 non-mine cells.
    const s0: MinesweeperState = {
      ...createInitialState("beginner", 0),
      status: "playing",
      board: seededBoard(3, 3, [[2, 2]]),
      rows: 3,
      cols: 3,
      mineCount: 1,
      startedAt: 1,
    };
    const s1 = reveal(s0, 0, 0);
    assert.equal(s1.status, "won");
    assert.equal(countRevealed(s1.board), 8);
    assert.equal(s1.board[2][2].state, "hidden"); // mine stays hidden
  });

  it("does not reveal a flagged cell", () => {
    let s = createInitialState("beginner", 0);
    s = reveal(s, 4, 4); // start game
    // Flag a different hidden cell
    const victim: [number, number] = s.board[0][0].state === "hidden" ? [0, 0] : [0, 8];
    s = toggleFlag(s, victim[0], victim[1]);
    assert.equal(s.board[victim[0]][victim[1]].state, "flagged");
    const before = countRevealed(s.board);
    const after = reveal(s, victim[0], victim[1]);
    assert.equal(countRevealed(after.board), before); // unchanged
  });

  it("clicking an already-revealed cell is a no-op", () => {
    const s0: MinesweeperState = {
      ...createInitialState("beginner", 0),
      status: "playing",
      board: seededBoard(3, 3, [[2, 2]]),
      rows: 3,
      cols: 3,
      mineCount: 1,
      startedAt: 1,
    };
    const s1 = reveal(s0, 0, 0); // flood
    const s2 = reveal(s1, 0, 0);
    assert.equal(s2.revealedCount, s1.revealedCount);
  });

  it("won / lost states are terminal", () => {
    const s: MinesweeperState = {
      ...createInitialState("beginner", 0),
      status: "lost",
    };
    assert.deepEqual(reveal(s, 0, 0), s);
  });
});

// -------- toggleFlag --------
describe("toggleFlag", () => {
  it("cycles hidden → flagged → question → hidden", () => {
    let s = createInitialState("beginner", 0);
    s = toggleFlag(s, 0, 0);
    assert.equal(s.board[0][0].state, "flagged");
    assert.equal(s.flagCount, 1);
    s = toggleFlag(s, 0, 0);
    assert.equal(s.board[0][0].state, "question");
    assert.equal(s.flagCount, 0);
    s = toggleFlag(s, 0, 0);
    assert.equal(s.board[0][0].state, "hidden");
    assert.equal(s.flagCount, 0);
  });

  it("revealed cells are immune", () => {
    const s0: MinesweeperState = {
      ...createInitialState("beginner", 0),
      status: "playing",
      board: seededBoard(3, 3, [[2, 2]]),
      rows: 3,
      cols: 3,
      mineCount: 1,
      startedAt: 1,
    };
    const s1 = reveal(s0, 0, 0); // flood-reveals (0,0)
    const s2 = toggleFlag(s1, 0, 0);
    assert.equal(s2.board[0][0].state, "revealed");
  });
});

// -------- calculateScore --------
describe("calculateScore", () => {
  it("non-wins score zero", () => {
    const s = createInitialState("beginner", 0);
    assert.equal(calculateScore(s, 60_000), 0); // status = ready
    assert.equal(calculateScore({ ...s, status: "lost" }, 60_000), 0);
    assert.equal(calculateScore({ ...s, status: "playing" }, 60_000), 0);
  });

  it("win: 10000 base minus 10 per second", () => {
    const s = { ...createInitialState("beginner", 0), status: "won" as const };
    assert.equal(calculateScore(s, 0), 10_000);
    assert.equal(calculateScore(s, 10_000), 9_900); // 10s
    assert.equal(calculateScore(s, 60_000), 9_400); // 60s
  });

  it("floors at 1000 on slow wins", () => {
    const s = { ...createInitialState("beginner", 0), status: "won" as const };
    assert.equal(calculateScore(s, 15 * 60 * 1000), 1_000); // 15min
  });
});

// -------- preset sanity --------
describe("DIFFICULTY presets", () => {
  it("beginner is 9×9/10", () => {
    assert.deepEqual(DIFFICULTY.beginner, { rows: 9, cols: 9, mines: 10 });
  });
  it("intermediate is 16×16/40", () => {
    assert.deepEqual(DIFFICULTY.intermediate, { rows: 16, cols: 16, mines: 40 });
  });
});
