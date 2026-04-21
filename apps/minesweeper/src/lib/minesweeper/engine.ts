// ───────────────────────────────────────────────────────────────────────────
// Minesweeper engine — adapted from the legacy main-branch implementation.
//
// Key differences from legacy:
//   1. Seed input is a bytes32 hex (match row). FNV-1a folded to uint32 via
//      `numberFromSeed`, same pattern as 2048 / wordle / sudoku.
//   2. NO first-click safety. Legacy placed mines lazily after the first
//      click so the initial tap never hit a mine, but that made the mine
//      layout depend on which cell the player tapped first — two duelists
//      would face different mine maps from the same seed. For duel
//      fairness we lay mines out deterministically at creation time from
//      the seed; both players see the identical layout. A player who taps
//      a mine on turn 1 just loses fast (onGameOver fires with
//      revealedCount = 0, submit floors to 1 in duel/[id]).
//   3. Single difficulty — beginner (9×9, 10 mines). Duel ladders later.
//   4. Flag state simplified: hidden ↔ flagged (legacy had an extra
//      `question` marker, overkill for a 2-minute game).
//   5. Score is `revealedCount` (0 → 71). Ties on full-solve (both 71)
//      broken by the shared backend's submittedAt — faster solver wins.
// ───────────────────────────────────────────────────────────────────────────

import {
  BOARD_COLS,
  BOARD_ROWS,
  MINE_COUNT,
  NON_MINE_CELLS,
  type Cell,
  type CellState,
  type MinesweeperState,
} from "./types";

export { BOARD_ROWS, BOARD_COLS, MINE_COUNT, NON_MINE_CELLS };

// ─── Seed conversion ──────────────────────────────────────────────────────

/**
 * FNV-1a folding of the bytes32 seed to a uint32. Matches the hashSeed
 * pattern in apps/2048/src/lib/game2048.ts and the other game engines.
 */
export function numberFromSeed(seed: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

// ─── Seeded RNG ───────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = Math.imul(state, 2654435761) >>> 0;
    return state / 0x100000000;
  };
}

// ─── Board construction ───────────────────────────────────────────────────

function emptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => ({
      isMine: false,
      adjacentMines: 0,
      state: "hidden" as CellState,
    })),
  );
}

/**
 * Place `MINE_COUNT` mines deterministically from the seed, then compute
 * the 8-neighbour mine count for every non-mine cell. Identical output
 * for identical seed — both duelists see the same layout.
 */
function placeMines(seedNum: number): Cell[][] {
  const board = emptyBoard();
  const rand = seededRandom(seedNum);
  const totalCells = BOARD_ROWS * BOARD_COLS;

  // Fisher-Yates over the flat index list — picks MINE_COUNT unique cells.
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

  // Adjacent-mine counts.
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
  const seedNum = numberFromSeed(seed);
  return {
    board: placeMines(seedNum),
    flagCount: 0,
    revealedCount: 0,
    status: "playing",
  };
}

function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => row.map((c) => ({ ...c })));
}

// ─── Reveal ───────────────────────────────────────────────────────────────

/**
 * Reveal a cell. Three outcomes:
 *   1. Mine click → expose every mine, status → "lost".
 *   2. Safe with zero adjacency → iterative flood-fill reveals every
 *      contiguous zero-adjacency cell plus its immediate numbered edge.
 *   3. Safe with non-zero adjacency → reveal just that one cell.
 *
 * Flagged or already-revealed cells are no-ops. No game-over predicate is
 * evaluated here when the status is already "won" or "lost".
 */
export function reveal(
  state: MinesweeperState,
  row: number,
  col: number,
): MinesweeperState {
  if (state.status !== "playing") return state;
  const cell = state.board[row][col];
  if (cell.state !== "hidden") return state;

  // Mine hit — expose all mines, freeze the game.
  if (cell.isMine) {
    const exposed = state.board.map((r) =>
      r.map((c) =>
        c.isMine
          ? { ...c, state: "revealed" as CellState }
          : { ...c },
      ),
    );
    return { ...state, board: exposed, status: "lost" };
  }

  // Safe reveal — iterative flood fill on zero-adjacency cells.
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
    if (target.state !== "hidden") continue;
    if (target.isMine) continue;
    target.state = "revealed";
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

  const status =
    revealedCount === NON_MINE_CELLS ? "won" : state.status;

  return { ...state, board: newBoard, revealedCount, status };
}

// ─── Flag ─────────────────────────────────────────────────────────────────

/**
 * Toggle hidden ↔ flagged. Revealed cells are immune. Mine-flagging is
 * optional — players can still win without placing any flags, since the
 * win condition is `revealedCount === NON_MINE_CELLS`.
 */
export function toggleFlag(
  state: MinesweeperState,
  row: number,
  col: number,
): MinesweeperState {
  if (state.status !== "playing") return state;
  const cell = state.board[row][col];
  if (cell.state === "revealed") return state;

  const newBoard = cloneBoard(state.board);
  let flagCount = state.flagCount;
  const target = newBoard[row][col];

  if (target.state === "hidden") {
    target.state = "flagged";
    flagCount++;
  } else {
    target.state = "hidden";
    flagCount--;
  }

  return { ...state, board: newBoard, flagCount };
}
