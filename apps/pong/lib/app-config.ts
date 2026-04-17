// Centralized mini-app metadata consumed by manifest + embed builders.
// Edit here to update subtitle/description/tags; route handler + layout read from this file.

export const APP_CONFIG = {
  name: "pong",
  title: "Pong",
  subtitle: "Arcade on Base",
  description: "The original Pong, on-chain. Best of three.",
  splashBg: "#000000",
  themeColor: "#000000",
  tags: ["arcade","classic","onchain"] as const,
} as const

export type AppConfig = typeof APP_CONFIG

// Base URL for absolute asset / home URLs. NEXT_PUBLIC_URL is set in Vercel
// per-project to the production origin; fallback is the conventional subdomain.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_URL ?? `https://mas-${APP_CONFIG.name}.vercel.app`
}
