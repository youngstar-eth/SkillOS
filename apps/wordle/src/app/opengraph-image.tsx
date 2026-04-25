import { ImageResponse } from "next/og";
import { gameOgTemplate } from "@skillbase/ui";

export const runtime = "nodejs";
export const alt = "Skillbase Wordle — skill-based on Base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function og() {
  return new ImageResponse(
    gameOgTemplate({ title: "Wordle", glyph: <WordleRow /> }),
    size,
  );
}

const ROW: Array<{ letter: string; state: "hit" | "near" | "miss" | "empty" }> = [
  { letter: "S", state: "hit" },
  { letter: "K", state: "hit" },
  { letter: "I", state: "near" },
  { letter: "L", state: "miss" },
  { letter: "L", state: "empty" },
];

const COLOR: Record<string, { bg: string; border: string; fg: string }> = {
  hit:   { bg: "#15803D", border: "#15803D", fg: "#FFFFFF" },
  near:  { bg: "#CA8A04", border: "#CA8A04", fg: "#0A0A0A" },
  miss:  { bg: "#1F1F22", border: "#1F1F22", fg: "#A1A1AA" },
  empty: { bg: "transparent", border: "rgba(255,255,255,0.18)", fg: "#FFFFFF" },
};

function WordleRow() {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: 16,
        borderRadius: 16,
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {ROW.map((tile, i) => {
        const c = COLOR[tile.state];
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 60,
              height: 60,
              background: c.bg,
              border: `2px solid ${c.border}`,
              borderRadius: 8,
              color: c.fg,
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {tile.state === "empty" ? "" : tile.letter}
          </div>
        );
      })}
    </div>
  );
}
