import { ImageResponse } from "next/og";
import { gameOgTemplate } from "@skillbase/ui";

export const runtime = "nodejs";
export const alt = "Skillbase Clicker — skill-based on Base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function og() {
  return new ImageResponse(
    gameOgTemplate({ title: "Clicker", glyph: <Counter /> }),
    size,
  );
}

function Counter() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        width: 320,
        height: 320,
        padding: 24,
        borderRadius: 24,
        background: "rgba(0,0,0,0.45)",
        border: "1px solid rgba(255,255,255,0.06)",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: 22,
          color: "#A1A1AA",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        TAPS
      </div>
      <div
        style={{
          fontSize: 96,
          fontWeight: 800,
          color: "#DDAC2F",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        1,337
      </div>
      <div
        style={{
          fontSize: 18,
          color: "#22C55E",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        +1
      </div>
      {/* Cursor pointer (CSS triangle) */}
      <div
        style={{
          position: "absolute",
          bottom: 26,
          right: 32,
          display: "flex",
          width: 28,
          height: 36,
          background: "#FFFFFF",
          clipPath:
            "polygon(0 0, 0 78%, 26% 60%, 50% 100%, 64% 92%, 42% 56%, 78% 56%)",
        }}
      />
    </div>
  );
}
