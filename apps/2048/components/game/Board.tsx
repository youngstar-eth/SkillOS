import { Tile } from "./Tile";
import type { Grid } from "@/lib/game/types";

export function Board({ grid }: { grid: Grid }) {
  return (
    <div
      aria-label="2048 game board"
      role="grid"
      className="grid grid-cols-4 grid-rows-4 gap-1b bg-fg/10 p-1b"
      style={{
        width: "min(90vw, calc(90vh - 200px), 500px)",
        aspectRatio: "1 / 1",
        touchAction: "none",
      }}
    >
      {grid.map((row, r) =>
        row.map((value, c) => (
          <Tile key={`${r}-${c}-${value ?? "empty"}`} value={value} />
        )),
      )}
    </div>
  );
}
