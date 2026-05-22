import { ImageResponse } from "next/og";

// 1200×630 Open Graph card. SkillOS rebrand composition: pitch-black
// canvas, large white "SkillOS" wordmark center-stage, gray tagline
// underneath, single neon-lime rule, lime "skillos · match3" accent and
// the canonical "PHASE 1 TESTNET LIVE" eyebrow strip.
//
// Mirrors apex /opengraph-image.tsx (the canonical source-of-truth).
// Intentionally inlined and self-contained — no imports from
// @skillos/ui — so satori sees a single React tree without subpath
// resolution surprises in the OG runtime.

export const runtime = "nodejs";

export const alt =
  "SkillOS match3 — Skill economy infrastructure for self-evolving agents.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PITCH_BLACK = "#08090a";
const PORCELAIN = "#ffffff";
const STORM = "#9ca3af";
const FOG = "#6b7280";
const NEON_LIME = "#e4f222";

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const MONO =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: PITCH_BLACK,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: SANS,
          padding: 80,
          position: "relative",
        }}
      >
        {/* Wordmark — Inter 700, -2.2% tracking, 200px (matches apex). */}
        <div
          style={{
            display: "flex",
            fontSize: 200,
            fontWeight: 700,
            color: PORCELAIN,
            letterSpacing: "-0.022em",
            lineHeight: 1,
          }}
        >
          SkillOS
        </div>

        {/* Tagline — gray, 32px. */}
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            fontWeight: 400,
            color: STORM,
            letterSpacing: "-0.018em",
            textAlign: "center",
          }}
        >
          Skill economy infrastructure for self-evolving agents.
        </div>

        {/* Single lime accent rule — 88×2px. */}
        <div
          style={{
            display: "flex",
            marginTop: 36,
            width: 88,
            height: 2,
            background: NEON_LIME,
          }}
        />

        {/* Per-app accent — lime "skillos · match3" mono caption. */}
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontFamily: MONO,
            fontSize: 18,
            fontWeight: 500,
            color: NEON_LIME,
            letterSpacing: "0.18em",
          }}
        >
          skillos · match3
        </div>

        {/* Bottom mono strip — phase indicator. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 80,
            left: 80,
            right: 80,
            justifyContent: "center",
            fontFamily: MONO,
            fontSize: 14,
            color: FOG,
            letterSpacing: "0.18em",
          }}
        >
          PHASE 1 TESTNET LIVE · MAINNET AHEAD · A SIMPL3 PRODUCT
        </div>
      </div>
    ),
    size,
  );
}
