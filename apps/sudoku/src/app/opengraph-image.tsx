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

// Top row of an iconic sudoku puzzle — first 9 cells.
const TOP_ROW: Array<string | null> = [
  "5", "3", null, null, "7", null, null, null, null,
];

function Cell({ value, key }: { value: string | null; key: number }) {
  return (
    <div
      key={key}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        background: "#15151A",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 3,
        color: value ? "#DDAC2F" : "#3A3A40",
        fontSize: 18,
        fontWeight: 600,
      }}
    >
      {value ?? "·"}
    </div>
  );
}

function Box({ values }: { values: Array<string | null> }) {
  // 3×3 box rendered as 3 horizontal rows of 3 cells.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 4,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 6,
      }}
    >
      {[0, 1, 2].map((r) => (
        <div key={r} style={{ display: "flex", gap: 2 }}>
          {[0, 1, 2].map((c) => (
            <Cell key={r * 3 + c} value={values[r * 3 + c] ?? null} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SudokuGrid() {
  // Show 3 boxes across the top row, only first one populated.
  const boxes: Array<Array<string | null>> = [
    TOP_ROW.slice(0, 9), // box 1: top-left 3×3 = first row of puzzle
    Array(9).fill(null),
    Array(9).fill(null),
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        width: 320,
        height: 320,
        padding: 10,
        borderRadius: 16,
        background: "#0F0F10",
        border: "1px solid rgba(255,255,255,0.08)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {[0, 1, 2].map((r) => (
        <div key={r} style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map((c) => (
            <Box key={r * 3 + c} values={r === 0 ? boxes[c] : Array(9).fill(null)} />
          ))}
        </div>
      ))}
    </div>
  );
}
