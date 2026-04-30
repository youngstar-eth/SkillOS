import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Renders the canonical apex game tile (also the eyebrow tile).
// SVG kept inline so this file is the single source of truth that
// matches /public/match3.svg byte-for-byte.

export const runtime = "nodejs";

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect x="0" y="0" width="64" height="64" rx="10" fill="#141414" stroke="#262626"></rect>
  <circle cx="22" cy="22" r="6" fill="#FFC72C"></circle>
  <circle cx="42" cy="22" r="6" fill="#fafafa" opacity="0.4"></circle>
  <circle cx="22" cy="42" r="6" fill="#fafafa" opacity="0.4"></circle>
  <circle cx="42" cy="42" r="6" fill="#FFC72C"></circle>
</svg>`;

const TILE_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(TILE_SVG).toString("base64")}`;

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TILE_DATA_URI} width={380} height={380} alt="" />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
