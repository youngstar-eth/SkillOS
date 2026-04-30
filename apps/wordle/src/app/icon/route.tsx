import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Renders the canonical apex wordle tile (also the eyebrow tile).
//
// Implementation note: Satori (next/og's renderer) doesn't reliably
// rasterize <text> inside an embedded SVG, so the tile geometry is
// reproduced with Satori-native primitives (divs + inline styles).
// Public asset /wordle.svg keeps the SVG-text version for the eyebrow,
// where the browser is the renderer.

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
            gap: 6,
            width: 380,
            height: 380,
            borderRadius: 59,
            background: "#141414",
            border: "6px solid #262626",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 83,
              height: 119,
              background: "#FFC72C",
              color: "#0a0a0a",
              fontSize: 83,
              fontWeight: 500,
            }}
          >
            A
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 83,
              height: 119,
              border: "4px solid #262626",
              color: "#fafafa",
              fontSize: 83,
              fontWeight: 500,
            }}
          >
            B
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 83,
              height: 119,
              border: "4px solid #262626",
              color: "#fafafa",
              fontSize: 83,
              fontWeight: 500,
            }}
          >
            C
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
