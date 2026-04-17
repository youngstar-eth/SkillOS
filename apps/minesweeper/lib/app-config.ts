// Centralized mini-app metadata consumed by manifest + embed builders.
// Edit here to update subtitle/description/tags; route handler + layout read from this file.

export const APP_CONFIG = {
  name: "minesweeper",
  title: "Minesweeper",
  subtitle: "Retro on Base",
  description: "Classic Minesweeper with a retro-Windows look.",
  splashBg: "#C0C0C0",
  themeColor: "#C0C0C0",
  tags: ["puzzle","classic","onchain"] as const,
} as const

export type AppConfig = typeof APP_CONFIG

// Base URL for absolute asset / home URLs. NEXT_PUBLIC_URL is set in Vercel
// per-project to the production origin; fallback is the conventional subdomain.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_URL ?? `https://mas-${APP_CONFIG.name}.vercel.app`
}
