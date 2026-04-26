import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Sudoku variant — single grid cell with numeral, Base blue on dark.

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
            background: "#0052FF",
            color: "#ffffff",
            fontSize: 280,
            fontWeight: 700,
            border: "8px solid #0044d6",
          }}
        >
          5
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
