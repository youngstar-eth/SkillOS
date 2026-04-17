#!/usr/bin/env -S npx tsx
/**
 * Skillbase brand asset generator.
 *
 * For each of the 20 games emits three PNGs under apps/<slug>/public/:
 *   - icon.png    1024×1024   Skillbase monogram on Base Black rounded tile
 *   - splash.png    200×200   Small monogram on white
 *   - hero.png    1200×630   Game title card with Skillbase lockup + "ON BASE" badge
 *
 * Usage:
 *   npx tsx scripts/generate-brand-assets.ts [<slug>...]     # subset
 *   npx tsx scripts/generate-brand-assets.ts --all           # all 20
 */

import sharp from "sharp"
import { mkdir, writeFile } from "fs/promises"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { monogramInner, iconSVG, SKILLBASE_BRAND } from "../packages/mas-shared/src/brand"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

interface Game {
  slug: string
  title: string
  accent: string   // game-specific accent for hero right-panel
  blurb: string    // 1-line description for hero
}

const GAMES: Game[] = [
  { slug: "2048",        title: "2048",        accent: "#FFD166", blurb: "Merge tiles, win tournaments" },
  { slug: "wordle",      title: "Wordle",      accent: "#4C72F7", blurb: "Guess the word, on Base" },
  { slug: "snake",       title: "Snake",       accent: "#52FFD6", blurb: "Eat, grow, survive" },
  { slug: "minesweeper", title: "Minesweeper", accent: "#FEFF58", blurb: "Classic logic, new stakes" },
  { slug: "sudoku",      title: "Sudoku",      accent: "#635BFF", blurb: "Numbers, nerve, onchain" },
  { slug: "pong",        title: "Pong",        accent: "#54AEFF", blurb: "Two paddles, one ball, real rewards" },
  { slug: "clicker",     title: "Clicker",     accent: "#5A845C", blurb: "Idle, incremental, on Base" },
  { slug: "breakout",    title: "Breakout",    accent: "#FF3D8B", blurb: "Smash every brick" },
  { slug: "bubble",      title: "Bubble",      accent: "#FF6496", blurb: "Pop, chain, win" },
  { slug: "solitaire",   title: "Solitaire",   accent: "#C49A5E", blurb: "Patience pays on Base" },
  { slug: "match3",      title: "Match 3",     accent: "#FF78B4", blurb: "Match, chain, collect" },
  { slug: "crossy",      title: "Crossy",      accent: "#FFEC27", blurb: "Hop across, don't stop" },
  { slug: "geometry",    title: "Geometry",    accent: "#00F0FF", blurb: "Tap, jump, survive the beat" },
  { slug: "jetpack",     title: "Jetpack",     accent: "#00F0FF", blurb: "Fly fast, fly far" },
  { slug: "stickman",    title: "Stickman",    accent: "#B45030", blurb: "Run, jump, don't fall" },
  { slug: "tower",       title: "Tower",       accent: "#C88C3C", blurb: "Stack sky-high" },
  { slug: "pool",        title: "Pool",        accent: "#C8AA64", blurb: "Break, sink, win" },
  { slug: "hillclimb",   title: "Hillclimb",   accent: "#C86E32", blurb: "Floor it, stay upright" },
  { slug: "flappy",      title: "Flappy",      accent: "#FFA0C8", blurb: "Flap through every gap" },
  { slug: "helix",       title: "Helix",       accent: "#FF3C64", blurb: "Drop, dodge, combo" },
]

const FONT_FAMILY =
  "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif"

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;"
  )
}

/** 200×200 splash: small monogram on white. */
function buildSplashSvg(): string {
  // Monogram is 224×160 natively. We want to fit it in ~120×86 centred.
  const mWidth = 120
  const mHeight = (mWidth * 160) / 224 // ≈ 85.7
  const x = (200 - mWidth) / 2
  const y = (200 - mHeight) / 2
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="${SKILLBASE_BRAND.colors.pureWhite}"/>
  <g transform="translate(${x}, ${y}) scale(${mWidth / 224})">
    ${monogramInner()}
  </g>
</svg>`
}

/** 1200×630 hero card: Skillbase lockup + game title + "ON BASE" badge. */
function buildHeroSvg(g: Game): string {
  const W = 1200, H = 630
  const { skillYellow, baseBlue, baseBlack, pureWhite } = SKILLBASE_BRAND.colors

  // Title auto-sizes: shorter names get bigger type.
  const titleSize = g.title.length <= 5 ? 160 : g.title.length <= 9 ? 130 : 100

  // Monogram lockup top-left: native 224×160 → scale 0.4 → 89.6×64
  const lockMonogramScale = 0.4
  const lockMonogramW = 224 * lockMonogramScale

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Base Black canvas -->
  <rect width="${W}" height="${H}" fill="${baseBlack}"/>

  <!-- Right accent panel (40%) -->
  <rect x="720" y="0" width="480" height="${H}" fill="${g.accent}"/>

  <!-- Subtle diagonal pattern on accent panel -->
  <g opacity="0.1">
    ${Array.from({ length: 30 })
      .map((_, i) => {
        const x = 720 + i * 40 - 200
        return `<line x1="${x}" y1="0" x2="${x + H}" y2="${H}" stroke="${baseBlack}" stroke-width="1"/>`
      })
      .join("\n    ")}
  </g>

  <!-- Skillbase lockup: monogram + wordmark top-left -->
  <g transform="translate(48, 48)">
    <g transform="scale(${lockMonogramScale})">
      ${monogramInner()}
    </g>
    <text x="${lockMonogramW + 20}" y="48" font-family="${FONT_FAMILY}"
          font-size="26" font-weight="600" fill="${pureWhite}"
          letter-spacing="-0.02em">skillbase</text>
  </g>

  <!-- Game title, centred vertically on left 60% -->
  <text x="60" y="${H / 2 + titleSize * 0.25}" font-family="${FONT_FAMILY}"
        font-size="${titleSize}" font-weight="800" fill="${skillYellow}"
        letter-spacing="-0.03em">${escapeXml(g.title)}</text>

  <!-- Blurb underneath title -->
  <text x="62" y="${H / 2 + titleSize * 0.25 + 48}" font-family="${FONT_FAMILY}"
        font-size="26" font-weight="400" fill="${pureWhite}" opacity="0.75">${escapeXml(g.blurb)}</text>

  <!-- "ON BASE" pill bottom-left -->
  <g transform="translate(48, ${H - 90})">
    <rect width="150" height="44" rx="22" fill="${baseBlue}"/>
    <text x="75" y="29" font-family="${FONT_FAMILY}" font-size="14"
          font-weight="600" fill="${pureWhite}" text-anchor="middle"
          letter-spacing="0.12em">ON BASE</text>
  </g>

  <!-- Monogram accent bottom-right corner on accent panel -->
  <g transform="translate(${W - 240}, ${H - 180}) scale(0.7)">
    ${monogramInner({ yellow: baseBlack, blue: baseBlack })}
  </g>
</svg>`
}

async function svgToPng(svg: string, outPath: string, width: number, height: number): Promise<number> {
  const buf = await sharp(Buffer.from(svg), { density: 144 })
    .resize(width, height, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, buf)
  return buf.length
}

async function generateForGame(g: Game): Promise<{ slug: string; ok: boolean; sizes?: Record<string, number>; error?: string }> {
  const publicDir = join(ROOT, "apps", g.slug, "public")
  try {
    const [icon, splash, hero] = await Promise.all([
      svgToPng(iconSVG(1024), join(publicDir, "icon.png"), 1024, 1024),
      svgToPng(buildSplashSvg(), join(publicDir, "splash.png"), 200, 200),
      svgToPng(buildHeroSvg(g), join(publicDir, "hero.png"), 1200, 630),
    ])
    return { slug: g.slug, ok: true, sizes: { icon, splash, hero } }
  } catch (err) {
    return { slug: g.slug, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const wantAll = args.includes("--all") || args.length === 0
  const subset = wantAll ? GAMES : GAMES.filter((g) => args.includes(g.slug))
  if (subset.length === 0) {
    console.error("Usage: generate-brand-assets.ts [<slug>...|--all]")
    console.error("Known slugs:", GAMES.map((g) => g.slug).join(", "))
    process.exit(1)
  }
  const results = await Promise.all(subset.map(generateForGame))
  for (const r of results) {
    if (r.ok) {
      const s = r.sizes!
      console.log(`${r.slug.padEnd(12)} ✓ icon=${kb(s.icon)} splash=${kb(s.splash)} hero=${kb(s.hero)}`)
    } else {
      console.log(`${r.slug.padEnd(12)} ✗ ${r.error}`)
    }
  }
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} generated`)
  process.exit(failed > 0 ? 1 : 0)
}

function kb(n: number): string { return `${(n / 1024).toFixed(1)}KB` }

main()
