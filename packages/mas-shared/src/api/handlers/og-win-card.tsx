import { ImageResponse } from "next/og";

/**
 * GET /og/win?addr=0x…&score=1234&amount=0.9&game=wordle
 *
 * 1200×630 social preview card for the "I won X USDC" share flow.
 * Rendered at the Edge via next/og — no new deps needed.
 *
 * NOTE: route files must set `export const runtime = "edge"` themselves —
 * Next.js requires a string literal there, not a re-exported identifier.
 */
export async function ogWinCardHandler(req: Request) {
  const { searchParams } = new URL(req.url);
  const addr = searchParams.get("addr") ?? "0x0000000000000000";
  const score = searchParams.get("score") ?? "0";
  const amount = searchParams.get("amount") ?? "0";
  const game = (searchParams.get("game") ?? "skillbase").toUpperCase();

  const shortAddr =
    addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

  const amountDisplay = Number.isFinite(Number(amount))
    ? Number(amount).toFixed(2)
    : amount;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0B0B0F 0%, #1a1a24 55%, #0B0B0F 100%)",
          color: "#FFC72C",
          padding: "80px",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 6,
            opacity: 0.55,
            display: "flex",
          }}
        >
          SKILLBASE.GAMES
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 112,
              fontWeight: 700,
              lineHeight: 1,
              display: "flex",
            }}
          >
            +{amountDisplay} USDC
          </div>
          <div
            style={{
              fontSize: 36,
              marginTop: 28,
              opacity: 0.85,
              display: "flex",
            }}
          >
            {shortAddr} won {game}
          </div>
          <div
            style={{
              fontSize: 22,
              marginTop: 14,
              opacity: 0.5,
              display: "flex",
              letterSpacing: 2,
            }}
          >
            SCORE · {score}
          </div>
        </div>

        <div
          style={{
            fontSize: 22,
            opacity: 0.5,
            letterSpacing: 3,
            display: "flex",
          }}
        >
          BEAT ME ON SKILLBASE →
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
