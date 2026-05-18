"use client";

/**
 * Match-3 duel game component.
 *
 * Props contract matches Game2048 / GameWordle / GameSudoku /
 * GameMinesweeper / GameClicker — duel/[id] swaps in with a single
 * import change:
 *   seed:           bytes32 hex — determines starting board + refill RNG
 *   onGameOver:     NEVER fires here. Timer-expire in duel/[id] is the
 *                   only finalization; the engine has no natural end
 *                   state (movesLeft was dropped).
 *   onScoreChange:  emits state.score on every change — duel/[id]'s
 *                   ScoreCard shows your progress as cascades resolve
 *   frozen:         external kill-switch (disables input)
 *
 * Scoring: accumulator. Each cascade step scores `matchedCells × 10 ×
 * chainDepth`. A 3-match at chain 1 is 30; a 3-match immediately after
 * in the same cascade is 60 (chain 2); then 90, 120, … Skill here is
 * setting up deep cascades.
 *
 * Swap rule — classic: illegal swaps (non-adjacent or no match created)
 * are rejected with a shake animation; the board doesn't change and the
 * turn isn't "used". Modern-casual "allow any swap, score nothing" is
 * available by removing the swap()'s null return path — chose classic
 * because duel is a skill contest.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  COLS,
  ROWS,
  clearSelection,
  createInitialState,
  resolve,
  selectCell as selectCellFn,
  swap as swapFn,
} from "@/lib/match3/engine";
import type { Cell, Match3State } from "@/lib/match3/types";

type Props = {
  seed: string;
  onGameOver: (score: number) => void;
  onScoreChange?: (score: number) => void;
  /**
   * X20.0a — emits successful swap count (one per dispatched `swap`
   * action) for AntiCheat F0 (X20.0b). Invalid swaps that get shaken-
   * rejected don't count; selection clicks don't count.
   */
  onMovesChange?: (moves: number) => void;
  frozen?: boolean;
};

type Action =
  | { type: "reset"; seed: string }
  | { type: "select"; row: number; col: number }
  | { type: "deselect" }
  | { type: "swap"; a: [number, number]; b: [number, number] }
  | { type: "resolve" };

function reduce(state: Match3State, action: Action): Match3State {
  switch (action.type) {
    case "reset":
      return createInitialState(action.seed);
    case "select":
      return selectCellFn(state, action.row, action.col);
    case "deselect":
      return clearSelection(state);
    case "swap": {
      const next = swapFn(state, action.a, action.b);
      return next ?? state;
    }
    case "resolve":
      return resolve(state);
  }
}

export function GameMatch3({
  seed,
  onGameOver: _onGameOver,
  onScoreChange,
  onMovesChange,
  frozen,
}: Props) {
  const [state, dispatch] = useReducer(reduce, seed, createInitialState);
  const [invalidFlash, setInvalidFlash] = useState<string | null>(null);
  // X20.0a — successful swap count.
  const movesRef = useRef(0);

  // Reset on seed change
  useEffect(() => {
    dispatch({ type: "reset", seed });
    setInvalidFlash(null);
    movesRef.current = 0;
  }, [seed]);

  // Emit live score
  useEffect(() => {
    onScoreChange?.(state.score);
  }, [state.score, onScoreChange]);

  // Drive the cascade: when status flips to "resolving", run resolve().
  // Resolution is synchronous in the engine, but we hop through a
  // micro-task so React can paint the pre-resolve swap before the
  // gems vanish and refill — gives the player a visual "swap took".
  useEffect(() => {
    if (state.status !== "resolving") return;
    const timer = setTimeout(() => {
      dispatch({ type: "resolve" });
    }, 180);
    return () => clearTimeout(timer);
  }, [state.status]);

  const flashInvalid = useCallback((r: number, c: number) => {
    const key = `${r},${c}`;
    setInvalidFlash(key);
    setTimeout(() => setInvalidFlash((cur) => (cur === key ? null : cur)), 300);
  }, []);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (frozen || state.status !== "playing") return;
      const sel = state.selected;
      if (!sel) {
        dispatch({ type: "select", row, col });
        return;
      }
      if (sel[0] === row && sel[1] === col) {
        // Tap again to deselect.
        dispatch({ type: "deselect" });
        return;
      }
      // Attempt swap if adjacent.
      const isAdj =
        Math.abs(sel[0] - row) + Math.abs(sel[1] - col) === 1;
      if (!isAdj) {
        // Non-adjacent — re-select as new anchor.
        dispatch({ type: "select", row, col });
        return;
      }
      // Adjacent — try the swap. If invalid (no match), shake both.
      const tentative = swapFn(state, sel, [row, col]);
      if (!tentative) {
        flashInvalid(row, col);
        flashInvalid(sel[0], sel[1]);
        dispatch({ type: "deselect" });
        return;
      }
      dispatch({ type: "swap", a: sel, b: [row, col] });
      // X20.0a — count only successful swaps. Invalid swaps return above
      // and don't increment.
      movesRef.current += 1;
      onMovesChange?.(movesRef.current);
    },
    [frozen, state, flashInvalid, onMovesChange],
  );

  const resolving = state.status === "resolving";

  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-3">
      {/* Status row */}
      <div className="flex w-full items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
        <span>
          Matches:{" "}
          <span className="font-mono text-neutral-200">{state.totalMatches}</span>
        </span>
        {state.combo > 1 && (
          <span className="text-skill">Combo ×{state.combo}</span>
        )}
        <span>
          Best chain:{" "}
          <span className="font-mono text-neutral-200">{state.maxCombo}</span>
        </span>
      </div>

      <Board
        grid={state.grid}
        selected={state.selected}
        invalidFlash={invalidFlash}
        disabled={frozen || resolving}
        onClick={handleCellClick}
      />

      <p className="text-center text-xs text-neutral-500">
        Tap two adjacent gems to swap. Only swaps that create a 3+
        line count. Cascades score more — set up combos.
      </p>
    </div>
  );
}

// ─── Board ─────────────────────────────────────────────────────────────────

function Board({
  grid,
  selected,
  invalidFlash,
  disabled,
  onClick,
}: {
  grid: Cell[][];
  selected: [number, number] | null;
  invalidFlash: string | null;
  disabled: boolean;
  onClick: (row: number, col: number) => void;
}) {
  return (
    <div className="m3-board" role="grid" aria-label="Match-3 board">
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const isSel = !!selected && selected[0] === r && selected[1] === c;
          const key = `${r},${c}`;
          return (
            <Gem
              key={cell.id}
              cell={cell}
              row={r}
              col={c}
              isSelected={isSel}
              invalid={invalidFlash === key}
              disabled={disabled}
              onClick={onClick}
            />
          );
        }),
      )}
    </div>
  );
}

function Gem({
  cell,
  row,
  col,
  isSelected,
  invalid,
  disabled,
  onClick,
}: {
  cell: Cell;
  row: number;
  col: number;
  isSelected: boolean;
  invalid: boolean;
  disabled: boolean;
  onClick: (row: number, col: number) => void;
}) {
  const classes = ["m3-gem"];
  if (cell.color) classes.push(cell.color);
  else classes.push("empty");
  if (isSelected) classes.push("selected");
  if (invalid) classes.push("invalid");

  // Enforce 8×8 guard for safety — renders never get row/col beyond grid.
  if (row >= ROWS || col >= COLS) return null;

  return (
    <button
      type="button"
      className={classes.join(" ")}
      data-row={row}
      data-col={col}
      disabled={disabled || cell.color === null}
      onClick={() => onClick(row, col)}
      aria-label={`gem ${row},${col}${cell.color ? " " + cell.color : " empty"}`}
    />
  );
}
