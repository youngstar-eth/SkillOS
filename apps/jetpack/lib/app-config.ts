// Centralized mini-app metadata consumed by manifest + embed builders.
// Edit here to update subtitle/description/tags; route handler + layout read from this file.

export const APP_CONFIG = {
  name: "jetpack",
  title: "Jetpack",
  subtitle: "Cybercore on Base",
  description: "Cyber-grid Jetpack. Hold to thrust, dodge lasers.",
  splashBg: "#080A19",
  themeColor: "#080A19",
  tags: ["arcade","endless","onchain"] as const,
} as const

export type AppConfig = typeof APP_CONFIG

// Base URL for absolute asset / home URLs. NEXT_PUBLIC_URL is set in Vercel
// per-project to the production origin; fallback is the conventional subdomain.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_URL ?? `https://mas-${APP_CONFIG.name}.vercel.app`
}
