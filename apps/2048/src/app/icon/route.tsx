import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Renders the canonical apex 2048 tile (also the eyebrow tile).
//
// Implementation note: Satori (next/og's renderer) doesn't reliably
// rasterize <text> inside an embedded SVG, so the tile geometry is
// reproduced with Satori-native primitives (divs + inline styles).
// Public asset /2048.svg keeps the SVG-text version for the eyebrow,
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
            width: 380,
            height: 380,
            borderRadius: 59,
            background: "#141414",
            border: "6px solid #262626",
            color: "#FFC72C",
            fontSize: 107,
            fontWeight: 500,
            letterSpacing: -3,
          }}
        >
          2048
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
