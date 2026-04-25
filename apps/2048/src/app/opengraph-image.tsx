import { ImageResponse } from "next/og";
import { gameOgTemplate } from "@skillbase/ui";

export const runtime = "nodejs";
export const alt = "Skillbase 2048 — skill-based on Base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function og() {
  return new ImageResponse(
    gameOgTemplate({ title: "2048", glyph: <Grid2048 /> }),
    size,
  );
}

// Classic 2048 palette — high-saturation versions for OG legibility.
const TILES: Array<{ value: number | null; bg: string; fg: string }> = [
  { value: 2,    bg: "#3D3A33", fg: "#EEE4DA" },
  { value: 4,    bg: "#4A4338", fg: "#EDE0C8" },
  { value: 16,   bg: "#F59563", fg: "#0A0A0A" },
  { value: 64,   bg: "#F65E3B", fg: "#FFFFFF" },
  { value: 8,    bg: "#F2B179", fg: "#0A0A0A" },
  { value: null, bg: "#1B1B1B", fg: "transparent" },
  { value: 128,  bg: "#EDCF72", fg: "#0A0A0A" },
  { value: 256,  bg: "#EDCC61", fg: "#0A0A0A" },
  { value: 32,   bg: "#F67C5F", fg: "#FFFFFF" },
  { value: 512,  bg: "#EDC850", fg: "#0A0A0A" },
  { value: null, bg: "#1B1B1B", fg: "transparent" },
  { value: 1024, bg: "#EDC53F", fg: "#0A0A0A" },
  { value: null, bg: "#1B1B1B", fg: "transparent" },
  { value: null, bg: "#1B1B1B", fg: "transparent" },
  { value: null, bg: "#1B1B1B", fg: "transparent" },
  { value: 2048, bg: "#EDC22E", fg: "#0A0A0A" },
];

function Grid2048() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        width: 320,
        height: 320,
        padding: 10,
        borderRadius: 16,
        background: "#0F0F10",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {TILES.map((t, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: t.bg,
            color: t.fg,
            borderRadius: 8,
            fontWeight: 700,
            fontSize: t.value && t.value >= 1000 ? 22 : t.value && t.value >= 100 ? 26 : 32,
            letterSpacing: "-0.02em",
          }}
        >
          {t.value ?? ""}
        </div>
      ))}
    </div>
  );
}
