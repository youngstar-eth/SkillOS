// Skillbase pixel monogram: an S in Skill Yellow and a B in Base Blue that
// share a column. Rendered as pure rects (no fonts) so it scales cleanly and
// has zero dependency on font availability when rasterised.
//
// Grid: 224×160 viewBox, 32px blocks. Conceptually the S is 4 cols × 5 rows
// (14 visible blocks) and the B is 4 cols × 5 rows (13 visible blocks); they
// share column x=96, and B wins that column — so the S only draws cols 0..64.

import { SKILLBASE_BRAND } from "./config"

export interface MonogramOpts {
  /** Background colour. Default: transparent. */
  bg?: string
  /** S colour. Default: Skill Yellow. */
  yellow?: string
  /** B colour. Default: Base Blue. */
  blue?: string
  /** Rendered width in px. Height is derived (size * 160/224). */
  size?: number
}

/** Returns the SB monogram as an SVG string. */
export function monogramSVG(opts: MonogramOpts = {}): string {
  const bg = opts.bg ?? "transparent"
  const yellow = opts.yellow ?? SKILLBASE_BRAND.colors.skillYellow
  const blue = opts.blue ?? SKILLBASE_BRAND.colors.baseBlue
  const size = opts.size ?? 224
  const height = (size * 160) / 224

  const bgRect = bg !== "transparent" ? `<rect width="224" height="160" fill="${bg}"/>` : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 160" width="${size}" height="${height}">
    ${bgRect}
    <!-- S in yellow (cols 0..64; col 96 ceded to B) -->
    <rect x="0" y="0" width="32" height="32" fill="${yellow}"/>
    <rect x="32" y="0" width="32" height="32" fill="${yellow}"/>
    <rect x="64" y="0" width="32" height="32" fill="${yellow}"/>
    <rect x="0" y="32" width="32" height="32" fill="${yellow}"/>
    <rect x="0" y="64" width="32" height="32" fill="${yellow}"/>
    <rect x="32" y="64" width="32" height="32" fill="${yellow}"/>
    <rect x="64" y="64" width="32" height="32" fill="${yellow}"/>
    <rect x="0" y="128" width="32" height="32" fill="${yellow}"/>
    <rect x="32" y="128" width="32" height="32" fill="${yellow}"/>
    <rect x="64" y="128" width="32" height="32" fill="${yellow}"/>
    <!-- B in blue (cols 96..192; wins the shared x=96 column) -->
    <rect x="96" y="0" width="32" height="32" fill="${blue}"/>
    <rect x="128" y="0" width="32" height="32" fill="${blue}"/>
    <rect x="160" y="0" width="32" height="32" fill="${blue}"/>
    <rect x="96" y="32" width="32" height="32" fill="${blue}"/>
    <rect x="192" y="32" width="32" height="32" fill="${blue}"/>
    <rect x="96" y="64" width="32" height="32" fill="${blue}"/>
    <rect x="128" y="64" width="32" height="32" fill="${blue}"/>
    <rect x="160" y="64" width="32" height="32" fill="${blue}"/>
    <rect x="96" y="96" width="32" height="32" fill="${blue}"/>
    <rect x="192" y="96" width="32" height="32" fill="${blue}"/>
    <rect x="96" y="128" width="32" height="32" fill="${blue}"/>
    <rect x="128" y="128" width="32" height="32" fill="${blue}"/>
    <rect x="160" y="128" width="32" height="32" fill="${blue}"/>
  </svg>`
}

/**
 * Extract the inner content of a <svg> element so it can be nested inside
 * another SVG via <g transform="…">. Avoids producing nested <svg> which
 * some rasterisers handle inconsistently.
 */
export function monogramInner(opts: MonogramOpts = {}): string {
  return monogramSVG(opts).replace(/<svg[^>]*>|<\/svg>/g, "")
}

/** Wordmark: monogram + "skillbase" text. Useful for footers, headers, hero corners. */
export function primaryLogoSVG(opts: { onDark?: boolean; size?: number } = {}): string {
  const onDark = opts.onDark ?? false
  const width = opts.size ?? 720
  const height = Math.round(width * 160 / 720) // aspect ratio matches 720×160 design canvas
  const textColor = onDark ? SKILLBASE_BRAND.colors.pureWhite : SKILLBASE_BRAND.colors.baseBlack

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 160" width="${width}" height="${height}">
    <!-- Monogram, scaled to fit the 160-tall canvas: native 160 height, so 1:1 -->
    <g>
      ${monogramInner({ size: 224 })}
    </g>
    <!-- Wordmark, set flush-right of the monogram with comfortable gutter -->
    <text x="256" y="112" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="96" font-weight="700" fill="${textColor}" letter-spacing="-0.04em">skillbase</text>
  </svg>`
}

/**
 * Square app icon: monogram centred on a rounded Base Black tile. Intended for
 * iOS/Base App home-screen tiles which are always square.
 */
export function iconSVG(size: number = 1024): string {
  const padding = size * 0.15
  const inner = size - padding * 2
  // Monogram native aspect is 224:160; if we drop the raw SVG in, the wide
  // shape leaves a lot of vertical whitespace. We centre it vertically inside
  // the padded square, and scale width to `inner`. Height becomes inner*160/224.
  const innerHeight = (inner * 160) / 224
  const yOffset = padding + (inner - innerHeight) / 2
  const radius = size * 0.22

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${SKILLBASE_BRAND.colors.baseBlack}"/>
    <g transform="translate(${padding}, ${yOffset}) scale(${inner / 224})">
      ${monogramInner()}
    </g>
  </svg>`
}
