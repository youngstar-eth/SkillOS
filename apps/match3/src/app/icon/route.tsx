import { ImageResponse } from "next/og";

// 512×512 per-game Mini App icon. Referenced by farcaster.json.
// Match3 variant — three gems in a row, purple on dark.

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
          gap: 24,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              width: 110,
              height: 110,
              borderRadius: 24,
              background:
                "linear-gradient(135deg, #c084fc 0%, #9333ea 60%, #6b21a8 100%)",
              boxShadow: "inset 0 -8px 0 rgba(0,0,0,0.25)",
            }}
          />
        ))}
      </div>
    ),
    { width: 512, height: 512 },
  );
}
