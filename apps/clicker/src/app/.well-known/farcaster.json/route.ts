import { NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────────────────
// Farcaster Mini App manifest. Spec:
//   https://miniapps.farcaster.xyz/docs/specification
//
// `accountAssociation` is signed by the @skillbase Farcaster account
// (FID 3321662) via Warpcast's Mini App Manifest Tool. The header is shared
// across all 6 game subdomains (same custody key); payload and signature
// are per-domain. accountAssociation MUST be the first field in the JSON
// response per spec; payload base64-decodes to {"domain":"<this subdomain>"}.
//
// We emit BOTH `frame` (legacy spec key) and `miniapp` (current spec key)
// with identical payloads — Base App, Warpcast, and other clients have
// shifted between the two over time; emitting both ensures any compliant
// indexer can read the manifest.
// ──────────────────────────────────────────────────────────────────────────

const ASSOCIATION = {
  header: "eyJmaWQiOjMzMjE2NjIsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHhlQjExRjNiMzcyYzIzRjZkMkM5MmE1NmY5ZTIyNDgyQ0Q5YjA2NmZjIn0",
  payload: "eyJkb21haW4iOiJjbGlja2VyLnNraWxsYmFzZS5nYW1lcyJ9",
  signature: "5OAq6zWKjzHKxj9kKDWrUlldxI7XzGUtUM2H7VQjmt9DD84PBP0ogYBFsSTLx3arWdd0oR82+7X/h8gVbnbTohs=",
} as const;

const MANIFEST = {
  version: "1",
  name: 'Skillbase Clicker',
  iconUrl: "https://www.skillbase.games/icon",
  homeUrl: "https://clicker.skillbase.games/tournament/solo",
  imageUrl: "https://clicker.skillbase.games/opengraph-image",
  buttonTitle: "Play Clicker",
  splashImageUrl: "https://clicker.skillbase.games/splash.png",
  splashBackgroundColor: "#000000",
  subtitle: "Skill-based gaming on Base",
  description: 'Reflex tap tournaments on Base. Pay-then-play retries, AI coaching, plausibility-verified scoring.',
  primaryCategory: "games",
  tags: ["skill", "reflex", "fast", "ai", "base"],
  tagline: "Skill data layer",
  ogTitle: "Skillbase Clicker on Base",
  ogDescription: "Pay to play, skill-rewarded. AI coach, plausibility-verified scoring.",
} as const;

export function GET() {
  return NextResponse.json({ accountAssociation: ASSOCIATION, miniapp: MANIFEST, frame: MANIFEST }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
