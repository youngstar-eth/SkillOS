// Server-side mirror of apps/2048/src/lib/game2048.ts.
//
// Vendored, not workspace-imported. Sibling app workspace deps are awkward
// in this monorepo (each app is its own deploy unit) and the engine surface
// is small + stable. If/when we extract packages/game-engine in a later
// sprint, both copies converge there.
//
// MUST stay byte-identical with the apex-side engine logic. Two consumers
// rely on this:
//   - Sprint X20 orchestrator (apps/api/src/lib/duel/runner.ts) feeds the
//     agent + writes board snapshots to Supabase.
//   - Replay verification (T2 tier, post-Phase-2) walks the move list and
//     re-derives boards from seed + moves. Any divergence and replay fails.

export const BOARD_SIZE = 4;
export type Cell = number;
export type Board = Cell[][];
export type Direction = 'up' | 'down' | 'left' | 'right';

export class SeededRng {
  private state: number;

  constructor(seed: string | number) {
    this.state = hashSeed(seed);
    for (let i = 0; i < 4; i++) this.nextUint32();
  }

  nextUint32(): number {
    const lo = (this.state & 0xffff) * 1664525;
    const hi = ((this.state >>> 16) * 1664525) & 0xffff;
    this.state = ((hi << 16) + lo + 1013904223) >>> 0;
    return this.state;
  }

  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(n: number): number {
    return Math.floor(this.next() * n);
  }
}

export function hashSeed(seed: string | number): number {
  let h = 0x811c9dc5 >>> 0;
  const s = typeof seed === 'number' ? seed.toString(16) : seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
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

export function spawnTile(board: Board, rng: SeededRng): Board {
  const empties: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c] === 0) empties.push([r, c]);
  if (empties.length === 0) return board;

  const pick = empties[rng.nextInt(empties.length)];
  const value = rng.next() < 0.9 ? 2 : 4;
  const next = cloneBoard(board);
  next[pick[0]][pick[1]] = value;
  return next;
}

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

function slideRowLeft(row: Cell[]): { row: Cell[]; gained: number } {
  const filtered = row.filter((v) => v !== 0);
  const out: Cell[] = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i++) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(filtered[i]);
    }
  }
  while (out.length < BOARD_SIZE) out.push(0);
  return { row: out, gained };
}

export function move(
  board: Board,
  dir: Direction,
): { board: Board; gained: number; moved: boolean } {
  let gained = 0;
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

function transformForMove(b: Board, dir: Direction): Board {
  switch (dir) {
    case 'left':
      return cloneBoard(b);
    case 'right':
      return b.map((row) => row.slice().reverse());
    case 'up':
      return transpose(b);
    case 'down':
      return transpose(b).map((row) => row.slice().reverse());
  }
}

function untransformForMove(b: Board, dir: Direction): Board {
  switch (dir) {
    case 'left':
      return cloneBoard(b);
    case 'right':
      return b.map((row) => row.slice().reverse());
    case 'up':
      return transpose(b);
    case 'down':
      return transpose(b.map((row) => row.slice().reverse()));
  }
}

function transpose(b: Board): Board {
  const out = emptyBoard();
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) out[c][r] = b[r][c];
  return out;
}

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

/** Convenience: list of directions where applyMove(board, dir).moved === true. */
export function legalMoves(board: Board): Direction[] {
  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  return dirs.filter((d) => move(board, d).moved);
}
