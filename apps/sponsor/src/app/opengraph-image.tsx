import { ImageResponse } from "next/og";

// 1200×630 OG card. Plain dark+gold composition: monogram + "SkillOS
// Sponsor" wordmark + "Sponsor a Pool" headline + tagline + bottom rule.
//
// Pixel <rect>s are inlined here rather than imported — satori's OG runtime
// resolves `@/`-aliased React imports inconsistently, so apex inlines the
// monogram cells; sponsor follows the same pattern.

export const runtime = "nodejs";

export const alt = "SkillOS — Sponsor a Pool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0A0A0A";
const GOLD = "#FFC72C";
const BLUE = "#0052FF";
const PAPER = "#fafafa";
const MUTED = "#737373";

const SANS =
  '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const MONO =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: INK,
          display: "flex",
          flexDirection: "column",
          padding: 80,
          fontFamily: SANS,
        }}
      >
        {/* Top — mark + SkillOS Sponsor wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <svg
            width={84}
            height={60}
            viewBox="0 0 7 5"
            shapeRendering="crispEdges"
            style={{ display: "flex" }}
          >
            <g fill={GOLD}>
              <rect x="0" y="0" width="3" height="1" />
              <rect x="0" y="1" width="1" height="1" />
              <rect x="0" y="2" width="3" height="1" />
              <rect x="0" y="4" width="3" height="1" />
            </g>
            <g fill={BLUE}>
              <rect x="3" y="0" width="3" height="1" />
              <rect x="3" y="1" width="1" height="1" />
              <rect x="6" y="1" width="1" height="1" />
              <rect x="3" y="2" width="3" height="1" />
              <rect x="3" y="3" width="1" height="1" />
              <rect x="6" y="3" width="1" height="1" />
              <rect x="3" y="4" width="3" height="1" />
            </g>
          </svg>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "-0.01em",
            }}
          >
            <div style={{ display: "flex", color: PAPER }}>SkillOS</div>
            <div style={{ display: "flex", color: MUTED }}>·</div>
            <div style={{ display: "flex", color: MUTED }}>Sponsor</div>
          </div>
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
              fontWeight: 500,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            <div style={{ display: "flex", color: PAPER }}>Sponsor</div>
            <div style={{ display: "flex", color: GOLD }}>a Pool.</div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 28,
              color: MUTED,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              maxWidth: 880,
            }}
          >
            Permissionlessly fund any SkillOS tournament prize pool. One tx,
            soulbound on-chain receipt.
          </div>
        </div>

        <div style={{ display: "flex", flex: "1 1 auto" }} />

        {/* Bottom — gold rule + meta row */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 1,
              background: GOLD,
              marginBottom: 28,
            }}
          />
          <div
            style={{
              display: "flex",
              fontFamily: MONO,
              fontSize: 14,
              color: MUTED,
              letterSpacing: "0.18em",
            }}
          >
            ON-CHAIN · SOULBOUND RECEIPT · LIVE ON BASE · A SIMPL3 PRODUCT
          </div>
        </div>
      </div>
    ),
    size,
  );
}
