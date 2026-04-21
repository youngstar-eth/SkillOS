// ───────────────────────────────────────────────────────────────────────────
// Sudoku engine — adapted from the legacy main-branch implementation.
//
// Key differences from legacy:
//   1. Seed input is a bytes32 hex string (match row). FNV-1a folded to
//      uint32 via `numberFromSeed`, matching the pattern in
//      apps/2048/src/lib/game2048.ts and apps/wordle/src/lib/wordle/engine.ts.
//   2. Single difficulty (`DUEL_REMOVE = 40` → 41 clues remain). Legacy
//      supported easy/medium/hard; for a 2-minute competitive duel we
//      hardcode one tier so both players always face equally-shaped puzzles.
//   3. Scoring is `countCorrect(state)` — count of cells currently matching
//      the solution, including givens. Range 41 (initial) → 81 (solved).
//      See the `countCorrect` docstring for the full rationale.
//   4. Notes (pencil marks) and hints removed — 2 minutes is too short for
//      either to be useful, and hints muddy the score formula.
// ───────────────────────────────────────────────────────────────────────────

import { BOARD_SIZE, type SudokuCell, type SudokuState } from "./types";

export { BOARD_SIZE };

// ─── Seeded RNG & shuffle ─────────────────────────────────────────────────

/**
 * Deterministic 32-bit RNG based on Knuth's multiplicative hash. Given the
 * same seed, produces the same sequence forever — required so both duelists
 * receive the same puzzle.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1; // guard against zero seed locking the sequence
  return () => {
    state = Math.imul(state, 2654435761) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * FNV-1a folding of the bytes32 seed to a uint32, matching the family of
 * hashes used in the 2048 and Wordle engines. `numberFromSeed` is what
 * turns a match-row seed into the 32-bit integer the puzzle generator
 * expects.
 */
export function numberFromSeed(seed: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

// ─── Solution generator ───────────────────────────────────────────────────

/**
 * Generate a complete 9×9 sudoku grid using randomised backtracking.
 * Randomness sourced from `seededRandom(seed)` so every duel with the same
 * seed produces the same solution.
 */
export function generateSolution(seed: number): number[][] {
  const grid: number[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(0),
  );
  const rand = seededRandom(seed);

  function isValid(row: number, col: number, num: number): boolean {
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (grid[row][i] === num) return false;
      if (grid[i][col] === num) return false;
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (grid[r][c] === num) return false;
      }
    }
    return true;
  }

  function fill(idx: number): boolean {
    if (idx === BOARD_SIZE * BOARD_SIZE) return true;
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
    for (const n of nums) {
      if (isValid(row, col, n)) {
        grid[row][col] = n;
        if (fill(idx + 1)) return true;
        grid[row][col] = 0;
      }
    }
    return false;
  }

  fill(0);
  return grid;
}

// ─── Puzzle maker ─────────────────────────────────────────────────────────

/** Cells removed from the solution to produce the puzzle. 40 → 41 clues. */
export const DUEL_REMOVE = 40;

/**
 * Remove `DUEL_REMOVE` cells from a complete solution to build the puzzle.
 * Uniqueness of solution is NOT enforced — legacy implementation punted on
 * that for speed, and so do we. At 41 clues most randomised removals yield
 * a unique or near-unique puzzle; a duel is about progress against the
 * clock, not proofs of uniqueness.
 */
export function createPuzzle(
  solution: number[][],
  seed: number,
): (number | null)[][] {
  const rand = seededRandom(seed + 1);
  const puzzle = solution.map((row) => row.map((v) => v as number | null));

  const positions: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) positions.push([r, c]);
  }
  const shuffled = shuffle(positions, rand);

  for (let i = 0; i < DUEL_REMOVE; i++) {
    const [r, c] = shuffled[i];
    puzzle[r][c] = null;
  }

  return puzzle;
}

// ─── State constructors & mutators ────────────────────────────────────────

export function createInitialState(seed: string): SudokuState {
  const seedNum = numberFromSeed(seed);
  const solution = generateSolution(seedNum);
  const puzzle = createPuzzle(solution, seedNum);
  const grid: SudokuCell[][] = puzzle.map((row) =>
    row.map((v) => ({
      value: v,
      isGiven: v !== null,
    })),
  );
  return {
    grid,
    solution,
    puzzle: puzzle.map((r) => [...r]),
    startedAt: Date.now(),
    status: "playing",
    selectedCell: null,
  };
}

function cloneGrid(grid: SudokuCell[][]): SudokuCell[][] {
  return grid.map((row) => row.map((c) => ({ ...c })));
}

export function selectCell(
  state: SudokuState,
  row: number,
  col: number,
): SudokuState {
  return { ...state, selectedCell: [row, col] };
}

/**
 * Place a digit or clear a cell. `isGiven` cells are immune. Wrong values
 * are still placed (the board paints them red via `getConflicts`), so the
 * player can see and fix their own mistakes. When a placement completes a
 * fully-correct grid, the state flips to "solved".
 */
export function setCellValue(
  state: SudokuState,
  row: number,
  col: number,
  value: number | null,
): SudokuState {
  if (state.status !== "playing") return state;
  const cell = state.grid[row][col];
  if (cell.isGiven) return state;

  const newGrid = cloneGrid(state.grid);
  newGrid[row][col] = { ...newGrid[row][col], value };

  const solved =
    isComplete(newGrid) && matchesSolution(newGrid, state.solution);

  return {
    ...state,
    grid: newGrid,
    status: solved ? "solved" : "playing",
  };
}

// ─── Predicates ───────────────────────────────────────────────────────────

export function isComplete(grid: SudokuCell[][]): boolean {
  for (const row of grid) {
    for (const cell of row) {
      if (cell.value === null) return false;
    }
  }
  return true;
}

export function matchesSolution(
  grid: SudokuCell[][],
  solution: number[][],
): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (grid[r][c].value !== solution[r][c]) return false;
    }
  }
  return true;
}

/**
 * Set of `"row,col"` keys that participate in a row/column/box collision.
 * Used to paint conflicting cells red. Empty cells are ignored. Note that
 * a cell with a WRONG value against the solution may not be flagged here
 * if no peer cell has the same value yet — `getConflicts` checks duplicate
 * placement, not correctness against the solution.
 */
export function getConflicts(grid: SudokuCell[][]): Set<string> {
  const conflicts = new Set<string>();

  const scan = (cells: Array<[number, number]>) => {
    const seen: Record<number, Array<[number, number]>> = {};
    for (const [r, c] of cells) {
      const v = grid[r][c].value;
      if (v === null) continue;
      (seen[v] ??= []).push([r, c]);
    }
    for (const v in seen) {
      if (seen[v].length > 1) {
        for (const [r, c] of seen[v]) conflicts.add(`${r},${c}`);
      }
    }
  };

  // Rows
  for (let r = 0; r < BOARD_SIZE; r++) {
    const cells: Array<[number, number]> = [];
    for (let c = 0; c < BOARD_SIZE; c++) cells.push([r, c]);
    scan(cells);
  }
  // Cols
  for (let c = 0; c < BOARD_SIZE; c++) {
    const cells: Array<[number, number]> = [];
    for (let r = 0; r < BOARD_SIZE; r++) cells.push([r, c]);
    scan(cells);
  }
  // 3×3 boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells: Array<[number, number]> = [];
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) cells.push([r, c]);
      }
      scan(cells);
    }
  }
  return conflicts;
}

// ─── Scoring — Option C: count of correctly-placed cells ──────────────────

/**
 * Score = count of cells currently matching the solution (including givens).
 *
 * Range: 41 (initial board, medium difficulty, 41 clues) → 81 (solved).
 *
 * Design rationale:
 *   - Rewards partial progress. A player who fills 60 correct cells beats
 *     one who fills 45, even if neither solves in time.
 *   - No time conversion needed. Ties on score (e.g. both solve fully with
 *     score 81) are broken by the shared backend's `submittedAt` comparison
 *     — faster solver wins the timestamp race naturally.
 *   - Always > 0 (the 41 given cells are correct by construction), clearing
 *     the backend's score > 0 validation without any floor hack.
 *   - Simpler than an inverse-time formula — no drift, no speed-bonus math.
 *
 * Wrong placements contribute 0 until corrected. Peer conflicts (same digit
 * in a row/col/box) are painted red by `getConflicts` so the player can
 * see and fix them.
 */
export function countCorrect(state: SudokuState): number {
  let n = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.grid[r][c].value === state.solution[r][c]) n++;
    }
  }
  return n;
}
