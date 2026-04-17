import {
  BOARD_SIZE,
  type Difficulty,
  type SudokuCell,
  type SudokuState,
} from "./types";

export { BOARD_SIZE };

// ---------------------------------------------------------------------------
// Seeded RNG & shuffle
// ---------------------------------------------------------------------------

/**
 * Deterministic 32-bit RNG based on Knuth's multiplicative hash. Given the
 * same seed, produces the same sequence forever — required so the tournament
 * puzzle is identical for every player.
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

// ---------------------------------------------------------------------------
// Generator — produce a full valid sudoku grid
// ---------------------------------------------------------------------------

/**
 * Generate a complete 9×9 sudoku grid using randomised backtracking. The
 * randomness source is `seededRandom(seed)` so the result is reproducible.
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

// ---------------------------------------------------------------------------
// Puzzle maker — remove cells per difficulty
// ---------------------------------------------------------------------------

const DIFFICULTY_REMOVE: Record<Difficulty, number> = {
  easy: 40, // 41 clues remain
  medium: 50, // 31 clues
  hard: 58, // 23 clues
};

export { DIFFICULTY_REMOVE };

/**
 * Remove cells from a complete solution to build a puzzle. The puzzle is NOT
 * guaranteed to have a unique solution at high difficulty levels — a
 * production build would run a uniqueness check, but for a time-boxed
 * tournament we favour fast seeded generation.
 */
export function createPuzzle(
  solution: number[][],
  difficulty: Difficulty,
  seed: number,
): (number | null)[][] {
  const rand = seededRandom(seed + 1);
  const puzzle = solution.map((row) => row.map((v) => v as number | null));
  const removeCount = DIFFICULTY_REMOVE[difficulty];

  const positions: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) positions.push([r, c]);
  }
  const shuffled = shuffle(positions, rand);

  for (let i = 0; i < removeCount; i++) {
    const [r, c] = shuffled[i];
    puzzle[r][c] = null;
  }

  return puzzle;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function createInitialState(
  difficulty: Difficulty,
  seed: number,
): SudokuState {
  const solution = generateSolution(seed);
  const puzzle = createPuzzle(solution, difficulty, seed);
  const grid: SudokuCell[][] = puzzle.map((row) =>
    row.map((v) => ({
      value: v,
      isGiven: v !== null,
      notes: new Set<number>(),
    })),
  );
  return {
    grid,
    solution,
    puzzle: puzzle.map((r) => [...r]),
    difficulty,
    seed,
    startedAt: Date.now(),
    hintsUsed: 0,
    errorsCount: 0,
    status: "playing",
    selectedCell: null,
  };
}

function cloneGrid(grid: SudokuCell[][]): SudokuCell[][] {
  return grid.map((row) =>
    row.map((c) => ({ ...c, notes: new Set(c.notes) })),
  );
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
 * increment `errorsCount` but are still placed (NYT-style: the board shows
 * your mistake). When the final move completes a fully-correct grid, the
 * state transitions to "solved".
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
  newGrid[row][col] = { ...newGrid[row][col], value, notes: new Set() };

  const solved =
    isComplete(newGrid) && matchesSolution(newGrid, state.solution);
  const newErrors =
    value !== null && value !== state.solution[row][col]
      ? state.errorsCount + 1
      : state.errorsCount;

  return {
    ...state,
    grid: newGrid,
    status: solved ? "solved" : "playing",
    errorsCount: newErrors,
  };
}

/** Toggle a pencil-mark on a non-given empty cell. */
export function toggleNote(
  state: SudokuState,
  row: number,
  col: number,
  note: number,
): SudokuState {
  if (state.status !== "playing") return state;
  const cell = state.grid[row][col];
  if (cell.isGiven || cell.value !== null) return state;

  const newGrid = cloneGrid(state.grid);
  const target = newGrid[row][col];
  if (target.notes.has(note)) target.notes.delete(note);
  else target.notes.add(note);
  return { ...state, grid: newGrid };
}

/**
 * Fill the first empty cell (scan left-to-right, top-to-bottom) with the
 * correct answer and bump `hintsUsed`. No-op once solved.
 */
export function getHint(state: SudokuState): SudokuState {
  if (state.status !== "playing") return state;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.grid[r][c].value === null) {
        const newGrid = cloneGrid(state.grid);
        newGrid[r][c] = {
          ...newGrid[r][c],
          value: state.solution[r][c],
          notes: new Set(),
        };
        // If this happens to be the last cell, also flip to solved.
        const solved =
          isComplete(newGrid) && matchesSolution(newGrid, state.solution);
        return {
          ...state,
          grid: newGrid,
          hintsUsed: state.hintsUsed + 1,
          status: solved ? "solved" : "playing",
        };
      }
    }
  }
  return state;
}

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
 * Used to paint conflicting cells red. Empty cells are ignored.
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

/**
 * Winning score:
 *   base × difficulty − 1 per second − 500 per hint − 100 per error,
 *   floored at 1000. Non-wins score zero.
 */
export function calculateScore(
  state: SudokuState,
  durationMs: number,
): number {
  if (state.status !== "solved") return 0;
  const multiplier: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 4 };
  const base = 5_000 * multiplier[state.difficulty];
  const sec = Math.floor(durationMs / 1000);
  const raw = base - sec - state.hintsUsed * 500 - state.errorsCount * 100;
  return Math.max(1000, raw);
}
