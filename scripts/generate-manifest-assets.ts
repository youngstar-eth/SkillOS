#!/usr/bin/env -S npx tsx
/**
 * Generate icon/splash/hero PNGs for each game's Farcaster manifest.
 *
 * Usage:
 *   npx tsx scripts/generate-manifest-assets.ts <game-name>
 *   npx tsx scripts/generate-manifest-assets.ts --all
 *
 * Produces:
 *   apps/<game>/public/icon.png    1024×1024
 *   apps/<game>/public/splash.png  200×200
 *   apps/<game>/public/hero.png    1200×630
 */

import sharp from 'sharp'
import { mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

interface GameTheme {
  name: string          // display name, e.g. "2048"
  subtitle: string      // design aesthetic tag, e.g. "Bauhaus"
  bg: string            // background hex
  fg: string            // foreground hex (text)
  accent: string        // accent hex (highlight)
  accent2?: string      // optional secondary accent
  font: 'serif' | 'sans' | 'mono' | 'display'
  motif: 'grid' | 'blocks' | 'circle' | 'pattern' | 'minimal'
}

const GAMES: Record<string, GameTheme> = {
  '2048':       { name: '2048',       subtitle: 'Bauhaus',      bg: '#FFFBEB', fg: '#1A1A1A', accent: '#E8B923', accent2: '#7C5AC4', font: 'display', motif: 'blocks' },
  wordle:       { name: 'Wordle',     subtitle: 'Linear',       bg: '#FFFFFF', fg: '#1A1A1A', accent: '#538D4E', accent2: '#C9B458', font: 'sans',    motif: 'grid' },
  snake:        { name: 'Snake',      subtitle: 'Vaporwave',    bg: '#0D0221', fg: '#F7F2F9', accent: '#FF2A6D', accent2: '#05D9E8', font: 'sans',    motif: 'grid' },
  minesweeper:  { name: 'Minesweep',  subtitle: 'Retro',        bg: '#C0C0C0', fg: '#000000', accent: '#FF0000', accent2: '#0000FF', font: 'mono',    motif: 'grid' },
  sudoku:       { name: 'Sudoku',     subtitle: 'Newspaper',    bg: '#F5F1E8', fg: '#2A2A2A', accent: '#1F3A5F', accent2: '#8B6F3F', font: 'serif',   motif: 'grid' },
  pong:         { name: 'Pong',       subtitle: 'Arcade',       bg: '#000000', fg: '#FFFFFF', accent: '#FFFFFF', accent2: '#FFCC00', font: 'mono',    motif: 'minimal' },
  clicker:      { name: 'Clicker',    subtitle: 'Maximalist',   bg: '#FFE5E5', fg: '#2A0033', accent: '#FF006E', accent2: '#FFBE0B', font: 'display', motif: 'pattern' },
  breakout:     { name: 'Breakout',   subtitle: 'Y2K',          bg: '#B4E1FF', fg: '#1A1A2E', accent: '#FF71CE', accent2: '#01CDFE', font: 'sans',    motif: 'blocks' },
  bubble:       { name: 'Bubble',     subtitle: 'Soft',         bg: '#FDF4FF', fg: '#581C87', accent: '#C084FC', accent2: '#F472B6', font: 'sans',    motif: 'circle' },
  solitaire:    { name: 'Solitaire',  subtitle: 'Dark Academia',bg: '#1E1916', fg: '#E8DCC4', accent: '#8B6F3F', accent2: '#A83232', font: 'serif',   motif: 'pattern' },
  match3:       { name: 'Match 3',    subtitle: 'Kidcore',      bg: '#FFFAEB', fg: '#442850', accent: '#FF78B4', accent2: '#50C878', font: 'display', motif: 'pattern' },
  flappy:       { name: 'Flappy',     subtitle: 'Dreamcore',    bg: '#EBDCFA', fg: '#503C64', accent: '#FFA0C8', accent2: '#A0C8FF', font: 'sans',    motif: 'minimal' },
  crossy:       { name: 'Crossy',     subtitle: 'Pixel 8-bit',  bg: '#1D2B53', fg: '#FFF1E8', accent: '#FFEC27', accent2: '#00E436', font: 'mono',    motif: 'blocks' },
  helix:        { name: 'Helix',      subtitle: 'Memphis',      bg: '#FFFAEB', fg: '#0F0F0F', accent: '#FF3C64', accent2: '#50C8E6', font: 'display', motif: 'pattern' },
  geometry:     { name: 'Geometry',   subtitle: 'Glitchcore',   bg: '#08080C', fg: '#E6E6F0', accent: '#00F0FF', accent2: '#FF00B4', font: 'display', motif: 'minimal' },
  jetpack:      { name: 'Jetpack',    subtitle: 'Cybercore',    bg: '#080A19', fg: '#DCF0FF', accent: '#00F0FF', accent2: '#FF00DC', font: 'display', motif: 'grid' },
  stickman:     { name: 'Stickman',   subtitle: 'Grunge',       bg: '#231E19', fg: '#DCD2C3', accent: '#B4503C', accent2: '#788250', font: 'display', motif: 'minimal' },
  tower:        { name: 'Tower',      subtitle: 'Steampunk',    bg: '#2D1E14', fg: '#E6D2B4', accent: '#C88C3C', accent2: '#A05028', font: 'serif',   motif: 'pattern' },
  pool:         { name: 'Pool',       subtitle: 'Dark Luxe',    bg: '#0F140F', fg: '#EBE1C8', accent: '#C8AA64', accent2: '#1E5A37', font: 'serif',   motif: 'circle' },
  hillclimb:    { name: 'Hillclimb',  subtitle: 'Dieselpunk',   bg: '#323728', fg: '#DCD2B4', accent: '#C86E32', accent2: '#DCB45A', font: 'display', motif: 'pattern' },
}

// NOTE: attribute value is double-quoted in SVG, so multi-word font names
// must use single quotes (e.g. 'Helvetica Neue') to avoid breaking XML parse.
const FONT_FAMILY: Record<GameTheme['font'], string> = {
  serif:   "Georgia, 'Times New Roman', serif",
  sans:    "'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono:    "'SF Mono', Menlo, Consolas, monospace",
  display: "Impact, 'Helvetica Neue', Arial, sans-serif",
}

// ─── Motif renderers (SVG fragments) ──────────────────────────────────────

function motifBlocks(w: number, h: number, t: GameTheme): string {
  const size = Math.floor(Math.min(w, h) / 8)
  const cols = Math.ceil(w / size) + 1
  const rows = Math.ceil(h / size) + 1
  let out = ''
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Checkerboard-ish accent squares
      if ((r + c) % 3 === 0) {
        const op = 0.08
        out += `<rect x="${c * size}" y="${r * size}" width="${size}" height="${size}" fill="${t.accent}" opacity="${op}"/>`
      }
    }
  }
  return out
}

function motifGrid(w: number, h: number, t: GameTheme): string {
  const step = Math.floor(Math.min(w, h) / 12)
  let out = ''
  for (let x = 0; x <= w; x += step) {
    out += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${t.accent}" stroke-opacity="0.1" stroke-width="1"/>`
  }
  for (let y = 0; y <= h; y += step) {
    out += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${t.accent}" stroke-opacity="0.1" stroke-width="1"/>`
  }
  return out
}

function motifCircle(w: number, h: number, t: GameTheme): string {
  const cx = w / 2, cy = h / 2
  let out = ''
  for (let r = 40; r < Math.max(w, h); r += 60) {
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.accent}" stroke-opacity="0.08" stroke-width="2"/>`
  }
  return out
}

function motifPattern(w: number, h: number, t: GameTheme): string {
  // Diagonal stripes + dots
  const stripeStep = 40
  let out = ''
  for (let i = -h; i < w + h; i += stripeStep) {
    out += `<line x1="${i}" y1="0" x2="${i + h}" y2="${h}" stroke="${t.accent}" stroke-opacity="0.06" stroke-width="2"/>`
  }
  const dotStep = Math.floor(Math.min(w, h) / 10)
  for (let x = dotStep / 2; x < w; x += dotStep) {
    for (let y = dotStep / 2; y < h; y += dotStep) {
      out += `<circle cx="${x}" cy="${y}" r="3" fill="${t.accent2 ?? t.accent}" opacity="0.12"/>`
    }
  }
  return out
}

function motifMinimal(_w: number, _h: number, _t: GameTheme): string {
  return ''
}

function renderMotif(w: number, h: number, t: GameTheme): string {
  switch (t.motif) {
    case 'blocks':  return motifBlocks(w, h, t)
    case 'grid':    return motifGrid(w, h, t)
    case 'circle':  return motifCircle(w, h, t)
    case 'pattern': return motifPattern(w, h, t)
    case 'minimal': return motifMinimal(w, h, t)
  }
}

// ─── SVG builders ─────────────────────────────────────────────────────────

function buildIconSvg(t: GameTheme): string {
  const W = 1024, H = 1024
  const fontFamily = FONT_FAMILY[t.font]
  const titleSize = t.name.length <= 4 ? 320 : t.name.length <= 7 ? 240 : 170

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.bg}"/>
      <stop offset="100%" stop-color="${mix(t.bg, t.accent, 0.12)}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
  ${renderMotif(W, H, t)}
  <rect x="60" y="60" width="${W - 120}" height="${H - 120}" fill="none" stroke="${t.accent}" stroke-width="6" opacity="0.8" rx="40"/>
  <text x="${W / 2}" y="${H / 2 + titleSize * 0.3}" font-family="${fontFamily}" font-size="${titleSize}" font-weight="900" fill="${t.fg}" text-anchor="middle">${escapeXml(t.name)}</text>
  <text x="${W / 2}" y="${H - 120}" font-family="${fontFamily}" font-size="56" font-weight="500" fill="${t.accent}" text-anchor="middle" letter-spacing="6">${escapeXml(t.subtitle.toUpperCase())}</text>
</svg>`
}

function buildSplashSvg(t: GameTheme): string {
  const W = 200, H = 200
  const fontFamily = FONT_FAMILY[t.font]
  const letter = t.name.length > 6 ? t.name.slice(0, 2).toUpperCase() : t.name.charAt(0).toUpperCase()

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="80" fill="${t.accent}" opacity="0.15"/>
  <text x="${W / 2}" y="${H / 2 + 30}" font-family="${fontFamily}" font-size="90" font-weight="900" fill="${t.fg}" text-anchor="middle">${escapeXml(letter)}</text>
</svg>`
}

function buildHeroSvg(t: GameTheme): string {
  const W = 1200, H = 630
  const fontFamily = FONT_FAMILY[t.font]
  const titleSize = t.name.length <= 5 ? 180 : t.name.length <= 9 ? 140 : 110

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.bg}"/>
      <stop offset="100%" stop-color="${mix(t.bg, t.accent2 ?? t.accent, 0.15)}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#heroGrad)"/>
  ${renderMotif(W, H, t)}
  <text x="80" y="${H / 2 - 10}" font-family="${fontFamily}" font-size="${titleSize}" font-weight="900" fill="${t.fg}">${escapeXml(t.name)}</text>
  <text x="80" y="${H / 2 + 70}" font-family="${fontFamily}" font-size="48" font-weight="500" fill="${t.accent}" letter-spacing="4">${escapeXml(t.subtitle.toUpperCase())} · ON BASE</text>
  <text x="80" y="${H - 80}" font-family="${fontFamily}" font-size="32" font-weight="400" fill="${t.fg}" opacity="0.7">Play · Compete · Earn on Farcaster</text>
  <rect x="${W - 140}" y="60" width="80" height="80" rx="12" fill="${t.accent}"/>
  <text x="${W - 100}" y="${115}" font-family="${fontFamily}" font-size="42" font-weight="900" fill="${t.bg}" text-anchor="middle">${escapeXml(t.name.charAt(0).toUpperCase())}</text>
</svg>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;'))
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}

function mix(a: string, b: string, ratio: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * ratio, ag + (bg - ag) * ratio, ab + (bb - ab) * ratio)
}

// ─── Pipeline ─────────────────────────────────────────────────────────────

async function svgToPng(svg: string, outPath: string, width: number, height: number): Promise<number> {
  const buffer = await sharp(Buffer.from(svg), { density: 72 })
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, buffer)
  return buffer.length
}

async function generateForGame(game: string): Promise<{ game: string; ok: boolean; sizes?: Record<string, number>; error?: string }> {
  const theme = GAMES[game]
  if (!theme) return { game, ok: false, error: `no theme for ${game}` }
  const publicDir = join(ROOT, 'apps', game, 'public')
  try {
    const [iconBytes, splashBytes, heroBytes] = await Promise.all([
      svgToPng(buildIconSvg(theme), join(publicDir, 'icon.png'), 1024, 1024),
      svgToPng(buildSplashSvg(theme), join(publicDir, 'splash.png'), 200, 200),
      svgToPng(buildHeroSvg(theme), join(publicDir, 'hero.png'), 1200, 630),
    ])
    return { game, ok: true, sizes: { icon: iconBytes, splash: splashBytes, hero: heroBytes } }
  } catch (err) {
    return { game, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const games = args.includes('--all') ? Object.keys(GAMES) : args.filter((a) => !a.startsWith('--'))
  if (games.length === 0) {
    console.error('Usage: generate-manifest-assets.ts <game> [<game>...] | --all')
    process.exit(1)
  }
  const results = await Promise.all(games.map(generateForGame))
  for (const r of results) {
    if (r.ok) {
      const sizes = r.sizes!
      console.log(`${r.game} ✓ icon=${kb(sizes.icon)} splash=${kb(sizes.splash)} hero=${kb(sizes.hero)}`)
    } else {
      console.log(`${r.game} ✗ ${r.error}`)
    }
  }
  const failed = results.filter((r) => !r.ok).length
  process.exit(failed > 0 ? 1 : 0)
}

function kb(n: number): string { return `${(n / 1024).toFixed(1)}KB` }

main()
