"use client";

import type { MouseEvent, TouchEvent } from "react";
import { useRef } from "react";
import type { Cell } from "@/lib/game/types";

interface CellButtonProps {
  cell: Cell;
  row: number;
  col: number;
  size: number;
  /** Called on left-click / tap. */
  onReveal: (row: number, col: number) => void;
  /** Called on right-click / long-press. */
  onFlag: (row: number, col: number) => void;
  /** When true the whole board goes non-interactive (game over / won). */
  locked: boolean;
  /** The cell that exploded — highlighted red on game-over. */
  exploded: boolean;
}

const LONG_PRESS_MS = 350;

export function CellButton({
  cell,
  row,
  col,
  size,
  onReveal,
  onFlag,
  locked,
  exploded,
}: CellButtonProps) {
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const handleClick = () => {
    if (locked || longPressed.current) return;
    if (cell.state === "flagged") return; // prevent accidental uncover
    onReveal(row, col);
  };

  const handleContext = (e: MouseEvent) => {
    e.preventDefault();
    if (locked) return;
    onFlag(row, col);
  };

  const handleTouchStart = () => {
    if (locked) return;
    longPressed.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      onFlag(row, col);
    }, LONG_PRESS_MS);
  };

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    clearLongPress();
    // Long press already fired flag; suppress the ensuing click.
    if (longPressed.current) e.preventDefault();
  };

  const base = "flex items-center justify-center select-none font-bold";
  let className = base;
  let content: React.ReactNode = "";

  if (cell.state === "revealed") {
    if (cell.isMine) {
      className += exploded
        ? " bg-danger text-black border border-[rgb(var(--color-border-dark))]"
        : " bg-surface text-black border border-[rgb(var(--color-border-dark))]";
      content = "💣";
    } else {
      className += " bg-surface border border-[rgb(var(--color-border-dark))]";
      if (cell.adjacentMines > 0) {
        className += ` num-${cell.adjacentMines}`;
        content = cell.adjacentMines;
      }
    }
  } else {
    // Hidden / flagged / question all share the raised Win98 button.
    className += " win-raised active:win-pressed text-[13px] leading-none";
    if (cell.state === "flagged") content = <span className="text-[rgb(var(--color-accent-2))]">🚩</span>;
    else if (cell.state === "question") content = "❓";
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={handleContext}
      onTouchStart={handleTouchStart}
      onTouchMove={clearLongPress}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={clearLongPress}
      style={{ width: size, height: size, lineHeight: 1 }}
      className={className}
      aria-label={`cell ${row},${col} ${cell.state}`}
      disabled={locked}
      data-testid={`cell-${row}-${col}`}
    >
      {content}
    </button>
  );
}
