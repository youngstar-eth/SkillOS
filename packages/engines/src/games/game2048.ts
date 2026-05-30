// Deterministic 2048 replay engine.
//
// Source-of-truth lift from `apps/2048/src/lib/game2048.ts` (kept here to
// avoid pulling the Next app into the engine dependency graph). The pure
// rules — RNG, spawn, slide/merge — are byte-identical to the live game; a
// permanent CI fidelity test (`scripts/fidelity-2048-live-vs-engine.test.ts`)
// asserts that and fails the build on any drift on either side.
//
// MCP-specific session wrappers (createSession / applyMove / replay) and the
// Δ6 `GameEngine` adjudicator adapter (`engine2048`) are layered on top of
// those rules:
//
//   - `createSession(seed)` — bundles board + rng + score + move counter.
//   - `applyMove(session, direction)` — slide + spawn in one call. A no-op
//     direction does NOT consume a turn (matches canonical 2048 UX).
//   - `MAX_MOVES = 100` bounded session; the engine refuses further moves
//     once `movesUsed` hits the cap, mirroring "game over".
//   - `replay(seed, moves)` — re-derive a session from scratch.
//   - `engine2048.verify(seed, log)` — Δ6 registry entry: structurally
//     validate the `MoveRecord` envelope, reject illegal directions, then
//     replay and return the engine-authoritative `{ score, valid }`.
//
// Determinism contract: same seed string + same move sequence → same board +
// same score on every machine. No I/O, no network, no `Math.random`.

import { SeededRng } from '../rng';
import { type GameEngine, type MoveRecord, type VerifyResult, orderedMoves } from '../types';

export const BOARD_SIZE = 4;
export const MAX_MOVES = 100;

export type Cell = number; // 0 = empty, else 2, 4, 8, …
export type Board = Cell[][];
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Per-move payload for 2048's `MoveRecord<Move2048>` inputLog. */
export type Move2048 = Direction;

export interface GameSession {
  seed: string;
  board: Board;
  rng: SeededRng;
  score: number;
  movesUsed: number;
  moves: Direction[];
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

// ─── Session wrappers ─────────────────────────────────────────────────────

/**
 * Initializes a new session: empty board → spawn 2 tiles deterministically
 * from `seed`.
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
 *   movesUsed incremented, direction recorded.
 * - `moved: false` → no-op direction; session untouched; the turn is NOT
 *   consumed (canonical 2048 UX).
 *
 * After MAX_MOVES legal moves the session is game-over and further calls
 * return `{ moved: false, gameOver: true, ... }`.
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

/** Game ends if the move cap is reached or no legal moves remain. */
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
 * The verifier doesn't trust a claimed `score`; it replays the moves on the
 * same seed and uses the engine's score. No-op directions are skipped and
 * moves past game-over are ignored (the bounded-session contract).
 */
export function replay(seed: string, moves: Direction[]): GameSession {
  const session = createSession(seed);
  for (const dir of moves) {
    if (isGameOver(session)) break;
    applyMove(session, dir);
  }
  return session;
}

// ─── Δ6 adjudicator adapter ───────────────────────────────────────────────

const DIRECTIONS: ReadonlySet<string> = new Set<Direction>(['up', 'down', 'left', 'right']);

/**
 * The 2048 entry in the Δ6 adjudicator registry. Game-agnostic callers
 * (settlement, fraud-proof challengers, the match-replay endpoint) reach it
 * only through `registry['2048'].verify(seed, log)`.
 *
 * Contract:
 *  1. structurally validate the `MoveRecord` envelope (rejects null /
 *     non-array / bad-seq logs via {@link orderedMoves});
 *  2. reject any payload that is not one of the four legal directions
 *     (`invalid_direction`) — defends the boundary where `M` arrives as
 *     `unknown` from the wire;
 *  3. replay under the deterministic engine and return its authoritative
 *     score. A malformed log yields `{ score: 0, valid: false, reason }`,
 *     never a throw and never a silent pass.
 */
export const engine2048: GameEngine<Move2048> = {
  gameId: '2048',
  verify(seed: string, log: MoveRecord<Move2048>[]): VerifyResult {
    const parsed = orderedMoves(log);
    if (!parsed.ok) return { score: 0, valid: false, reason: parsed.reason };
    for (const m of parsed.moves) {
      if (typeof m !== 'string' || !DIRECTIONS.has(m)) {
        return { score: 0, valid: false, reason: 'invalid_direction' };
      }
    }
    const session = replay(seed, parsed.moves);
    return { score: session.score, valid: true };
  },
};
