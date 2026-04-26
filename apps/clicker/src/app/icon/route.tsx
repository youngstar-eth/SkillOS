import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Clicker variant — counter increment, brand gold on dark.

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
            borderRadius: "50%",
            background: "linear-gradient(135deg, #DDAC2F 0%, #b88a1c 100%)",
            color: "#0a0a0a",
            fontSize: 180,
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          +1
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
