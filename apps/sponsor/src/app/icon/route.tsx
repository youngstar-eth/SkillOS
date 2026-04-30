import { ImageResponse } from "next/og";

// 512×512 favicon. Renders the canonical pixel SB monogram on ink:
// 7×5 cell grid, gold S left (cols 0–2), blue E right (cols 3–6).
// Centered inside a 512×512 square, padded with ink.

export const runtime = "nodejs";

const SIZE = 512;
const CELL = 64;
const MARK_W = 7 * CELL;
const MARK_H = 5 * CELL;
const OFFSET_X = (SIZE - MARK_W) / 2;
const OFFSET_Y = (SIZE - MARK_H) / 2;

const GOLD = "#FFC72C";
const BLUE = "#0052FF";
const INK = "#0a0a0a";

type CellRect = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  fill: string;
};

const CELLS: readonly CellRect[] = [
  // Gold S (cols 0–2)
  { x: 0, y: 0, w: 3, h: 1, fill: GOLD },
  { x: 0, y: 1, w: 1, h: 1, fill: GOLD },
  { x: 0, y: 2, w: 3, h: 1, fill: GOLD },
  { x: 0, y: 4, w: 3, h: 1, fill: GOLD },
  // Blue E (cols 3–6)
  { x: 3, y: 0, w: 3, h: 1, fill: BLUE },
  { x: 3, y: 1, w: 1, h: 1, fill: BLUE },
  { x: 6, y: 1, w: 1, h: 1, fill: BLUE },
  { x: 3, y: 2, w: 3, h: 1, fill: BLUE },
  { x: 3, y: 3, w: 1, h: 1, fill: BLUE },
  { x: 6, y: 3, w: 1, h: 1, fill: BLUE },
  { x: 3, y: 4, w: 3, h: 1, fill: BLUE },
];

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: INK,
          display: "flex",
          position: "relative",
        }}
      >
        {CELLS.map((c, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: OFFSET_X + c.x * CELL,
              top: OFFSET_Y + c.y * CELL,
              width: (c.w ?? 1) * CELL,
              height: (c.h ?? 1) * CELL,
              background: c.fill,
            }}
          />
        ))}
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
