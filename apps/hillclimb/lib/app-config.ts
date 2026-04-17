// Centralized mini-app metadata consumed by manifest + embed builders.
// Brand constants come from @mas/shared/brand; per-game fields stay local.

import { SKILLBASE_BRAND } from "@mas/shared/brand"

export const APP_CONFIG = {
  name: "hillclimb",
  title: "Hill Climb",
  subtitle: "Dieselpunk on Base",
  description: "Dieselpunk hill climb. Manage fuel, dont flip. Part of skillbase.",
  splashBg: "#323728",
  themeColor: "#323728",
  tags: ["skillbase","arcade","physics","onchain"] as const,
  brandName: SKILLBASE_BRAND.name,
  brandTagline: SKILLBASE_BRAND.tagline,
} as const

export type AppConfig = typeof APP_CONFIG

// Base URL for absolute asset / home URLs. NEXT_PUBLIC_URL is set in Vercel
// per-project to the production origin; fallback is the conventional subdomain.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_URL ?? `https://mas-${APP_CONFIG.name}.vercel.app`
}
