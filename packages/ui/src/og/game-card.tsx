// ───────────────────────────────────────────────────────────────────────────
// GameOgCard + TileGlyph — shared OG/cast-embed renderer for the 6 game
// subdomains.
//
// Design (1200×630 dark canvas):
//   ┌─────────────────────────────────────────────────────────┐
//   │ ┌────┐                                          ┌──────┐│
//   │ │SB  │                                          │ tile ││
//   │ └────┘                                          └──────┘│
//   │ SKILLBASE                                               │
//   │                                                         │
//   │ <Game Title> ────────────── 144px Space Grotesk Medium  │
//   │ <Tagline> ─────────────── 32px Regular #A3A3A3          │
//   │                                                         │
//   │ ─── 1px gold rule ──────────────────────────────────────│
//   │ <Eyebrow footer>                                        │
//   └─────────────────────────────────────────────────────────┘
//
// gameOgImage(props) handles font loading + ImageResponse construction so
// per-route handlers shrink to ~10 lines.
//
// Tile note: TileGlyph rebuilds each tile in Satori-native primitives so
// `<text>`-bearing tiles (2048, sudoku, wordle) render reliably. The
// /public/<game>.svg files stay (browser-rendered eyebrow tiles need
// them), as do the per-app icon routes (already shipped). TODO: when we
// next consolidate, point those icon routes at this TileGlyph too —
// would eliminate the last copy-of-the-tile-artwork.
// ───────────────────────────────────────────────────────────────────────────

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;

const INK = "#0A0A0A";
const PAPER = "#FAFAFA";
const GOLD = "#FFC72C";
const BLUE = "#0052FF";
const TILE_BG = "#141414";
const TILE_BORDER = "#262626";
const MUTED = "#A3A3A3";
const FOOTER = "#737373";

const SANS_STACK =
  '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const DEFAULT_EYEBROW = "SKILLBASE.GAMES · LIVE ON BASE SEPOLIA";

// Canonical 7×5 SB monogram. Inlined as base64 SVG so satori treats it
// as a raster image; the shape primitives then bypass any text-rendering
// path. Geometry mirrors SkillbaseMark.tsx (single source of truth for
// the rect set).
const SB_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 5" shape-rendering="crispEdges">
  <g fill="${GOLD}">
    <rect x="0" y="0" width="3" height="1"/>
    <rect x="0" y="1" width="1" height="1"/>
    <rect x="0" y="2" width="3" height="1"/>
    <rect x="0" y="4" width="3" height="1"/>
  </g>
  <g fill="${BLUE}">
    <rect x="3" y="0" width="3" height="1"/>
    <rect x="3" y="1" width="1" height="1"/>
    <rect x="6" y="1" width="1" height="1"/>
    <rect x="3" y="2" width="3" height="1"/>
    <rect x="3" y="3" width="1" height="1"/>
    <rect x="6" y="3" width="1" height="1"/>
    <rect x="3" y="4" width="3" height="1"/>
  </g>
</svg>`;
const SB_MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(SB_MARK_SVG).toString("base64")}`;

export type GameKey =
  | "2048"
  | "clicker"
  | "match3"
  | "minesweeper"
  | "sudoku"
  | "wordle";

export interface GameOgCardProps {
  game: GameKey;
  /** Display title — may differ from key (e.g. "Match 3" vs "match3"). */
  title: string;
  /** Subtitle below the display title. Doubles as twitter description. */
  tagline: string;
  /** Optional uppercase footer line. Defaults to the brand standard. */
  eyebrow?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// TileGlyph — Satori-native rebuild of each game's tile.
//
// Native dimensions are 64×64 (matches /public/<game>.svg viewBox). The
// `size` prop scales every internal dimension by `size / 64`, so the same
// component renders correctly at 128 (OG card) or 380 (icon routes, when
// we later consolidate).
//
// All inner shapes are <div>s with absolute positioning + borderRadius
// because satori can't rasterize <text> embedded in an <svg> data URI
// reliably (proven in icon route work, PR #2).
// ───────────────────────────────────────────────────────────────────────────

interface TileGlyphProps {
  game: GameKey;
  /** Pixel size — width and height. Defaults to 128 (OG-card scale). */
  size?: number;
}

export function TileGlyph({ game, size = 128 }: TileGlyphProps): ReactElement {
  const r = size / 64;
  const cardBase = {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    width: size,
    height: size,
    borderRadius: 10 * r,
    background: TILE_BG,
    border: `${Math.max(1, r)}px solid ${TILE_BORDER}`,
  };

  switch (game) {
    case "2048":
      return (
        <div style={cardBase}>
          <div
            style={{
              display: "flex",
              color: GOLD,
              fontSize: 18 * r,
              fontWeight: 500,
              letterSpacing: -0.5 * r,
            }}
          >
            2048
          </div>
        </div>
      );

    case "sudoku":
      return (
        <div style={cardBase}>
          <div
            style={{
              display: "flex",
              color: GOLD,
              fontSize: 22 * r,
              fontWeight: 500,
            }}
          >
            9
          </div>
        </div>
      );

    case "wordle":
      return (
        <div style={{ ...cardBase, gap: 1 * r }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14 * r,
              height: 20 * r,
              background: GOLD,
              color: INK,
              fontSize: 14 * r,
              fontWeight: 500,
            }}
          >
            A
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14 * r,
              height: 20 * r,
              border: `${Math.max(1, r)}px solid ${TILE_BORDER}`,
              color: PAPER,
              fontSize: 14 * r,
              fontWeight: 500,
            }}
          >
            B
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14 * r,
              height: 20 * r,
              border: `${Math.max(1, r)}px solid ${TILE_BORDER}`,
              color: PAPER,
              fontSize: 14 * r,
              fontWeight: 500,
            }}
          >
            C
          </div>
        </div>
      );

    case "clicker":
      // Outer ring (28r diameter) + center dot (8r diameter), both gold.
      // Native SVG has stroke-width 2, scaled by r.
      return (
        <div style={{ ...cardBase, position: "relative" }}>
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 18 * r,
              left: 18 * r,
              width: 28 * r,
              height: 28 * r,
              borderRadius: 14 * r,
              border: `${2 * r}px solid ${GOLD}`,
            }}
          />
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 28 * r,
              left: 28 * r,
              width: 8 * r,
              height: 8 * r,
              borderRadius: 4 * r,
              background: GOLD,
            }}
          />
        </div>
      );

    case "match3":
      // 2×2 dot pattern: gold + faded-white diagonal alternation.
      // Native: 4 circles r=6 at (22,22), (42,22), (22,42), (42,42).
      return (
        <div style={{ ...cardBase, position: "relative" }}>
          {(
            [
              { cx: 22, cy: 22, color: GOLD, opacity: 1 },
              { cx: 42, cy: 22, color: PAPER, opacity: 0.4 },
              { cx: 22, cy: 42, color: PAPER, opacity: 0.4 },
              { cx: 42, cy: 42, color: GOLD, opacity: 1 },
            ] as const
          ).map((d, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                position: "absolute",
                top: (d.cy - 6) * r,
                left: (d.cx - 6) * r,
                width: 12 * r,
                height: 12 * r,
                borderRadius: 6 * r,
                background: d.color,
                opacity: d.opacity,
              }}
            />
          ))}
        </div>
      );

    case "minesweeper":
      // 3×3 grid in gold strokes. Outer rect 36×36 at (14,14), 4 inner
      // lines (2 horizontal at y=26,38; 2 vertical at x=26,38).
      return (
        <div style={{ ...cardBase, position: "relative" }}>
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 14 * r,
              left: 14 * r,
              width: 36 * r,
              height: 36 * r,
              border: `${1.5 * r}px solid ${GOLD}`,
              borderRadius: 2 * r,
            }}
          />
          {/* Horizontal lines y=26, y=38 */}
          {[26, 38].map((y) => (
            <div
              key={`h-${y}`}
              style={{
                display: "flex",
                position: "absolute",
                top: y * r,
                left: 14 * r,
                width: 36 * r,
                height: 1.5 * r,
                background: GOLD,
              }}
            />
          ))}
          {/* Vertical lines x=26, x=38 */}
          {[26, 38].map((x) => (
            <div
              key={`v-${x}`}
              style={{
                display: "flex",
                position: "absolute",
                top: 14 * r,
                left: x * r,
                width: 1.5 * r,
                height: 36 * r,
                background: GOLD,
              }}
            />
          ))}
        </div>
      );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Font loader — Space Grotesk via Google Fonts CSS scrape.
//
// Bundled satori in next/og 0.6.x parses TTF/OTF only. The bare Mozilla/5.0
// UA convinces Google Fonts to serve ttf (not woff2). Cached at module
// scope: first request pays ~350ms; subsequent requests are instant.
// Graceful fallback to system sans if either fetch fails.
// ───────────────────────────────────────────────────────────────────────────

type FontEntry = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500;
  style: "normal";
};

let cachedFonts: FontEntry[] | null = null;

async function loadGoogleFont(weight: 400 | 500): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@${weight}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src: url\((https:[^)]+\.(?:ttf|otf))\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function getOgFonts(): Promise<FontEntry[]> {
  if (cachedFonts) return cachedFonts;
  const [regular, medium] = await Promise.all([
    loadGoogleFont(400),
    loadGoogleFont(500),
  ]);
  const fonts: FontEntry[] = [];
  if (regular)
    fonts.push({
      name: "Space Grotesk",
      data: regular,
      weight: 400,
      style: "normal",
    });
  if (medium)
    fonts.push({
      name: "Space Grotesk",
      data: medium,
      weight: 500,
      style: "normal",
    });
  cachedFonts = fonts;
  return fonts;
}

// ───────────────────────────────────────────────────────────────────────────
// GameOgCard — pure JSX layout. Exported in case a caller wants to compose
// it further; most callers should use gameOgImage() below.
// ───────────────────────────────────────────────────────────────────────────

export function GameOgCard({
  game,
  title,
  tagline,
  eyebrow = DEFAULT_EYEBROW,
}: GameOgCardProps): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: INK,
        display: "flex",
        flexDirection: "column",
        padding: 80,
        fontFamily: SANS_STACK,
        justifyContent: "space-between",
      }}
    >
      {/* Top row: brand cluster left, per-game tile right */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SB_MARK_DATA_URI} width={84} height={60} alt="" />
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 24,
              fontWeight: 500,
              color: GOLD,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            Skillbase
          </div>
        </div>

        <TileGlyph game={game} size={128} />
      </div>

      {/* Center: title + tagline */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 144,
            fontWeight: 500,
            color: PAPER,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            fontWeight: 400,
            color: MUTED,
            letterSpacing: "-0.015em",
          }}
        >
          {tagline}
        </div>
      </div>

      {/* Bottom: 1px gold rule + eyebrow footer */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 1,
            background: GOLD,
          }}
        />
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 16,
            fontWeight: 500,
            color: FOOTER,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// gameOgImage — turn props into an ImageResponse. Called by each per-game
// route handler. Loads fonts lazily (cached) and wraps the GameOgCard JSX.
// ───────────────────────────────────────────────────────────────────────────

export async function gameOgImage(
  props: GameOgCardProps,
): Promise<ImageResponse> {
  const fonts = await getOgFonts();
  return new ImageResponse(<GameOgCard {...props} />, {
    ...OG_SIZE,
    fonts: fonts.length ? fonts : undefined,
  });
}

/** Computes the OG `alt` string from props. Same shape per-game. */
export function gameOgAlt(title: string, tagline: string): string {
  return `Skillbase ${title} — ${tagline}`;
}
