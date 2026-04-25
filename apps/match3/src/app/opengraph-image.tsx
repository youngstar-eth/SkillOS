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

// 4×4 of gems. Top row "match-3 about to fire" (three reds).
const GEMS: Array<"red" | "blue" | "purple" | "green" | "gold"> = [
  "red",    "red",    "red",    "blue",
  "purple", "blue",   "green",  "green",
  "gold",   "purple", "blue",   "red",
  "green",  "gold",   "purple", "blue",
];

const COLOR: Record<string, { fill: string; glow: string }> = {
  red:    { fill: "#EF4444", glow: "rgba(239,68,68,0.55)" },
  blue:   { fill: "#3B82F6", glow: "rgba(59,130,246,0.5)" },
  purple: { fill: "#A855F7", glow: "rgba(168,85,247,0.5)" },
  green:  { fill: "#22C55E", glow: "rgba(34,197,94,0.5)" },
  gold:   { fill: "#DDAC2F", glow: "rgba(221,172,47,0.55)" },
};

function GemGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        width: 320,
        height: 320,
        padding: 12,
        borderRadius: 16,
        background: "#0F0F10",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {GEMS.map((g, i) => {
        const c = COLOR[g];
        const isMatchRow = i < 3;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#15151A",
              borderRadius: 10,
              boxShadow: isMatchRow ? `0 0 22px ${c.glow}` : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                width: 50,
                height: 50,
                background: c.fill,
                clipPath:
                  "polygon(50% 0, 100% 35%, 80% 100%, 20% 100%, 0 35%)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
