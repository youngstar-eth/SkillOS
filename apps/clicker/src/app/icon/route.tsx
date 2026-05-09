import { ImageResponse } from "next/og";

// 512×512 brand icon. SkillOS rebrand: pure-typography uppercase "S"
// centered on pitch black, white. Mirrors apex /icon (the canonical
// source-of-truth) byte-for-byte so every Mini App carries the same
// brand mark. No per-game tile in the icon — that lives in OG/splash.

export const runtime = "nodejs";

const SIZE = 512;
const INK = "#08090a";
const PORCELAIN = "#ffffff";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: INK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 360,
            fontWeight: 700,
            color: PORCELAIN,
            letterSpacing: "-0.022em",
            lineHeight: 1,
            // Visual centering: cap-height baseline shifts the glyph
            // slightly above geometric center, so push down ~5%.
            transform: "translateY(2.5%)",
          }}
        >
          S
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
