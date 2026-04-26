import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Minesweeper variant — revealed cell with adjacent-mine count, classic blue
// digit on a light surface (legacy Minesweeper convention).

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
            background: "#d4d4d4",
            color: "#1976d2",
            fontSize: 280,
            fontWeight: 800,
            boxShadow: "inset 6px 6px 0 #ffffff, inset -6px -6px 0 #707070",
          }}
        >
          1
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
