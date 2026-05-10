import { ImageResponse } from "next/og";

// 1200×630 OG card. SkillOS rebrand composition mirroring apex
// /opengraph-image.tsx. Pitch-black canvas, white "SkillOS" wordmark,
// "Sponsor" sub-wordmark in storm-gray, lime "Sponsor a Pool"
// headline, mono eyebrow strip. Inlined and self-contained — no
// imports from @skillos/ui — so satori's OG runtime sees a single
// React tree without subpath resolution surprises.

export const runtime = "nodejs";

export const alt = "SkillOS — Sponsor a Pool";
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
          padding: 80,
          fontFamily: SANS,
          position: "relative",
        }}
      >
        {/* Top — SkillOS · Sponsor brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: "-0.012em",
          }}
        >
          <div style={{ display: "flex", color: PORCELAIN }}>SkillOS</div>
          <div style={{ display: "flex", color: FOG }}>·</div>
          <div style={{ display: "flex", color: STORM }}>Sponsor</div>
        </div>

        {/* Spacer pushes headline cluster toward vertical center */}
        <div style={{ display: "flex", flex: "1 1 auto" }} />

        {/* Headline + tagline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 24,
              fontSize: 128,
              fontWeight: 700,
              letterSpacing: "-0.022em",
              lineHeight: 1,
            }}
          >
            <div style={{ display: "flex", color: PORCELAIN }}>Sponsor</div>
            <div style={{ display: "flex", color: NEON_LIME }}>a Pool.</div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 28,
              color: STORM,
              fontWeight: 400,
              letterSpacing: "-0.018em",
              maxWidth: 880,
            }}
          >
            Permissionlessly fund any SkillOS tournament prize pool. One tx,
            soulbound on-chain receipt.
          </div>
        </div>

        <div style={{ display: "flex", flex: "1 1 auto" }} />

        {/* Bottom — lime accent rule + mono meta row */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: 88,
              height: 2,
              background: NEON_LIME,
              marginBottom: 28,
            }}
          />
          <div
            style={{
              display: "flex",
              fontFamily: MONO,
              fontSize: 14,
              color: FOG,
              letterSpacing: "0.18em",
            }}
          >
            ON-CHAIN · SOULBOUND RECEIPT · PHASE 1 TESTNET LIVE · A SIMPL3
            PRODUCT
          </div>
        </div>
      </div>
    ),
    size,
  );
}
