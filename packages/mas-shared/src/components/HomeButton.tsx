"use client";

import { SKILLBASE_BRAND } from "../brand/config";

export interface HomeButtonProps {
  /** Override the href — defaults to the skillbase.games landing. */
  href?: string;
  /** Override the visible label. Defaults to "skillbase". */
  label?: string;
  /** Tweak the fixed-position corner. Defaults to top-right. */
  position?: "top-right" | "top-left";
}

/**
 * Fixed-position back-to-home pill anchored to a corner. Rendered on every
 * skillbase game so players can always jump back to the catalog. Pure inline
 * styles — no Tailwind dependency — so the component drops into any game
 * regardless of its CSS stack.
 */
export function HomeButton({
  href = "https://skillbase.games",
  label = "skillbase",
  position = "top-right",
}: HomeButtonProps) {
  const positionStyle =
    position === "top-right"
      ? { top: 16, right: 16 }
      : { top: 16, left: 16 };

  return (
    <a
      href={href}
      aria-label="Back to Skillbase home"
      style={{
        position: "fixed",
        ...positionStyle,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: "rgba(10, 11, 13, 0.8)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 8,
        color: "#FFFFFF",
        fontFamily:
          "var(--font-sans, 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif)",
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.02em",
        textDecoration: "none",
        zIndex: 1000,
        cursor: "pointer",
      }}
    >
      {/* Miniature SB monogram — same grid as brand/logo.ts but compressed. */}
      <svg
        width="16"
        height="12"
        viewBox="0 0 224 160"
        aria-hidden="true"
        style={{ display: "block", flex: "0 0 auto" }}
      >
        {/* S in Skill Yellow (cols 0..64) */}
        <rect x="0" y="0" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="32" y="0" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="64" y="0" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="0" y="32" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="0" y="64" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="32" y="64" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="64" y="64" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="0" y="128" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="32" y="128" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        <rect x="64" y="128" width="32" height="32" fill={SKILLBASE_BRAND.colors.skillYellow} />
        {/* B in Base Blue (cols 96..192) */}
        <rect x="96" y="0" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="128" y="0" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="160" y="0" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="96" y="32" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="192" y="32" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="96" y="64" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="128" y="64" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="160" y="64" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="96" y="96" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="192" y="96" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="96" y="128" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="128" y="128" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
        <rect x="160" y="128" width="32" height="32" fill={SKILLBASE_BRAND.colors.baseBlue} />
      </svg>
      <span>← {label}</span>
    </a>
  );
}
