import {
  DIFFICULTY,
  type Cell,
  type CellState,
  type Difficulty,
  type MinesweeperState,
} from "./types";

export { DIFFICULTY };

/** Fresh all-hidden board. */
export function createEmptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      isMine: false,
      adjacentMines: 0,
      state: "hidden" as CellState,
    })),
  );
}

export function createInitialState(
  difficulty: Difficulty = "beginner",
  seed = 0,
): MinesweeperState {
  const { rows, cols, mines } = DIFFICULTY[difficulty];
  return {
    board: createEmptyBoard(rows, cols),
    rows,
    cols,
    mineCount: mines,
    flagCount: 0,
    revealedCount: 0,
    status: "ready",
    seed,
    startedAt: null,
    difficulty,
  };
}

/**
 * Seeded mine placement. First-click safety: the clicked cell and its 8
 * neighbours are excluded from candidate mine cells — matches classic
 * Windows Minesweeper behaviour so the player never loses on turn 1.
 *
 * Uses Knuth's multiplicative hash on `(seed + attempt)` so results are
 * reproducible for a given (seed, firstRow, firstCol). Falls back to a
 * linear scan in the (unlikely) case where the hash loop runs out of
 * attempts — guarantees `mineCount` mines are always placed.
 */
export function placeMines(
  board: Cell[][],
  rows: number,
  cols: number,
  mineCount: number,
  seed: number,
  firstClickRow: number,
  firstClickCol: number,
): Cell[][] {
  const newBoard = board.map((row) => row.map((c) => ({ ...c })));

  const safeZone = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      safeZone.add(`${firstClickRow + dr},${firstClickCol + dc}`);
    }
  }

  let placed = 0;
  const maxAttempts = rows * cols * 10;
  for (let attempt = 0; placed < mineCount && attempt < maxAttempts; attempt++) {
    const hash = ((seed + attempt + 1) * 2654435761) >>> 0;
    const r = hash % rows;
    const c = (hash >>> 16) % cols;
    const key = `${r},${c}`;
    if (safeZone.has(key) || newBoard[r][c].isMine) continue;
    newBoard[r][c].isMine = true;
    placed++;
  }

  // Fallback linear scan if the hash loop left mines unplaced.
  if (placed < mineCount) {
    for (let r = 0; r < rows && placed < mineCount; r++) {
      for (let c = 0; c < cols && placed < mineCount; c++) {
        if (safeZone.has(`${r},${c}`)) continue;
        if (newBoard[r][c].isMine) continue;
        newBoard[r][c].isMine = true;
        placed++;
      }
    }
  }

  // Adjacent-mine counts for every non-mine cell.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (newBoard[r][c].isMine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (newBoard[nr][nc].isMine) count++;
          }
        }
      }
      newBoard[r][c].adjacentMines = count;
    }
  }

  return newBoard;
}

/**
 * Reveal a cell. Handles the three state transitions:
 *   1. First click (status === "ready") — seeds mines around a safe zone
 *      centred on the clicked cell, stamps `startedAt`.
 *   2. Mine click — reveals every mine (so the player sees the whole map)
 *      and transitions to "lost".
 *   3. Safe click — flood-fills contiguous zero-adjacency cells; reveals
 *      just the clicked cell if it has a non-zero adjacency.
 *
 * Flagged cells are protected against reveal; use `toggleFlag` first.
 * Clicking a revealed cell is a no-op.
 */
export function reveal(
  state: MinesweeperState,
  row: number,
  col: number,
): MinesweeperState {
  if (state.status === "won" || state.status === "lost") return state;
  const cell = state.board[row][col];
  if (cell.state === "flagged" || cell.state === "revealed") return state;

  let board = state.board;
  let status = state.status;
  let startedAt = state.startedAt;

  if (state.status === "ready") {
    board = placeMines(
      board,
      state.rows,
      state.cols,
      state.mineCount,
      state.seed,
      row,
      col,
    );
    status = "playing";
    startedAt = Date.now();
  }

  // Stepped on a mine: reveal every mine and flip to lost.
  if (board[row][col].isMine) {
    const exposed = board.map((r) =>
      r.map((c) =>
        c.isMine ? { ...c, state: "revealed" as CellState } : c,
      ),
    );
    return { ...state, board: exposed, status: "lost", startedAt };
  }

  // Flood fill — reveal contiguous zero-adjacency region. Iterative (stack)
  // to avoid call-stack blowups on 16×16 boards.
  const newBoard = board.map((r) => r.map((c) => ({ ...c })));
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
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) continue;
    const target = newBoard[r][c];
    if (target.state === "flagged" || target.state === "revealed") continue;
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

  const totalCells = state.rows * state.cols;
  const newStatus =
    revealedCount === totalCells - state.mineCount ? "won" : "playing";

  return {
    ...state,
    board: newBoard,
    status: newStatus,
    revealedCount,
    startedAt,
  };
}

/**
 * Right-click cycle: hidden → flagged → question → hidden.
 * Revealed cells are immune. Flag count tracks only true flags
 * (questions and hidden states don't count toward `flagCount`).
 */
export function toggleFlag(
  state: MinesweeperState,
  row: number,
  col: number,
): MinesweeperState {
  if (state.status === "won" || state.status === "lost") return state;
  const cell = state.board[row][col];
  if (cell.state === "revealed") return state;

  const newBoard = state.board.map((r) => r.map((c) => ({ ...c })));
  let flagCount = state.flagCount;
  const c = newBoard[row][col];

  if (c.state === "hidden") {
    c.state = "flagged";
    flagCount++;
  } else if (c.state === "flagged") {
    c.state = "question";
    flagCount--;
  } else {
    c.state = "hidden";
  }

  // Revealing a cell never flips "ready" → "playing"; flagging before any
  // click is fine but shouldn't start the clock either.
  return { ...state, board: newBoard, flagCount };
}

/**
 * Victory score = 10 000 minus 10 points per elapsed second, floored at
 * 1 000. Non-wins score zero. The floor keeps even a slow win rewarding
 * and prevents negative scores on long sessions.
 */
export function calculateScore(
  state: MinesweeperState,
  durationMs: number,
): number {
  if (state.status !== "won") return 0;
  const sec = Math.floor(durationMs / 1000);
  return Math.max(1000, 10_000 - sec * 10);
}
