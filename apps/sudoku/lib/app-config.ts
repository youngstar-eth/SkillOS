// Centralized mini-app metadata consumed by manifest + embed builders.
// Brand constants come from @mas/shared/brand; per-game fields stay local.

import { SKILLBASE_BRAND } from "@mas/shared/brand"

export const APP_CONFIG = {
  name: "sudoku",
  title: "Sudoku",
  subtitle: "Newspaper on Base",
  description: "Sudoku with newspaper typography. Nine cells at a time. Part of skillbase.",
  splashBg: "#F5F1E8",
  themeColor: "#F5F1E8",
  tags: ["skillbase","puzzle","logic","onchain"] as const,
  brandName: SKILLBASE_BRAND.name,
  brandTagline: SKILLBASE_BRAND.tagline,
} as const

export type AppConfig = typeof APP_CONFIG

// Base URL for absolute asset / home URLs. NEXT_PUBLIC_URL is set in Vercel
// per-project to the production origin; fallback is the conventional subdomain.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_URL ?? `https://mas-${APP_CONFIG.name}.vercel.app`
}
