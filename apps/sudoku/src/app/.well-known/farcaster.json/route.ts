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
  payload: "eyJkb21haW4iOiJzdWRva3Uuc2tpbGxiYXNlLmdhbWVzIn0",
  signature: "qy+hQs8MHG+jafwxL3JkIefO8O4jUAhtF/eoBZESBEEtNaL9yaeCyrpglnTPLVCq25jHT3lb1189BWhoVppyOxw=",
} as const;

const MANIFEST = {
  version: "1",
  name: 'Skillbase Sudoku',
  iconUrl: "https://www.skillbase.games/icon",
  homeUrl: "https://sudoku.skillbase.games/tournament/solo",
  imageUrl: "https://sudoku.skillbase.games/opengraph-image",
  buttonTitle: "Play Sudoku",
  splashImageUrl: "https://sudoku.skillbase.games/splash.png",
  splashBackgroundColor: "#000000",
  subtitle: "Skill-based gaming on Base",
  description: 'Sudoku skill tournaments on Base. Pay-then-play retries, AI coaching, plausibility-verified scoring.',
  primaryCategory: "games",
  tags: ["skill", "logic", "puzzle", "ai", "base"],
  tagline: "Skill data layer",
  ogTitle: "Skillbase Sudoku on Base",
  ogDescription: "Pay to play, skill-rewarded. AI coach, plausibility-verified scoring.",
} as const;

export function GET() {
  return NextResponse.json({ accountAssociation: ASSOCIATION, miniapp: MANIFEST, frame: MANIFEST }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
