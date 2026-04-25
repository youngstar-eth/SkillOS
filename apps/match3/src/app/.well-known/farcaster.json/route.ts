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
  name: 'Skillbase Match3',
  iconUrl: "https://www.skillbase.games/icon",
  homeUrl: "https://match3.skillbase.games/tournament/solo",
  imageUrl: "https://match3.skillbase.games/opengraph-image",
  buttonTitle: "Play Match3",
  splashImageUrl: "https://match3.skillbase.games/splash.png",
  splashBackgroundColor: "#000000",
  subtitle: "Skill-based gaming on Base",
  description: 'Match-3 cascade tournaments on Base. Pay-then-play retries, AI coaching, plausibility-verified scoring.',
  primaryCategory: "games",
  tags: ["skill", "puzzle", "chain", "ai", "base"],
  tagline: "Skill data layer",
  ogTitle: "Skillbase Match3 — Skill gaming on Base",
  ogDescription: "Pay to play, skill-rewarded. AI coach, plausibility-verified scoring.",
} as const;

export function GET() {
  return NextResponse.json({ frame: MANIFEST, miniapp: MANIFEST }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
