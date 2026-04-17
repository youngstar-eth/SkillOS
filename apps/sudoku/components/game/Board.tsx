"use client";

import { useMemo } from "react";
import { Cell } from "./Cell";
import { getConflicts } from "@/lib/game/engine";
import type { SudokuState } from "@/lib/game/types";

interface BoardProps {
  state: SudokuState;
  onSelect: (row: number, col: number) => void;
  /** Brief post-solve flash highlight (1–2 ticks). */
  solvedFlash: boolean;
}

/** True iff (r1,c1) and (r2,c2) share a row, column, or 3×3 box. */
function isPeer(r1: number, c1: number, r2: number, c2: number): boolean {
  if (r1 === r2) return true;
  if (c1 === c2) return true;
  if (
    Math.floor(r1 / 3) === Math.floor(r2 / 3) &&
    Math.floor(c1 / 3) === Math.floor(c2 / 3)
  )
    return true;
  return false;
}

export function Board({ state, onSelect, solvedFlash }: BoardProps) {
  const conflicts = useMemo(() => getConflicts(state.grid), [state.grid]);
  const sel = state.selectedCell;
  const selValue =
    sel !== null ? state.grid[sel[0]][sel[1]].value : null;

  return (
    <div className="sudoku-board" role="grid" aria-label="Sudoku board">
      {state.grid.map((row, r) =>
        row.map((cell, c) => (
          <Cell
            key={`${r}-${c}`}
            cell={cell}
            row={r}
            col={c}
            isSelected={!!sel && sel[0] === r && sel[1] === c}
            isPeer={!!sel && !(sel[0] === r && sel[1] === c) && isPeer(sel[0], sel[1], r, c)}
            isSameNumber={
              !!sel &&
              selValue !== null &&
              cell.value === selValue &&
              !(sel[0] === r && sel[1] === c)
            }
            hasConflict={conflicts.has(`${r},${c}`)}
            solvedFlash={solvedFlash && !cell.isGiven}
            onSelect={onSelect}
          />
        )),
      )}
    </div>
  );
}
