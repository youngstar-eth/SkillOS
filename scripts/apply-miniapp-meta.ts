#!/usr/bin/env -S npx tsx
/**
 * Apply Farcaster Mini App metadata + manifest + app-config to every game.
 *
 * For each apps/<game>:
 *   - writes lib/app-config.ts (name, title, description, subtitle, splashBg, tags)
 *   - writes app/.well-known/farcaster.json/route.ts (manifest handler)
 *   - rewrites app/layout.tsx to export generateMetadata() including fc:miniapp embed
 *
 * Idempotent: safe to re-run. Only overwrites the files it owns.
 */

import { mkdir, writeFile, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

interface GameMeta {
  name: string          // slug-ish identifier used in URL: mas-<key>.vercel.app
  title: string         // display title
  subtitle: string      // design aesthetic tag
  description: string   // 1-sentence summary
  splashBg: string      // hex color matching --color-bg
  themeColor: string    // hex used for viewport.themeColor
  tags: string[]        // manifest tags
  bodyClass?: string    // optional override for body className
}

const META: Record<string, GameMeta> = {
  '2048':       { name: '2048',       title: '2048',         subtitle: 'Bauhaus on Base',     description: 'Classic 2048 with a Bauhaus palette. Slide, merge, win.',        splashBg: '#FFFBEB', themeColor: '#FFFBEB', tags: ['arcade','puzzle','onchain'] },
  wordle:       { name: 'wordle',     title: 'Wordle',       subtitle: 'Linear on Base',      description: 'Five letters, six guesses. Linear-minimal Wordle on Base.',        splashBg: '#FFFFFF', themeColor: '#FFFFFF', tags: ['puzzle','daily','onchain'] },
  snake:        { name: 'snake',      title: 'Snake',        subtitle: 'Vaporwave on Base',   description: 'Vaporwave Snake. Grow, turn, survive.',                              splashBg: '#0D0221', themeColor: '#0D0221', tags: ['arcade','onchain'] },
  minesweeper:  { name: 'minesweeper',title: 'Minesweeper',  subtitle: 'Retro on Base',       description: 'Classic Minesweeper with a retro-Windows look.',                     splashBg: '#C0C0C0', themeColor: '#C0C0C0', tags: ['puzzle','classic','onchain'] },
  sudoku:       { name: 'sudoku',     title: 'Sudoku',       subtitle: 'Newspaper on Base',   description: 'Sudoku with newspaper typography. Nine cells at a time.',            splashBg: '#F5F1E8', themeColor: '#F5F1E8', tags: ['puzzle','logic','onchain'] },
  pong:         { name: 'pong',       title: 'Pong',         subtitle: 'Arcade on Base',      description: 'The original Pong, on-chain. Best of three.',                         splashBg: '#000000', themeColor: '#000000', tags: ['arcade','classic','onchain'] },
  clicker:      { name: 'clicker',    title: 'Clicker',      subtitle: 'Maximalist on Base',  description: 'Tap, upgrade, overflow. Maximalist idle clicker.',                    splashBg: '#FFE5E5', themeColor: '#FFE5E5', tags: ['idle','arcade','onchain'] },
  breakout:     { name: 'breakout',   title: 'Breakout',     subtitle: 'Y2K on Base',         description: 'Y2K-era Breakout. Chip away and win.',                                splashBg: '#B4E1FF', themeColor: '#B4E1FF', tags: ['arcade','onchain'] },
  bubble:       { name: 'bubble',     title: 'Bubble',       subtitle: 'Soft on Base',        description: 'Soft-pastel bubble shooter. Match three.',                            splashBg: '#FDF4FF', themeColor: '#FDF4FF', tags: ['puzzle','match3','onchain'] },
  solitaire:    { name: 'solitaire',  title: 'Solitaire',    subtitle: 'Dark Academia on Base', description: 'Klondike solitaire with Dark Academia mood.',                      splashBg: '#1E1916', themeColor: '#1E1916', tags: ['classic','cards','onchain'] },
  match3:       { name: 'match3',     title: 'Match 3',      subtitle: 'Kidcore on Base',     description: 'Kidcore Match-3. Chain combos, clear the board.',                    splashBg: '#FFFAEB', themeColor: '#FFFAEB', tags: ['match3','puzzle','onchain'] },
  flappy:       { name: 'flappy',     title: 'Flappy',       subtitle: 'Dreamcore on Base',   description: 'Dreamcore Flappy. Flap through the pipes.',                          splashBg: '#EBDCFA', themeColor: '#EBDCFA', tags: ['arcade','endless','onchain'] },
  crossy:       { name: 'crossy',     title: 'Crossy',       subtitle: 'Pixel 8-bit on Base', description: '8-bit road crosser. Dodge cars, hop logs.',                           splashBg: '#1D2B53', themeColor: '#1D2B53', tags: ['arcade','endless','onchain'] },
  helix:        { name: 'helix',      title: 'Helix',        subtitle: 'Memphis on Base',     description: 'Memphis-style Helix Jump. Fall fast, chain combos.',                 splashBg: '#FFFAEB', themeColor: '#FFFAEB', tags: ['arcade','endless','onchain'] },
  geometry:     { name: 'geometry',   title: 'Geometry',     subtitle: 'Glitchcore on Base',  description: 'Glitchcore runner. One button, no forgiveness.',                    splashBg: '#08080C', themeColor: '#08080C', tags: ['arcade','rhythm','onchain'] },
  jetpack:      { name: 'jetpack',    title: 'Jetpack',      subtitle: 'Cybercore on Base',   description: 'Cyber-grid Jetpack. Hold to thrust, dodge lasers.',                 splashBg: '#080A19', themeColor: '#080A19', tags: ['arcade','endless','onchain'] },
  stickman:     { name: 'stickman',   title: 'Stickman',     subtitle: 'Grunge on Base',      description: 'Grunge stickman swing. Hook, release, fly.',                         splashBg: '#231E19', themeColor: '#231E19', tags: ['arcade','physics','onchain'] },
  tower:        { name: 'tower',      title: 'Tower',        subtitle: 'Steampunk on Base',   description: 'Steampunk tower defense. Ten waves, one path.',                      splashBg: '#2D1E14', themeColor: '#2D1E14', tags: ['strategy','td','onchain'] },
  pool:         { name: 'pool',       title: 'Pool',         subtitle: 'Dark Luxe on Base',   description: 'Dark-luxe 8-ball. Clear the table, beat the clock.',                 splashBg: '#0F140F', themeColor: '#0F140F', tags: ['sports','classic','onchain'] },
  hillclimb:    { name: 'hillclimb',  title: 'Hill Climb',   subtitle: 'Dieselpunk on Base',  description: 'Dieselpunk hill climb. Manage fuel, dont flip.',                     splashBg: '#323728', themeColor: '#323728', tags: ['arcade','physics','onchain'] },
}

// ─── Templates ────────────────────────────────────────────────────────────

function appConfigTs(m: GameMeta): string {
  return `// Centralized mini-app metadata consumed by manifest + embed builders.
// Edit here to update subtitle/description/tags; route handler + layout read from this file.

export const APP_CONFIG = {
  name: ${JSON.stringify(m.name)},
  title: ${JSON.stringify(m.title)},
  subtitle: ${JSON.stringify(m.subtitle)},
  description: ${JSON.stringify(m.description)},
  splashBg: ${JSON.stringify(m.splashBg)},
  themeColor: ${JSON.stringify(m.themeColor)},
  tags: ${JSON.stringify(m.tags)} as const,
} as const

export type AppConfig = typeof APP_CONFIG

// Base URL for absolute asset / home URLs. NEXT_PUBLIC_URL is set in Vercel
// per-project to the production origin; fallback is the conventional subdomain.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_URL ?? \`https://mas-\${APP_CONFIG.name}.vercel.app\`
}
`
}

function manifestRouteTs(m: GameMeta): string {
  return `import { createManifestHandler } from '@mas/shared/miniapp'
import { APP_CONFIG, getBaseUrl } from '../../../lib/app-config'

const url = getBaseUrl()

export const GET = createManifestHandler({
  name: APP_CONFIG.title,
  subtitle: APP_CONFIG.subtitle,
  description: APP_CONFIG.description,
  homeUrl: url,
  iconUrl: \`\${url}/icon.png\`,
  splashImageUrl: \`\${url}/splash.png\`,
  splashBackgroundColor: APP_CONFIG.splashBg,
  heroImageUrl: \`\${url}/hero.png\`,
  primaryCategory: 'games',
  tags: [...APP_CONFIG.tags],
})
`
}

function layoutTsx(m: GameMeta): string {
  return `import type { Metadata, Viewport } from "next";
import { Providers } from "@mas/shared/components";
import { createEmbedMetadata } from "@mas/shared/miniapp";
import { APP_CONFIG, getBaseUrl } from "../lib/app-config";
import "./globals.css";

export function generateMetadata(): Metadata {
  const url = getBaseUrl();
  return {
    title: \`\${APP_CONFIG.title} on Base\`,
    description: APP_CONFIG.description,
    openGraph: {
      title: \`\${APP_CONFIG.title} — \${APP_CONFIG.subtitle}\`,
      description: APP_CONFIG.description,
      images: [\`\${url}/hero.png\`],
    },
    other: createEmbedMetadata({
      title: APP_CONFIG.title,
      imageUrl: \`\${url}/hero.png\`,
      homeUrl: url,
      splashImageUrl: \`\${url}/splash.png\`,
      splashBackgroundColor: APP_CONFIG.splashBg,
    }),
  };
}

export const viewport: Viewport = {
  themeColor: ${JSON.stringify(m.themeColor)},
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`
}

// ─── Apply ────────────────────────────────────────────────────────────────

async function applyToGame(key: string): Promise<{ key: string; ok: boolean; error?: string }> {
  const m = META[key]
  if (!m) return { key, ok: false, error: 'no meta' }
  const appDir = join(ROOT, 'apps', key)
  try {
    // 1) lib/app-config.ts
    await mkdir(join(appDir, 'lib'), { recursive: true })
    await writeFile(join(appDir, 'lib', 'app-config.ts'), appConfigTs(m))

    // 2) app/.well-known/farcaster.json/route.ts
    const manifestDir = join(appDir, 'app', '.well-known', 'farcaster.json')
    await mkdir(manifestDir, { recursive: true })
    await writeFile(join(manifestDir, 'route.ts'), manifestRouteTs(m))

    // 3) app/layout.tsx (full rewrite — uniform shape across all 20)
    await writeFile(join(appDir, 'app', 'layout.tsx'), layoutTsx(m))

    return { key, ok: true }
  } catch (err) {
    return { key, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const keys = args.includes('--all') ? Object.keys(META) : args.filter((a) => !a.startsWith('--'))
  if (keys.length === 0) {
    console.error('Usage: apply-miniapp-meta.ts <game> [<game>...] | --all')
    process.exit(1)
  }
  const results = await Promise.all(keys.map(applyToGame))
  for (const r of results) {
    console.log(r.ok ? `${r.key} ✓` : `${r.key} ✗ ${r.error}`)
  }
  const failed = results.filter((r) => !r.ok).length
  process.exit(failed > 0 ? 1 : 0)
}

main()
