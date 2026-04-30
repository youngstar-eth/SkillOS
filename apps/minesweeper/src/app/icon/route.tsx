import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Renders the canonical apex game tile (also the eyebrow tile).
// SVG kept inline so this file is the single source of truth that
// matches /public/minesweeper.svg byte-for-byte.

export const runtime = "nodejs";

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect x="0" y="0" width="64" height="64" rx="10" fill="#141414" stroke="#262626"></rect>
  <g stroke="#FFC72C" stroke-width="1.5" fill="none">
    <rect x="14" y="14" width="36" height="36" rx="2"></rect>
    <line x1="14" y1="26" x2="50" y2="26"></line>
    <line x1="14" y1="38" x2="50" y2="38"></line>
    <line x1="26" y1="14" x2="26" y2="50"></line>
    <line x1="38" y1="14" x2="38" y2="50"></line>
  </g>
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
