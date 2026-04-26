import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Wordle variant — single letter tile, Wordle-green on dark.

export const runtime = "nodejs";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 380,
            height: 380,
            borderRadius: 24,
            background: "#6aaa64",
            color: "#ffffff",
            fontSize: 240,
            fontWeight: 800,
          }}
        >
          S
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
