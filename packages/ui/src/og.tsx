// ───────────────────────────────────────────────────────────────────────────
// Shared OG/cast-embed template for the 6 game subdomains.
//
// Each game's app/opengraph-image.tsx imports `gameOgTemplate` and passes
// game-specific props (title + visual glyph). Output is plain JSX that
// `next/og`'s ImageResponse renders to a 1200×630 PNG.
//
// Palette mirrors apex (skillbase.games):
//   bg #000000, brand blue #0052FF, gold #DDAC2F, neutral #A1A1AA / white.
//
// System fonts only — no external font fetching, keeps the route fast and
// avoids cold-start hits on edge deploys. The visual punch comes from
// the glyph the caller supplies, not typographic detail.
// ───────────────────────────────────────────────────────────────────────────

import type { ReactElement } from "react";
import { SkillbaseMark } from "./SkillbaseMark";

export interface GameOgProps {
  /** Game name as it should appear in the headline, e.g. "2048", "Wordle". */
  title: string;
  /** One-line subtitle. Defaults to "Skill-based · On Base · Pay to retry". */
  tagline?: string;
  /** Game-specific visual element rendered to the right of the headline. */
  glyph: ReactElement;
}

const SANS_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function gameOgTemplate({
  title,
  tagline = "Skill-based · On Base · Pay to retry",
  glyph,
}: GameOgProps): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000000",
        display: "flex",
        position: "relative",
        fontFamily: SANS_FONT_STACK,
        padding: "72px 80px",
      }}
    >
      {/* Brand+gold radial wash */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 760,
          height: 760,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 30% 30%, rgba(0, 82, 255, 0.28), transparent 65%), radial-gradient(circle at 75% 70%, rgba(221, 172, 47, 0.24), transparent 60%)",
          filter: "blur(90px)",
        }}
      />

      {/* Top-left wordmark */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 80,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 22,
          fontWeight: 600,
          color: "#ffffff",
          letterSpacing: "-0.01em",
        }}
      >
        <SkillbaseMark size={28} style={{ display: "block" }} />
        skillbase
      </div>

      {/* Top-right "Live on Base" pill */}
      <div
        style={{
          position: "absolute",
          top: 56,
          right: 80,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(10,10,11,0.75)",
          color: "#A1A1AA",
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#DDAC2F",
            display: "block",
          }}
        />
        Live on Base
      </div>

      {/* Center row: title + tagline | glyph */}
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 64,
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: "1 1 auto",
          }}
        >
          <div
            style={{
              fontSize: 128,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.05em",
              lineHeight: 1,
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 26,
              color: "#A1A1AA",
              fontWeight: 400,
              letterSpacing: "-0.005em",
            }}
          >
            {tagline}
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",
            width: 360,
            height: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {glyph}
        </div>
      </div>

      {/* Bottom-right credit */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          right: 80,
          display: "flex",
          fontSize: 14,
          color: "#52525B",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        A product of Simpl3 Inc.
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// splashTemplate — 512×512 launch splash served at /splash.png. Shown by
// Base App / Warpcast clients while a Mini App is bootstrapping. Same brand
// language as the OG card: dark bg, brand+gold radial wash, gradient square
// wordmark glyph. The game/app name is the only varying string.
// ───────────────────────────────────────────────────────────────────────────

export interface SplashProps {
  /** Game/app name shown under the wordmark, e.g. "2048" or "Skillbase". */
  name: string;
}

export function splashTemplate({ name }: SplashProps): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        fontFamily: SANS_FONT_STACK,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 30% 30%, rgba(0, 82, 255, 0.32), transparent 65%), radial-gradient(circle at 75% 75%, rgba(221, 172, 47, 0.30), transparent 60%)",
          filter: "blur(80px)",
        }}
      />
      <div style={{ display: "flex", zIndex: 1 }}>
        <SkillbaseMark size={140} style={{ display: "block" }} />
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 32,
          fontSize: 44,
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: "-0.03em",
          zIndex: 1,
        }}
      >
        skillbase
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 8,
          fontSize: 22,
          color: "#A1A1AA",
          fontWeight: 500,
          letterSpacing: "0.06em",
          zIndex: 1,
        }}
      >
        {name}
      </div>
    </div>
  );
}
