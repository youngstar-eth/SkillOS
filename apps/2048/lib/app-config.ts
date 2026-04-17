// Centralized mini-app metadata consumed by manifest + embed builders.
// Edit here to update subtitle/description/tags; route handler + layout read from this file.

export const APP_CONFIG = {
  name: "2048",
  title: "2048",
  subtitle: "Bauhaus on Base",
  description: "Classic 2048 with a Bauhaus palette. Slide, merge, win.",
  splashBg: "#FFFBEB",
  themeColor: "#FFFBEB",
  tags: ["arcade","puzzle","onchain"] as const,
} as const

export type AppConfig = typeof APP_CONFIG

// Base URL for absolute asset / home URLs. NEXT_PUBLIC_URL is set in Vercel
// per-project to the production origin; fallback is the conventional subdomain.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_URL ?? `https://mas-${APP_CONFIG.name}.vercel.app`
}
