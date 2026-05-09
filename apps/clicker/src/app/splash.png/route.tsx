import { ImageResponse } from "next/og";

// 512×512 Mini App launch splash. SkillOS rebrand: uppercase "S"
// centered on pitch black, white. Mirrors apex /splash.png with a
// small per-game annotation underneath ("skillos / clicker") so the
// host client (Base App / Warpcast) can disambiguate which game is
// loading without breaking the unified brand mark.

export const runtime = "nodejs";

const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';

const INK = "#08090a";
const PORCELAIN = "#f7f8f8";
const STORM = "#9ca3af";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: INK,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: SANS,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 320,
            fontWeight: 700,
            color: PORCELAIN,
            letterSpacing: "-0.022em",
            lineHeight: 1,
          }}
        >
          S
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontFamily: MONO,
            fontSize: 22,
            color: STORM,
            fontWeight: 500,
            letterSpacing: "0.16em",
          }}
        >
          skillos / clicker
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
