/**
 * Pure 2048 game logic with a deterministic, seed-driven RNG.
 *
 * Fairness model:
 * - Both duel players receive the same `seed` (bytes32 hex from the match).
 * - All non-determinism in this game (initial tile placements, spawn cell
 *   choice, and 2-vs-4 value choice) is sourced from a seeded LCG derived
 *   from the seed. Two players with the same seed and the same sequence of
 *   moves will observe identical boards.
 */

export const BOARD_SIZE = 4;
export type Cell = number; // 0 = empty, else 2,4,8,…
export type Board = Cell[][];
export type Direction = "up" | "down" | "left" | "right";

/**
 * Seedable RNG: 32-bit LCG (Numerical Recipes constants).
 * Produces a deterministic sequence of [0,1) floats from a uint32 state.
 */
export class SeededRng {
  private state: number;

  constructor(seed: string | number) {
    this.state = hashSeed(seed);
    // Warm-up — first LCG value after tiny seeds is often close to the seed.
    for (let i = 0; i < 4; i++) this.nextUint32();
  }

  nextUint32(): number {
    // state = state * 1664525 + 1013904223, mod 2^32
    // Do multiplication in two halves to avoid 32-bit overflow issues in JS.
    const lo = (this.state & 0xffff) * 1664525;
    const hi = ((this.state >>> 16) * 1664525) & 0xffff;
    this.state = ((hi << 16) + lo + 1013904223) >>> 0;
    return this.state;
  }

  /** Uniform in [0,1). */
  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  /** Integer in [0, n). */
  nextInt(n: number): number {
    return Math.floor(this.next() * n);
  }
}

/**
 * Hashes any seed (hex string, decimal string, or number) to a uint32.
 * For a hex `0x...` string we fold 4 bytes at a time; FNV-1a style mixing.
 */
export function hashSeed(seed: string | number): number {
  let h = 0x811c9dc5 >>> 0;
  const s = typeof seed === "number" ? seed.toString(16) : seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Ensure non-zero
  return h === 0 ? 0xdeadbeef : h;
}

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => 0),
  );
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.slice());
}

export function boardsEqual(a: Board, b: Board): boolean {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) if (a[r][c] !== b[r][c]) return false;
  return true;
}

export function isBoardFull(b: Board): boolean {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) if (b[r][c] === 0) return false;
  return true;
}

/**
 * Spawns one tile on an empty cell. 90% chance of 2, 10% of 4.
 * No-op if the board is full.
 */
export function spawnTile(board: Board, rng: SeededRng): Board {
  const empties: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c] === 0) empties.push([r, c]);
  if (empties.length === 0) return board;

  const [r, c] = empties[rng.nextInt(empties.length)];
  const value = rng.next() < 0.9 ? 2 : 4;
  const next = cloneBoard(board);
  next[r][c] = value;
  return next;
}

/**
 * Creates the starting board: two tiles spawned deterministically from the seed.
 */
export function createInitialBoard(seed: string): {
  board: Board;
  rng: SeededRng;
} {
  const rng = new SeededRng(seed);
  let board = emptyBoard();
  board = spawnTile(board, rng);
  board = spawnTile(board, rng);
  return { board, rng };
}

/**
 * Slides one row to the left, merging equal adjacent tiles (each tile can
 * only merge once per move — the canonical 2048 rule).
 * Returns the new row + the score gained by merges.
 */
function slideRowLeft(row: Cell[]): { row: Cell[]; gained: number } {
  const filtered = row.filter((v) => v !== 0);
  const out: Cell[] = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i++) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2;
      out.push(merged);
      gained += merged;
      i++; // skip the one we merged with
    } else {
      out.push(filtered[i]);
    }
  }
  while (out.length < BOARD_SIZE) out.push(0);
  return { row: out, gained };
}

/**
 * Applies a move to the board. Does NOT spawn a new tile — caller decides.
 * Returns { board, gained, moved }.
 */
export function move(
  board: Board,
  dir: Direction,
): { board: Board; gained: number; moved: boolean } {
  let gained = 0;

  // Transform so we can always slide-left.
  const rotated = transformForMove(board, dir);
  const sliced = rotated.map((row) => {
    const r = slideRowLeft(row);
    gained += r.gained;
    return r.row;
  });
  const restored = untransformForMove(sliced, dir);
  const moved = !boardsEqual(board, restored);
  return { board: restored, gained, moved };
}

/**
 * Rotate/reflect board so the requested move direction becomes "left".
 * This lets us implement only one slide function.
 */
function transformForMove(b: Board, dir: Direction): Board {
  switch (dir) {
    case "left":
      return cloneBoard(b);
    case "right":
      return b.map((row) => row.slice().reverse());
    case "up":
      return transpose(b);
    case "down":
      return transpose(b).map((row) => row.slice().reverse());
  }
}

function untransformForMove(b: Board, dir: Direction): Board {
  switch (dir) {
    case "left":
      return cloneBoard(b);
    case "right":
      return b.map((row) => row.slice().reverse());
    case "up":
      return transpose(b);
    case "down":
      return transpose(b.map((row) => row.slice().reverse()));
  }
}

function transpose(b: Board): Board {
  const out = emptyBoard();
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) out[c][r] = b[r][c];
  return out;
}

/**
 * Any legal move remaining?
 */
export function canMove(board: Board): boolean {
  if (!isBoardFull(board)) return true;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const v = board[r][c];
      if (r + 1 < BOARD_SIZE && board[r + 1][c] === v) return true;
      if (c + 1 < BOARD_SIZE && board[r][c + 1] === v) return true;
    }
  }
  return false;
}
