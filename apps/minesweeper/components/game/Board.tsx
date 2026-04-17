"use client";

import { CellButton } from "./CellButton";
import type { MinesweeperState } from "@/lib/game/types";

interface BoardProps {
  state: MinesweeperState;
  cellSize: number;
  onReveal: (row: number, col: number) => void;
  onFlag: (row: number, col: number) => void;
  /** Cell that ended the game (if any) — highlighted red. */
  exploded: [number, number] | null;
}

export function Board({
  state,
  cellSize,
  onReveal,
  onFlag,
  exploded,
}: BoardProps) {
  const locked = state.status === "won" || state.status === "lost";
  return (
    <div
      className="win-inset inline-block p-1"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${state.cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${state.rows}, ${cellSize}px)`,
        }}
      >
        {state.board.map((row, r) =>
          row.map((cell, c) => (
            <CellButton
              key={`${r}-${c}`}
              cell={cell}
              row={r}
              col={c}
              size={cellSize}
              onReveal={onReveal}
              onFlag={onFlag}
              locked={locked}
              exploded={
                !!exploded && exploded[0] === r && exploded[1] === c
              }
            />
          )),
        )}
      </div>
    </div>
  );
}
