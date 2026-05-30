// Deterministic sudoku replay engine (Δ6 Stage 2).
//
// Source-of-truth lift from apps/sudoku/src/lib/sudoku/engine.ts (+ types.ts).
// The determinism crux is the puzzle GENERATION: a randomised-backtracking
// solution generator driven by `seededRandom(seedNum)`, then a clue-removal
// pass driven by a SEPARATE stream `seededRandom(seedNum + 1)`. Both — and the
// exact shuffle draw order — are lifted VERBATIM, so the generated solution +
// puzzle byte-match the live game. A permanent CI fidelity test asserts that.
//
// The engine's state is wall-clock-free: the live `createInitialState` stamps
// `startedAt: Date.now()` (a UI concern for the speed display) which is dropped
// here — it never affects the score.
//
// Score = `countCorrect` (cells matching the solution, INCLUDING the 41 given
// clues). Range 41 (initial) → 81 (solved). Wrong placements contribute 0 until
// corrected. The live duel needs no score floor — the 41 givens guarantee
// score ≥ 41 > 0.
//
// ── SESSION BOUND (explicit) ──
// Natural terminal (the live rule): SOLVED when the grid is complete AND every
// cell matches the solution (status flips to 'solved'). Replay applies
// placements while `status === 'playing'`; once solved the score is frozen and
// further placements are ignored (matching the live `setCellValue`, which
// no-ops once status !== 'playing'). A session may also end NON-terminal at
// end-of-log (the live 2-minute timer expired), scoring the countCorrect
// reached. A defensive `MAX_MOVES = 4096` cap bounds replay cost on a forged
// over-long log (NOT a live rule). Given-cell edits + clears no-op exactly as
// the live engine does, so the bound stays faithful. Identical for all
// entrants; injects no luck (puzzle fixed by the shared seed).

import { type GameEngine, type MoveRecord, type VerifyResult, orderedMoves } from '../types';

export const BOARD_SIZE = 9;
/** Cells removed from the solution → 41 clues remain. Verbatim from live. */
export const DUEL_REMOVE = 40;
/** Defensive replay-termination cap (NOT a live game rule). */
export const MAX_MOVES = 4096;

export type CellValue = number | null;
export interface SudokuCell {
  value: CellValue;
  isGiven: boolean;
}
export type GameStatus = 'playing' | 'solved';
/** Engine state — wall-clock-free subset of the live SudokuState. */
export interface SudokuState {
  grid: SudokuCell[][];
  solution: number[][];
  status: GameStatus;
}

/** One move: place a digit (1-9) or clear (null) at a cell. */
export type MoveSudoku = { row: number; col: number; value: CellValue };

/** FNV-1a fold of the bytes32 seed to a uint32 — verbatim from the live engine. */
export function numberFromSeed(seed: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

/** Knuth multiplicative-hash RNG → [0,1) — verbatim from the live engine. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = Math.imul(state, 2654435761) >>> 0;
    return state / 0x100000000;
  };
}

/** Fisher-Yates shuffle using a seeded rand — verbatim from the live engine. */
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Randomised-backtracking complete-grid generator — verbatim from live. */
export function generateSolution(seed: number): number[][] {
  const grid: number[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
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

/** Clue-removal pass on the SEPARATE `seed + 1` stream — verbatim from live. */
export function createPuzzle(solution: number[][], seed: number): (number | null)[][] {
  const rand = seededRandom(seed + 1);
  const puzzle = solution.map((row) => row.map((v) => v as number | null));
  const positions: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) positions.push([r, c]);
  const shuffled = shuffle(positions, rand);
  for (let i = 0; i < DUEL_REMOVE; i++) {
    const [r, c] = shuffled[i];
    puzzle[r][c] = null;
  }
  return puzzle;
}

export function createInitialState(seed: string): SudokuState {
  const seedNum = numberFromSeed(seed);
  const solution = generateSolution(seedNum);
  const puzzle = createPuzzle(solution, seedNum);
  const grid: SudokuCell[][] = puzzle.map((row) => row.map((v) => ({ value: v, isGiven: v !== null })));
  return { grid, solution, status: 'playing' };
}

function cloneGrid(grid: SudokuCell[][]): SudokuCell[][] {
  return grid.map((row) => row.map((c) => ({ ...c })));
}

export function isComplete(grid: SudokuCell[][]): boolean {
  for (const row of grid) for (const cell of row) if (cell.value === null) return false;
  return true;
}

export function matchesSolution(grid: SudokuCell[][], solution: number[][]): boolean {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) if (grid[r][c].value !== solution[r][c]) return false;
  return true;
}

/** Place a digit / clear a cell — verbatim semantics from the live engine. */
export function setCellValue(state: SudokuState, row: number, col: number, value: CellValue): SudokuState {
  if (state.status !== 'playing') return state;
  const cell = state.grid[row][col];
  if (cell.isGiven) return state;
  const newGrid = cloneGrid(state.grid);
  newGrid[row][col] = { ...newGrid[row][col], value };
  const solved = isComplete(newGrid) && matchesSolution(newGrid, state.solution);
  return { ...state, grid: newGrid, status: solved ? 'solved' : 'playing' };
}

/** Score = count of cells matching the solution (incl. givens). 41…81. */
export function countCorrect(state: SudokuState): number {
  let n = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) if (state.grid[r][c].value === state.solution[r][c]) n++;
  return n;
}

/** Serialized value grid (for tests / replay views). */
export function serializeValues(grid: SudokuCell[][]): CellValue[][] {
  return grid.map((row) => row.map((c) => c.value));
}

function inBounds(row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/** Replays a validated move list. Given-cell / post-solve placements no-op (live-faithful). */
export function replay(seed: string, moves: MoveSudoku[]): SudokuState {
  let state = createInitialState(seed);
  for (const m of moves) {
    if (state.status !== 'playing') break;
    state = setCellValue(state, m.row, m.col, m.value);
  }
  return state;
}

/**
 * The sudoku entry in the Δ6 adjudicator registry.
 *
 * Contract: validate the envelope ({@link orderedMoves}); reject a log longer
 * than MAX_MOVES; reject any structurally-bad move (out-of-bounds cell, or a
 * value that is neither `null` nor an integer 1-9); then replay deterministically
 * and return `{ score: countCorrect, valid:true }`. Given-cell edits no-op
 * exactly as the live engine does (they never change the score). Never throws;
 * never silently passes a malformed log.
 */
export const engineSudoku: GameEngine<MoveSudoku> = {
  gameId: 'sudoku',
  verify(seed: string, log: MoveRecord<MoveSudoku>[]): VerifyResult {
    const parsed = orderedMoves(log);
    if (!parsed.ok) return { score: 0, valid: false, reason: parsed.reason };
    if (parsed.moves.length > MAX_MOVES) return { score: 0, valid: false, reason: 'too_many_moves' };
    for (const m of parsed.moves) {
      if (m === null || typeof m !== 'object' || Array.isArray(m)) {
        return { score: 0, valid: false, reason: 'move_not_object' };
      }
      if (!inBounds(m.row, m.col)) return { score: 0, valid: false, reason: 'cell_out_of_bounds' };
      const v = m.value;
      if (!(v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 9))) {
        return { score: 0, valid: false, reason: 'invalid_value' };
      }
    }
    const state = replay(seed, parsed.moves);
    return { score: countCorrect(state), valid: true };
  },
};
