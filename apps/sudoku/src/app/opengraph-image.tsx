import { ImageResponse } from "next/og";
import { gameOgTemplate } from "@skillbase/ui";

export const runtime = "nodejs";
export const alt = "Skillbase Sudoku — skill-based on Base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function og() {
  return new ImageResponse(
    gameOgTemplate({ title: "Sudoku", glyph: <SudokuGrid /> }),
    size,
  );
}

// 9-cell row-major layout — first 9 of an iconic top-row hint.
//   5 3 .   . 7 .   . . .
const CELLS: Array<string | null> = [
  "5", "3", null, null, "7", null, null, null, null,
];

function SudokuGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 4,
        width: 320,
        height: 320,
        padding: 10,
        borderRadius: 16,
        background: "#0F0F10",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((box) => (
        <div
          key={box}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 2,
            padding: 4,
            background: "rgba(255,255,255,0.02)",
            borderRadius: 6,
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((cell) => {
            const idx = box === 0 ? cell : -1;
            const value = idx >= 0 ? CELLS[idx] : null;
            return (
              <div
                key={cell}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#15151A",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 3,
                  color: value ? "#DDAC2F" : "transparent",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {value ?? "·"}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
