// Deterministic minesweeper replay engine (Δ6 Stage 2).
//
// Source-of-truth lift from apps/minesweeper/src/lib/minesweeper/engine.ts
// (+ types.ts). The pure rules — seed fold, seeded RNG, Fisher-Yates mine
// placement, flood-fill reveal — are byte-identical to the live game; a
// permanent CI fidelity test cross-checks that and fails on any drift.
//
// Board: beginner 9×9 with 10 mines → 71 non-mine cells. Mines are placed
// deterministically at creation from the seed (NO lazy first-click safety —
// both duelists must face the identical layout), so a turn-1 mine tap just
// loses fast. Score = `revealedCount` (0…71). A turn-1 mine loss is score 0;
// the live duel submit floors that to 1 (a submit-layer concern, NOT applied
// in verify — the engine reports the raw, skill-pure count).
//
// ── SESSION BOUND (explicit) ──
// Natural terminal (the live rule): WIN when all 71 non-mine cells are
// revealed, or LOSS when a mine is revealed. Replay applies moves while
// `status === 'playing'`; once terminal the score is frozen and any further
// logged taps are ignored (matching the live engine, which no-ops reveal/flag
// after game-over — a real UI log may contain post-terminal taps). A session
// may also end NON-terminal at end-of-log (the live 2-minute timer expired),
// scoring the revealedCount reached. A defensive `MAX_MOVES = 4096` cap bounds
// replay cost on a forged over-long log (NOT a live rule; a 2-minute beginner
// game is ~50-200 taps). Bound is identical for all entrants and injects no
// luck (layout fixed by the shared seed).

import { type GameEngine, type MoveRecord, type VerifyResult, orderedMoves } from '../types';

export const BOARD_ROWS = 9;
export const BOARD_COLS = 9;
export const MINE_COUNT = 10;
export const NON_MINE_CELLS = BOARD_ROWS * BOARD_COLS - MINE_COUNT; // 71

/** Defensive replay-termination cap (NOT a live game rule). */
export const MAX_MOVES = 4096;

export type CellState = 'hidden' | 'revealed' | 'flagged';
export type GameStatus = 'playing' | 'won' | 'lost';

export interface Cell {
  isMine: boolean;
  adjacentMines: number;
  state: CellState;
}

export interface MinesweeperState {
  board: Cell[][];
  flagCount: number;
  revealedCount: number;
  status: GameStatus;
}

/** One move: reveal or (un)flag a cell. */
export type MoveMinesweeper = { row: number; col: number; action: 'reveal' | 'flag' };

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

function emptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => ({
      isMine: false,
      adjacentMines: 0,
      state: 'hidden' as CellState,
    })),
  );
}

/**
 * Place MINE_COUNT mines deterministically from the seed via a FULL Fisher-Yates
 * over the 81 flat indices (the draw order — all 80 swaps — is load-bearing;
 * shuffling only the first 10 would change the layout), then compute 8-neighbour
 * adjacency. Lifted verbatim from the live engine.
 */
function placeMines(seedNum: number): Cell[][] {
  const board = emptyBoard();
  const rand = seededRandom(seedNum);
  const totalCells = BOARD_ROWS * BOARD_COLS;

  const indices = Array.from({ length: totalCells }, (_, i) => i);
  for (let i = totalCells - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  for (let k = 0; k < MINE_COUNT; k++) {
    const idx = indices[k];
    const r = Math.floor(idx / BOARD_COLS);
    const c = idx % BOARD_COLS;
    board[r][c].isMine = true;
  }

  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      if (board[r][c].isMine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
            if (board[nr][nc].isMine) n++;
          }
        }
      }
      board[r][c].adjacentMines = n;
    }
  }
  return board;
}

export function createInitialState(seed: string): MinesweeperState {
  return { board: placeMines(numberFromSeed(seed)), flagCount: 0, revealedCount: 0, status: 'playing' };
}

function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => row.map((c) => ({ ...c })));
}

/** Reveal — verbatim flood-fill from the live engine. Returns a new state. */
export function reveal(state: MinesweeperState, row: number, col: number): MinesweeperState {
  if (state.status !== 'playing') return state;
  const cell = state.board[row][col];
  if (cell.state !== 'hidden') return state;

  if (cell.isMine) {
    const exposed = state.board.map((r) =>
      r.map((c) => (c.isMine ? { ...c, state: 'revealed' as CellState } : { ...c })),
    );
    return { ...state, board: exposed, status: 'lost' };
  }

  const newBoard = cloneBoard(state.board);
  let revealedCount = state.revealedCount;
  const stack: Array<[number, number]> = [[row, col]];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) break;
    const [r, c] = top;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) continue;
    const target = newBoard[r][c];
    if (target.state !== 'hidden') continue;
    if (target.isMine) continue;
    target.state = 'revealed';
    revealedCount++;
    if (target.adjacentMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          stack.push([r + dr, c + dc]);
        }
      }
    }
  }

  const status = revealedCount === NON_MINE_CELLS ? 'won' : state.status;
  return { ...state, board: newBoard, revealedCount, status };
}

/** Toggle hidden ↔ flagged — verbatim from the live engine. Score-neutral. */
export function toggleFlag(state: MinesweeperState, row: number, col: number): MinesweeperState {
  if (state.status !== 'playing') return state;
  const cell = state.board[row][col];
  if (cell.state === 'revealed') return state;

  const newBoard = cloneBoard(state.board);
  let flagCount = state.flagCount;
  const target = newBoard[row][col];
  if (target.state === 'hidden') {
    target.state = 'flagged';
    flagCount++;
  } else {
    target.state = 'hidden';
    flagCount--;
  }
  return { ...state, board: newBoard, flagCount };
}

function inBounds(row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

/**
 * Replays a validated move list from the seed-derived board. Applies moves
 * while `status === 'playing'`; once terminal, further moves are ignored
 * (the score is already frozen — matches the live no-op-after-game-over rule).
 */
export function replay(seed: string, moves: MoveMinesweeper[]): MinesweeperState {
  let state = createInitialState(seed);
  for (const m of moves) {
    if (state.status !== 'playing') break;
    state = m.action === 'reveal' ? reveal(state, m.row, m.col) : toggleFlag(state, m.row, m.col);
  }
  return state;
}

/** Plain serialized cell-state grid (for tests / replay views). */
export function serializeStates(board: Cell[][]): CellState[][] {
  return board.map((row) => row.map((c) => c.state));
}

/**
 * The minesweeper entry in the Δ6 adjudicator registry.
 *
 * Contract: validate the envelope ({@link orderedMoves}); reject a log longer
 * than MAX_MOVES; reject any structurally-bad move (out-of-bounds cell or an
 * action other than 'reveal'/'flag'); then replay deterministically and return
 * `{ score: revealedCount, valid:true }`. Never throws; never silently passes.
 */
export const engineMinesweeper: GameEngine<MoveMinesweeper> = {
  gameId: 'minesweeper',
  verify(seed: string, log: MoveRecord<MoveMinesweeper>[]): VerifyResult {
    const parsed = orderedMoves(log);
    if (!parsed.ok) return { score: 0, valid: false, reason: parsed.reason };
    if (parsed.moves.length > MAX_MOVES) return { score: 0, valid: false, reason: 'too_many_moves' };
    for (const m of parsed.moves) {
      if (m === null || typeof m !== 'object' || Array.isArray(m)) {
        return { score: 0, valid: false, reason: 'move_not_object' };
      }
      if (m.action !== 'reveal' && m.action !== 'flag') {
        return { score: 0, valid: false, reason: 'invalid_action' };
      }
      if (!inBounds(m.row, m.col)) return { score: 0, valid: false, reason: 'cell_out_of_bounds' };
    }
    const state = replay(seed, parsed.moves);
    return { score: state.revealedCount, valid: true };
  },
};
