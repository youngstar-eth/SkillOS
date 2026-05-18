"use client";

/**
 * Sudoku duel game component.
 *
 * Props contract matches Game2048 / GameWordle so the duel/[id] page swaps
 * in with a single import change:
 *   seed:           bytes32 hex from the match row (determines the puzzle)
 *   onGameOver(n):  called once when the grid is fully + correctly filled
 *                   (status === "solved"). Timer-expire path in duel/[id]
 *                   submits liveScore instead.
 *   onScoreChange:  emitted on every cell change — live progress signal
 *                   (count of correct placements including givens, 41–81).
 *                   Safe to show on the Your-Score card: it's your own
 *                   progress, not competitive info about the opponent.
 *   frozen:         external kill-switch (submit in flight, disables input)
 *
 * Scoring: see engine.ts `countCorrect` — cells currently matching the
 * solution, including givens. Always ≥ 41 so the backend's score > 0
 * check passes from move zero.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  BOARD_SIZE,
  countCorrect,
  createInitialState,
  getConflicts,
  selectCell as selectCellFn,
  setCellValue,
} from "@/lib/sudoku/engine";
import type { SudokuCell, SudokuState } from "@/lib/sudoku/types";

type Props = {
  seed: string;
  onGameOver: (score: number) => void;
  onScoreChange?: (score: number) => void;
  /**
   * X20.0a — emits cell-placement count (includes overwrites + clears)
   * for AntiCheat F0 (X20.0b). Selection / arrow navigation doesn't
   * count — only successful dispatches of `set`.
   */
  onMovesChange?: (moves: number) => void;
  frozen?: boolean;
};

type Action =
  | { type: "reset"; seed: string }
  | { type: "select"; row: number; col: number }
  | { type: "set"; row: number; col: number; value: number | null };

function reduce(state: SudokuState, action: Action): SudokuState {
  switch (action.type) {
    case "reset":
      return createInitialState(action.seed);
    case "select":
      return selectCellFn(state, action.row, action.col);
    case "set":
      return setCellValue(state, action.row, action.col, action.value);
  }
}

export function GameSudoku({
  seed,
  onGameOver,
  onScoreChange,
  onMovesChange,
  frozen,
}: Props) {
  const [state, dispatch] = useReducer(reduce, seed, createInitialState);
  const overFired = useRef(false);
  // X20.0a — placement count. Ref (not state) because the value's only
  // consumer is onMovesChange + game-over, neither of which renders the
  // board on a moves bump.
  const movesRef = useRef(0);

  // Reset on seed change
  useEffect(() => {
    dispatch({ type: "reset", seed });
    overFired.current = false;
    movesRef.current = 0;
  }, [seed]);

  // Live score emission — countCorrect on every state change.
  const score = useMemo(() => countCorrect(state), [state]);
  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  // Fire onGameOver once when solved
  useEffect(() => {
    if (state.status !== "solved" || overFired.current) return;
    overFired.current = true;
    onGameOver(score);
  }, [state.status, score, onGameOver]);

  // Input handler shared by the physical keyboard + NumberPad
  const handleInput = useCallback(
    (value: number | null) => {
      if (frozen || state.status !== "playing") return;
      if (!state.selectedCell) return;
      const [r, c] = state.selectedCell;
      if (state.grid[r][c].isGiven) return;
      dispatch({ type: "set", row: r, col: c, value });
      // X20.0a — bump after guards pass so we count actual placements.
      movesRef.current += 1;
      onMovesChange?.(movesRef.current);
    },
    [frozen, state.status, state.selectedCell, state.grid, onMovesChange],
  );

  // Arrow-key navigation
  const moveSelection = useCallback(
    (dr: number, dc: number) => {
      if (frozen || state.status !== "playing") return;
      const cur = state.selectedCell ?? [0, 0];
      const nr = Math.max(0, Math.min(BOARD_SIZE - 1, cur[0] + dr));
      const nc = Math.max(0, Math.min(BOARD_SIZE - 1, cur[1] + dc));
      dispatch({ type: "select", row: nr, col: nc });
    },
    [frozen, state.status, state.selectedCell],
  );

  // Physical keyboard
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        handleInput(Number(e.key));
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        handleInput(null);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1, 0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1, 0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelection(0, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelection(0, 1);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleInput, moveSelection]);

  // Count remaining placements per digit for the NumberPad badges.
  const remaining = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let n = 1; n <= 9; n++) counts[n] = 9;
    for (const row of state.grid) {
      for (const cell of row) {
        if (cell.value !== null) counts[cell.value] = (counts[cell.value] ?? 0) - 1;
      }
    }
    return counts;
  }, [state.grid]);

  const solved = state.status === "solved";

  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-4">
      {/* Progress counter — mirrors the guess counter in Wordle */}
      <div className="flex w-full items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
        <span>
          Cells correct:{" "}
          <span className="font-mono text-neutral-200">{score}</span> / 81
        </span>
        {solved ? (
          <span className="text-emerald-400">Solved ✓</span>
        ) : (
          <span>
            <span className="font-mono text-neutral-200">{81 - score}</span>{" "}
            left
          </span>
        )}
      </div>

      <Board
        state={state}
        solved={solved}
        onSelect={(r, c) => dispatch({ type: "select", row: r, col: c })}
      />

      <NumberPad
        disabled={frozen || solved}
        remaining={remaining}
        onNumber={(n) => handleInput(n)}
        onClear={() => handleInput(null)}
      />
    </div>
  );
}

// ─── Board ─────────────────────────────────────────────────────────────────

function Board({
  state,
  solved,
  onSelect,
}: {
  state: SudokuState;
  solved: boolean;
  onSelect: (row: number, col: number) => void;
}) {
  const conflicts = useMemo(() => getConflicts(state.grid), [state.grid]);
  const sel = state.selectedCell;
  const selValue = sel ? state.grid[sel[0]][sel[1]].value : null;

  return (
    <div
      className="sudoku-board w-full"
      role="grid"
      aria-label="Sudoku board"
    >
      {state.grid.map((row, r) =>
        row.map((cell, c) => {
          const isSel = !!sel && sel[0] === r && sel[1] === c;
          const isPeer =
            !!sel && !isSel && sharePeer(sel[0], sel[1], r, c);
          const isSameNumber =
            !!sel && !isSel && selValue !== null && cell.value === selValue;
          const hasConflict = conflicts.has(`${r},${c}`);
          return (
            <CellView
              key={`${r}-${c}`}
              cell={cell}
              row={r}
              col={c}
              isSelected={isSel}
              isPeer={isPeer}
              isSameNumber={isSameNumber}
              hasConflict={hasConflict}
              solved={solved && !cell.isGiven}
              onSelect={onSelect}
            />
          );
        }),
      )}
    </div>
  );
}

function sharePeer(r1: number, c1: number, r2: number, c2: number): boolean {
  if (r1 === r2 || c1 === c2) return true;
  return (
    Math.floor(r1 / 3) === Math.floor(r2 / 3) &&
    Math.floor(c1 / 3) === Math.floor(c2 / 3)
  );
}

// ─── Cell ──────────────────────────────────────────────────────────────────

function CellView({
  cell,
  row,
  col,
  isSelected,
  isPeer,
  isSameNumber,
  hasConflict,
  solved,
  onSelect,
}: {
  cell: SudokuCell;
  row: number;
  col: number;
  isSelected: boolean;
  isPeer: boolean;
  isSameNumber: boolean;
  hasConflict: boolean;
  solved: boolean;
  onSelect: (row: number, col: number) => void;
}) {
  const classes = ["sudoku-cell"];
  if (cell.isGiven) classes.push("given");
  else if (cell.value !== null) classes.push("user");
  if (hasConflict) classes.push("conflict");
  else if (isSelected) classes.push("selected");
  else if (isSameNumber) classes.push("same-number");
  else if (isPeer) classes.push("peer");
  if (solved) classes.push("solved");

  return (
    <button
      type="button"
      onClick={() => onSelect(row, col)}
      data-row={row}
      data-col={col}
      className={classes.join(" ")}
      aria-label={`cell ${row},${col}${cell.value !== null ? " = " + cell.value : ""}`}
    >
      {cell.value !== null ? cell.value : ""}
    </button>
  );
}

// ─── NumberPad ─────────────────────────────────────────────────────────────

function NumberPad({
  disabled,
  remaining,
  onNumber,
  onClear,
}: {
  disabled: boolean;
  remaining: Record<number, number>;
  onNumber: (n: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-9 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const left = remaining[n] ?? 0;
          const done = left <= 0;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onNumber(n)}
              disabled={disabled || done}
              className="relative flex aspect-square items-center justify-center rounded-lg border border-border bg-bg-elev font-mono text-lg font-semibold text-neutral-100 transition-colors hover:border-skill hover:bg-bg-elev2 disabled:opacity-30"
              aria-label={`place ${n}`}
            >
              {n}
              {!done && (
                <span className="absolute bottom-0.5 right-1 font-sans text-[9px] font-medium text-neutral-500">
                  {left}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        className="min-h-[40px] rounded-lg border border-border bg-bg-elev text-sm font-semibold text-neutral-200 transition-colors hover:border-skill disabled:opacity-40"
      >
        Clear cell (⌫)
      </button>
    </div>
  );
}
