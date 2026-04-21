"use client";

/**
 * Minesweeper duel game component.
 *
 * Props contract matches Game2048 / GameWordle / GameSudoku so duel/[id]
 * swaps in with a single import change:
 *   seed:           bytes32 hex — determines the mine layout
 *   onGameOver(n):  called once when the grid resolves (won or lost).
 *                   Timer-expire path in duel/[id] submits liveScore instead.
 *   onScoreChange:  emitted on every reveal — revealedCount, safe to show
 *                   on the Your-Score card (it's your own progress, not
 *                   competitive opponent info).
 *   frozen:         external kill-switch.
 *
 * Scoring: revealedCount (0 → 71). Wrong placement (clicking a mine) ends
 * the game immediately with score = whatever you'd revealed to that point.
 * A player who reveals 45 safe cells before hitting a mine beats one who
 * flails and reveals only 12. Ties on full-solve (both 71) are broken by
 * the backend's submittedAt — faster solver wins.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  MINE_COUNT,
  NON_MINE_CELLS,
  createInitialState,
  reveal as revealFn,
  toggleFlag as toggleFlagFn,
} from "@/lib/minesweeper/engine";
import type { Cell, MinesweeperState } from "@/lib/minesweeper/types";

type Props = {
  seed: string;
  onGameOver: (score: number) => void;
  onScoreChange?: (score: number) => void;
  frozen?: boolean;
};

type Action =
  | { type: "reset"; seed: string }
  | { type: "reveal"; row: number; col: number }
  | { type: "flag"; row: number; col: number };

function reduce(state: MinesweeperState, action: Action): MinesweeperState {
  switch (action.type) {
    case "reset":
      return createInitialState(action.seed);
    case "reveal":
      return revealFn(state, action.row, action.col);
    case "flag":
      return toggleFlagFn(state, action.row, action.col);
  }
}

export function GameMinesweeper({
  seed,
  onGameOver,
  onScoreChange,
  frozen,
}: Props) {
  const [state, dispatch] = useReducer(reduce, seed, createInitialState);
  const [flagMode, setFlagMode] = useState(false);
  const overFired = useRef(false);

  // Reset on seed change
  useEffect(() => {
    dispatch({ type: "reset", seed });
    overFired.current = false;
    setFlagMode(false);
  }, [seed]);

  // Live score emission
  useEffect(() => {
    onScoreChange?.(state.revealedCount);
  }, [state.revealedCount, onScoreChange]);

  // Fire onGameOver once when status resolves (won OR lost)
  useEffect(() => {
    if (state.status === "playing" || overFired.current) return;
    overFired.current = true;
    onGameOver(state.revealedCount);
  }, [state.status, state.revealedCount, onGameOver]);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (frozen || state.status !== "playing") return;
      if (flagMode) {
        dispatch({ type: "flag", row, col });
      } else {
        dispatch({ type: "reveal", row, col });
      }
    },
    [frozen, state.status, flagMode],
  );

  // Also accept right-click as flag (classic desktop UX) regardless of mode
  const handleCellContext = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      e.preventDefault();
      if (frozen || state.status !== "playing") return;
      dispatch({ type: "flag", row, col });
    },
    [frozen, state.status],
  );

  const minesLeft = MINE_COUNT - state.flagCount;
  const gameOver = state.status !== "playing";

  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-3">
      {/* Status row */}
      <div className="flex w-full items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
        <span>
          Revealed:{" "}
          <span className="font-mono text-neutral-200">
            {state.revealedCount}
          </span>{" "}
          / {NON_MINE_CELLS}
        </span>
        <span>
          Mines left:{" "}
          <span className="font-mono text-neutral-200">{minesLeft}</span>
        </span>
      </div>

      {/* Game status banner */}
      <div className="h-5 text-xs uppercase tracking-wider">
        {state.status === "won" && (
          <span className="text-emerald-400">Cleared ✓</span>
        )}
        {state.status === "lost" && (
          <span className="text-red-400">
            💥 Stepped on a mine — {state.revealedCount} revealed
          </span>
        )}
        {state.status === "playing" && (
          <span className="text-neutral-500">
            Tap to {flagMode ? "flag" : "reveal"} · right-click flags
          </span>
        )}
      </div>

      <Board
        board={state.board}
        gameOver={gameOver}
        disabled={frozen || gameOver}
        onClick={handleCellClick}
        onContextMenu={handleCellContext}
      />

      {/* Flag mode toggle — simpler than long-press detection on mobile */}
      <button
        type="button"
        onClick={() => setFlagMode((m) => !m)}
        disabled={frozen || gameOver}
        aria-pressed={flagMode}
        className={
          "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-40 " +
          (flagMode
            ? "border-skill bg-skill/20 text-skill"
            : "border-border bg-bg-elev text-neutral-200 hover:border-neutral-600")
        }
      >
        <span className="text-lg">🚩</span>
        Flag mode: {flagMode ? "ON" : "OFF"}
      </button>
    </div>
  );
}

// ─── Board ─────────────────────────────────────────────────────────────────

function Board({
  board,
  gameOver,
  disabled,
  onClick,
  onContextMenu,
}: {
  board: Cell[][];
  gameOver: boolean;
  disabled: boolean;
  onClick: (row: number, col: number) => void;
  onContextMenu: (e: React.MouseEvent, row: number, col: number) => void;
}) {
  return (
    <div className="ms-board" role="grid" aria-label="Minesweeper board">
      {board.map((row, r) =>
        row.map((cell, c) => (
          <CellView
            key={`${r}-${c}`}
            cell={cell}
            row={r}
            col={c}
            gameOver={gameOver}
            disabled={disabled}
            onClick={onClick}
            onContextMenu={onContextMenu}
          />
        )),
      )}
    </div>
  );
}

function CellView({
  cell,
  row,
  col,
  gameOver,
  disabled,
  onClick,
  onContextMenu,
}: {
  cell: Cell;
  row: number;
  col: number;
  gameOver: boolean;
  disabled: boolean;
  onClick: (row: number, col: number) => void;
  onContextMenu: (e: React.MouseEvent, row: number, col: number) => void;
}) {
  const classes = ["ms-cell"];
  let content = "";
  let ariaLabel = `cell ${row},${col}`;

  if (cell.state === "revealed") {
    classes.push("revealed");
    if (cell.isMine) {
      classes.push("mine");
      content = "💣";
      ariaLabel = `cell ${row},${col} mine`;
    } else if (cell.adjacentMines > 0) {
      classes.push(`n-${cell.adjacentMines}`);
      content = String(cell.adjacentMines);
      ariaLabel = `cell ${row},${col} ${cell.adjacentMines}`;
    }
  } else if (cell.state === "flagged") {
    classes.push("flagged");
    content = "🚩";
    ariaLabel = `cell ${row},${col} flagged`;
  } else {
    classes.push("hidden");
    ariaLabel = `cell ${row},${col} hidden`;
  }

  return (
    <button
      type="button"
      data-row={row}
      data-col={col}
      className={classes.join(" ")}
      aria-label={ariaLabel}
      disabled={disabled || cell.state === "revealed"}
      onClick={() => onClick(row, col)}
      onContextMenu={(e) => onContextMenu(e, row, col)}
    >
      {content}
    </button>
  );
}
