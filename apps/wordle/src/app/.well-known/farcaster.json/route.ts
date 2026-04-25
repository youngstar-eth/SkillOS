import { NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────────────────
// Farcaster Mini App manifest. Spec:
//   https://miniapps.farcaster.xyz/docs/specification
//
// We emit BOTH `frame` (legacy spec key) and `miniapp` (current spec key)
// with identical payloads — Base App, Warpcast, and other clients have
// shifted between the two over time, and emitting both ensures any
// compliant indexer can read the manifest.
//
// `accountAssociation` (FID-signed domain ownership) is intentionally
// omitted — Base App's distribution path uses Base.dev meta-tag domain
// verification (Gate 1) instead. accountAssociation is Phase 2 if/when we
// also want native Warpcast app-store discovery.
// ──────────────────────────────────────────────────────────────────────────

const MANIFEST = {
  version: "1",
  name: 'Skillbase Wordle',
  iconUrl: "https://www.skillbase.games/icon",
  homeUrl: "https://wordle.skillbase.games/tournament/solo",
  imageUrl: "https://wordle.skillbase.games/opengraph-image",
  buttonTitle: "Play Wordle",
  splashImageUrl: "https://wordle.skillbase.games/splash.png",
  splashBackgroundColor: "#000000",
  subtitle: "Skill-based gaming on Base",
  description: 'Daily 5-letter Wordle on Base. Skill-rewarded, AI-coached, on-chain scoring.',
  primaryCategory: "games",
  tags: ["skill", "word", "daily", "ai", "base"],
  tagline: "Skill data layer",
  ogTitle: "Skillbase Wordle — Skill gaming on Base",
  ogDescription: "Pay to play, skill-rewarded. AI coach, plausibility-verified scoring.",
} as const;

export function GET() {
  return NextResponse.json({ frame: MANIFEST, miniapp: MANIFEST }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
