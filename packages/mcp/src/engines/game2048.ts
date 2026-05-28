// Deterministic 2048 game engine used by the MCP `get_board_state` /
// `make_move` / `submit_score` tools.
//
// Source-of-truth lift from `apps/2048/src/lib/game2048.ts` (kept here to
// avoid pulling the Next app into the @skillos/mcp dependency graph), with
// MCP-specific wrappers added:
//
//   - `createSession(seed)` — bundles board + rng + score + move counter,
//     so the MCP tools can hand back/forward a single session handle.
//   - `applyMove(session, direction)` — slide + spawn in one call, returning
//     the score delta + a `moved` flag. The 2048 contract for "did anything
//     change" is checked against the pre-slide board, so a no-op direction
//     does NOT consume a turn (matches canonical 2048 UX).
//   - `MAX_MOVES = 100` bounded session per X32-4 spec; engine refuses
//     further moves once `movesUsed` hits the cap, mirroring "game over".
//
// Determinism contract: same seed string + same sequence of move directions
// → same board + same score on every machine. Verifier-friendly.
//
// No I/O, no network. Pure functions over plain JS arrays + a seeded LCG.

export const BOARD_SIZE = 4;
export const MAX_MOVES = 100;

export type Cell = number; // 0 = empty, else 2, 4, 8, …
export type Board = Cell[][];
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface GameSession {
  seed: string;
  board: Board;
  rng: SeededRng;
  score: number;
  movesUsed: number;
  moves: Direction[];
}

/**
 * Seedable RNG: 32-bit LCG (Numerical Recipes constants). Produces a
 * deterministic sequence of [0,1) floats from a uint32 state. Lifted
 * verbatim from `apps/2048/src/lib/game2048.ts` so the engine's RNG matches
 * the production game UI bit-for-bit.
 */
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

/** Spawns one tile on a random empty cell. 90% chance of 2, 10% of 4. */
export function spawnTile(board: Board, rng: SeededRng): Board {
  const empties: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) if (board[r][c] === 0) empties.push([r, c]);
  if (empties.length === 0) return board;
  const [r, c] = empties[rng.nextInt(empties.length)];
  const value = rng.next() < 0.9 ? 2 : 4;
  const next = cloneBoard(board);
  next[r][c] = value;
  return next;
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

function transpose(b: Board): Board {
  const out = emptyBoard();
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) out[c][r] = b[r][c];
  return out;
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

/** Pure slide+merge in a direction. Does NOT spawn — caller decides. */
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

/** Any legal move remaining on the given board? */
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

// ─── Session wrappers (MCP-facing) ────────────────────────────────────────

/**
 * Initializes a new session: empty board → spawn 2 tiles deterministically
 * from `seed`. `seed` should be stable per (agent, tournament) so two runs
 * with the same agent+tournament observe the same opening.
 */
export function createSession(seed: string): GameSession {
  const rng = new SeededRng(seed);
  let board = emptyBoard();
  board = spawnTile(board, rng);
  board = spawnTile(board, rng);
  return { seed, board, rng, score: 0, movesUsed: 0, moves: [] };
}

/**
 * Applies one move to the session.
 *
 * - `moved: true` → board changed, score updated, new tile spawned,
 *   movesUsed incremented, direction recorded in `moves`.
 * - `moved: false` → no-op direction (e.g. sliding left on a left-aligned
 *   board). Session is untouched; the turn is NOT consumed — matches
 *   canonical 2048 UX where dead directions just don't do anything.
 *
 * After MAX_MOVES legal moves the session is considered game-over and
 * further calls return `{ moved: false, gameOver: true, ... }`.
 */
export function applyMove(
  session: GameSession,
  direction: Direction,
): { scoreDelta: number; moved: boolean; gameOver: boolean } {
  if (isGameOver(session)) {
    return { scoreDelta: 0, moved: false, gameOver: true };
  }
  const { board: slid, gained, moved } = move(session.board, direction);
  if (!moved) {
    return { scoreDelta: 0, moved: false, gameOver: false };
  }
  session.board = spawnTile(slid, session.rng);
  session.score += gained;
  session.movesUsed += 1;
  session.moves.push(direction);
  return { scoreDelta: gained, moved: true, gameOver: isGameOver(session) };
}

/** Game ends if move cap reached or no legal moves remain. */
export function isGameOver(session: GameSession): boolean {
  if (session.movesUsed >= MAX_MOVES) return true;
  return !canMove(session.board);
}

/** Plain serializable view of the board (for tool outputs). */
export function serializeBoard(board: Board): number[][] {
  return board.map((row) => row.slice());
}

/**
 * Replays a move sequence from scratch and returns the resulting session.
 * Used by `submit_score` to verify a claimed score against the recorded
 * move trail — the verifier doesn't trust the agent's `score` field; it
 * replays the moves on the same seed and uses the engine's score.
 */
export function replay(seed: string, moves: Direction[]): GameSession {
  const session = createSession(seed);
  for (const dir of moves) {
    if (isGameOver(session)) break;
    applyMove(session, dir);
  }
  return session;
}
