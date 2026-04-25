import { ImageResponse } from "next/og";
import { gameOgTemplate } from "@skillbase/ui";

export const runtime = "nodejs";
export const alt = "Skillbase Minesweeper — skill-based on Base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function og() {
  return new ImageResponse(
    gameOgTemplate({ title: "Minesweeper", glyph: <MinesGrid /> }),
    size,
  );
}

type Cell =
  | { kind: "covered" }
  | { kind: "flag" }
  | { kind: "number"; n: 1 | 2 | 3 }
  | { kind: "blank" };

const NUM_COLOR: Record<1 | 2 | 3, string> = {
  1: "#3B82F6",
  2: "#22C55E",
  3: "#EF4444",
};

const GRID: Cell[] = [
  { kind: "number", n: 1 }, { kind: "number", n: 2 }, { kind: "flag" },     { kind: "covered" },
  { kind: "blank" },         { kind: "number", n: 1 }, { kind: "number", n: 2 }, { kind: "covered" },
  { kind: "blank" },         { kind: "blank" },         { kind: "number", n: 1 }, { kind: "covered" },
  { kind: "blank" },         { kind: "blank" },         { kind: "blank" },         { kind: "covered" },
];

function MinesGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 4,
        width: 320,
        height: 320,
        padding: 10,
        borderRadius: 16,
        background: "#0F0F10",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {GRID.map((cell, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              cell.kind === "covered"
                ? "#26262C"
                : cell.kind === "flag"
                  ? "#1A1A1F"
                  : "#0E0E12",
            border:
              cell.kind === "covered"
                ? "2px solid rgba(255,255,255,0.18)"
                : "1px solid rgba(255,255,255,0.05)",
            borderRadius: 6,
            color:
              cell.kind === "number" ? NUM_COLOR[cell.n] : "transparent",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          {cell.kind === "number" && String(cell.n)}
          {cell.kind === "flag" && (
            <div
              style={{
                display: "flex",
                width: 20,
                height: 24,
                background: "#EF4444",
                clipPath: "polygon(0 0, 100% 50%, 0 100%)",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
