import { ImageResponse } from "next/og";
import { gameOgTemplate } from "@skillbase/ui";

export const runtime = "nodejs";
export const alt = "Skillbase Match 3 — skill-based on Base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function og() {
  return new ImageResponse(
    gameOgTemplate({ title: "Match 3", glyph: <GemGrid /> }),
    size,
  );
}

type Color = "red" | "blue" | "purple" | "green" | "gold";

const ROWS: Color[][] = [
  ["red",    "red",    "red",    "blue"],
  ["purple", "blue",   "green",  "green"],
  ["gold",   "purple", "blue",   "red"],
  ["green",  "gold",   "purple", "blue"],
];

const COLOR: Record<Color, { fill: string; glow: string }> = {
  red:    { fill: "#EF4444", glow: "rgba(239,68,68,0.55)" },
  blue:   { fill: "#3B82F6", glow: "rgba(59,130,246,0.5)" },
  purple: { fill: "#A855F7", glow: "rgba(168,85,247,0.5)" },
  green:  { fill: "#22C55E", glow: "rgba(34,197,94,0.5)" },
  gold:   { fill: "#DDAC2F", glow: "rgba(221,172,47,0.55)" },
};

function Gem({ color, glow }: { color: Color; glow: boolean }) {
  const c = COLOR[color];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 70,
        height: 70,
        background: "#15151A",
        borderRadius: 10,
        boxShadow: glow ? `0 0 22px ${c.glow}` : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 50,
          height: 50,
          background: c.fill,
          clipPath: "polygon(50% 0, 100% 35%, 80% 100%, 20% 100%, 0 35%)",
        }}
      />
    </div>
  );
}

function GemGrid() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: 320,
        height: 320,
        padding: 12,
        borderRadius: 16,
        background: "#0F0F10",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {ROWS.map((row, r) => (
        <div key={r} style={{ display: "flex", gap: 8, flex: "1 1 0" }}>
          {row.map((color, c) => (
            <Gem key={c} color={color} glow={r === 0 && c < 3} />
          ))}
        </div>
      ))}
    </div>
  );
}
