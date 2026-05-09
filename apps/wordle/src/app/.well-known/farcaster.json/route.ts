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
  payload: "eyJkb21haW4iOiJ3b3JkbGUuc2tpbGxiYXNlLmdhbWVzIn0",
  signature: "CYyTy5sbRUL4h3ADPz/0bgfZgM6nfsRwzPGzq1RCANMcIn9Ajh6G2iyKJC1Ik8vZowSvXccfPOTd3SC3lFzUGRs=",
} as const;

const MANIFEST = {
  version: "1",
  name: 'SkillOS Wordle',
  iconUrl: "https://wordle.skillbase.games/icon",
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
  ogTitle: "SkillOS Wordle on Base",
  ogDescription: "Pay to play, skill-rewarded. AI coach, plausibility-verified scoring.",
} as const;

export function GET() {
  return NextResponse.json({ accountAssociation: ASSOCIATION, miniapp: MANIFEST, frame: MANIFEST }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
