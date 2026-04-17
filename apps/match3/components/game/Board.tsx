"use client";

import { Gem } from "./Gem";
import type { Match3State } from "@/lib/game/types";

interface BoardProps {
  state: Match3State;
  onCellClick: (row: number, col: number) => void;
}

export function Board({ state, onCellClick }: BoardProps) {
  const { grid, selected, status } = state;
  const disabled = status !== "playing";

  return (
    <div
      className="grid gap-1 rounded-2xl border border-border bg-surface p-2 shadow-lg"
      style={{
        gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))`,
        width: "min(92vw, 480px)",
      }}
      aria-label="Match 3 board"
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const isSelected = !!selected && selected[0] === r && selected[1] === c;
          return (
            <Gem
              key={cell.id || `${r}-${c}`}
              color={cell.color}
              isSelected={isSelected}
              onClick={() => onCellClick(r, c)}
              disabled={disabled}
            />
          );
        }),
      )}
    </div>
  );
}
