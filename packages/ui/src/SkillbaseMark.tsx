// ───────────────────────────────────────────────────────────────────────────
// SkillbaseMark — the canonical brand mark.
//
// 7×5 pixel-art "S + E" monogram. Gold S (cols 0–2) sits shoulder-to-shoulder
// with Blue E (cols 3–6); the two letters do NOT overlap.
//
// The viewBox uses cell units (0–7 wide, 0–5 tall) so every <rect> has
// integer coordinates. Combined with shape-rendering="crispEdges", this
// guarantees pixel-perfect rendering at any zoom level.
//
// Renders identically inside next/og (satori) — <svg>, <g>, <rect>, and
// `fill` are all in satori's supported subset.
// ───────────────────────────────────────────────────────────────────────────

import type { SVGProps } from "react";

export interface SkillbaseMarkProps extends SVGProps<SVGSVGElement> {
  /** Rendered width in px. Height auto-computes to size × 5/7. Default 42. */
  size?: number;
}

export const SkillbaseMark = ({
  size = 42,
  width,
  height,
  viewBox,
  shapeRendering,
  role,
  ...rest
}: SkillbaseMarkProps) => (
  <svg
    {...rest}
    width={width ?? size}
    height={height ?? (size * 5) / 7}
    viewBox={viewBox ?? "0 0 7 5"}
    shapeRendering={shapeRendering ?? "crispEdges"}
    role={role ?? "img"}
    aria-label="Skillbase"
  >
    <title>Skillbase</title>
    <g fill="#FFC72C">
      <rect x="0" y="0" width="3" height="1" />
      <rect x="0" y="1" width="1" height="1" />
      <rect x="0" y="2" width="3" height="1" />
      <rect x="0" y="4" width="3" height="1" />
    </g>
    <g fill="#0052FF">
      <rect x="3" y="0" width="3" height="1" />
      <rect x="3" y="1" width="1" height="1" />
      <rect x="6" y="1" width="1" height="1" />
      <rect x="3" y="2" width="3" height="1" />
      <rect x="3" y="3" width="1" height="1" />
      <rect x="6" y="3" width="1" height="1" />
      <rect x="3" y="4" width="3" height="1" />
    </g>
  </svg>
);
