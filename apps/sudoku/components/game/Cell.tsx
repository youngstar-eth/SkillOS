"use client";

import type { SudokuCell } from "@/lib/game/types";

interface CellProps {
  cell: SudokuCell;
  row: number;
  col: number;
  isSelected: boolean;
  /** Row/col/box peers of the selected cell. */
  isPeer: boolean;
  /** Matches the value of the selected cell. */
  isSameNumber: boolean;
  hasConflict: boolean;
  solvedFlash: boolean;
  onSelect: (row: number, col: number) => void;
}

export function Cell({
  cell,
  row,
  col,
  isSelected,
  isPeer,
  isSameNumber,
  hasConflict,
  solvedFlash,
  onSelect,
}: CellProps) {
  const classes = ["sudoku-cell"];
  if (cell.isGiven) classes.push("given");
  else if (cell.value !== null) classes.push("user");
  if (hasConflict) classes.push("conflict");
  else if (isSelected) classes.push("selected");
  else if (isSameNumber) classes.push("same-number");
  else if (isPeer) classes.push("peer");
  if (solvedFlash) classes.push("solved");

  return (
    <button
      type="button"
      onClick={() => onSelect(row, col)}
      data-row={row}
      data-col={col}
      className={classes.join(" ")}
      aria-label={`cell ${row},${col}${cell.value !== null ? " = " + cell.value : ""}`}
    >
      {cell.value !== null ? (
        cell.value
      ) : cell.notes.size > 0 ? (
        <div className="notes">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <span key={n}>{cell.notes.has(n) ? n : ""}</span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
