// Centralized mini-app metadata consumed by manifest + embed builders.
// Brand constants come from @mas/shared/brand; per-game fields stay local.

import { SKILLBASE_BRAND } from "@mas/shared/brand"

export const APP_CONFIG = {
  name: "breakout",
  title: "Breakout",
  subtitle: "Y2K on Base",
  description: "Y2K-era Breakout. Chip away and win. Part of skillbase.",
  splashBg: "#B4E1FF",
  themeColor: "#B4E1FF",
  tags: ["skillbase","arcade","onchain"] as const,
  brandName: SKILLBASE_BRAND.name,
  brandTagline: SKILLBASE_BRAND.tagline,
} as const

export type AppConfig = typeof APP_CONFIG

// Base URL for absolute asset / home URLs. NEXT_PUBLIC_URL is set in Vercel
// per-project to the production origin; fallback is the conventional subdomain.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_URL ?? `https://mas-${APP_CONFIG.name}.vercel.app`
}
