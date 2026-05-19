# Shipped backend inventory — PRs #143–154 (last 10 days)

Window: 2026-05-18 → 2026-05-19 (37+ hour sustained execution per v1.7 supplement §3.21).

## Table — one line per PR

| PR | Sprint | Title (one-line) | Backend layer | apps/ touched? | User-visible surface today |
|---:|---|---|---|---|---|
| #143 | X11.4 | DevAttributionNFT `StdInvariant` audit-prep coverage | contracts/test | none | **NO** — audit-prep only; SBT not exposed in UI |
| #144 | diag-3-cron | RCA doc on 3 production crons returning 500 | docs only | none | **NO** — RCA artifact |
| #145 | alerting-infra | Discord webhook + `withAlert` HOF + dedup migration | cron + DB + lib | `apps/orchestrator/api/cron/*` (server-only) | **NO** — operator alert channel |
| #146 | X20.1 | Solo F0 plausibility submit-gate (AntiCheat enforcement) | API/duel-backend | none directly | **PARTIAL** — generic `error` panel renders raw `f0_formula_implausible` server text |
| #147 | X14.0b | Cron settle class-mismatch exclusion (defense-in-depth) | cron | none | **NO** — settle-time hidden from player |
| #148 | docs v1.7 | Architecture supplement (596 lines additive) | docs | none | **NO** — internal doc |
| #149 | claude-md drift | CLAUDE.md stale-claim sweep × 3 | docs | none | **NO** — agent guidance |
| #150 | X19 | Schema reconciliation 9-item + CI drift gate + CODEOWNERS + pre-push | CI + DB + scripts | none | **NO** — internal hardening |
| #151 | X15.5 | Upstash sliding-window rate limiter on `apps/api` routes | API/middleware | `apps/api/src/lib/rate-limit.ts` + 5 route migrations | **PARTIAL** — 429 returned to clients (vs. cosmetic 400 before); no UI affordance for "you've been throttled" |
| #152 | X14.1 | Extension whitelist soft-warning modal + `X-Extension-Profile` audit | UI + API + 6 game pages | **6 game `tournament/solo/page.tsx`** + `packages/ui/ExtensionWarningModal.tsx` | **YES** — soft-warning modal renders inline above action area on human-only tournaments |
| #153 | X19a | Drift-check workflow auth fix (PostgREST → Management API) | CI | none | **NO** — CI gate |
| #154 | X19b | Drift reconciliation: 3 file restores + X20.0a name normalization | DB migrations | none | **NO** — registry consistency |

## Backed-context PRs (#124–142) referenced by the audit

These predate the strict #143–154 window but underpin many of the gap items below.

| PR | Sprint | Backend shipped | apps/ touched | Surface today |
|---:|---|---|---|---|
| #142 | X20.0b | `@skillos/anti-cheat` pure F0 formula + per-game coefficients | none | NO (consumed by #146) |
| #141 | X23.3 | `/v1/ratings/*`, `/v1/ratings/history/*`, `/v1/ratings/leaderboard` Hono routes | none | **NO — no UI consumer** |
| #140 | X11.3 | TournamentPool M-3 emergencyWithdraw timelock + bucket scope | none | NO — operator/audit-only |
| #139 | X23.2 | Post-settle update-ratings cron + `runUpdateRatings` | `apps/orchestrator/api/cron/update-ratings` | NO — write-only cron |
| #138 | X11.2 | M-2 EIP-712 schema lock (`BRACKET_ROUND_START_TYPEHASH`) | none | NO — contract |
| #137 | X23.1 | `@skillos/glicko-rating` package + `v4_x23_ratings.sql` schema | none | NO — package |
| #136 | X11.1 | M-1 `PullPayment` pattern for `ArcadePool.refundIfEmpty` | none | NO — contract |
| #135 | X11.0 | v2.2 TournamentPool extension scoping spec | docs | NO |
| #134 | X23.0 | Glicko-2 spec freeze | docs | NO |
| #133 | docs | Stale duel/ChallengeEscrow framing cleanup | docs | NO |
| #132 | audit-packet | Phase 1 class_tag implementation-surface disclosure | docs | NO |
| #131 | docs v1.6 | Architecture supplement v1.6 | docs | NO |
| #130 | X14.0 | Tournament class declaration + child persistence + T1+ lift | `apps/api` (middleware/schemas/routes) | **PARTIAL** — `tournamentClass` arrives in DTO and gates extension modal in solo path, but no visible "Human-only / Agent-only / Mixed" pill on tournament cards |
| #129 | sdk regen | `api.gen.ts` sync for `/v1/agents/matches/start-solo` | none | NO |
| #128 | X20.0a | Moves instrumentation plumbing across 6 game UIs (game→submit pipeline) | **6 `tournament/solo/page.tsx` + `Game*.tsx`** + `useSoloRetry` | **PARTIAL** — plumbing only; user sees nothing new yet (F0 enforcement landed in #146) |
| #127 | X11.5 | Multi-sig Safe Wallet 1-of-1 design + ceremony docs | docs | NO |
| #126 | audit packet | Wallet topology + threat model + chain inspection | docs | NO |
| #125 | docs v1.5 | Chain-verified state addendum | docs | NO |
| #124 | docs v1.5 | Architecture supplement v1.5 | docs | NO |

## Summary by classification

- **User-visible YES**: 1 PR (#152 X14.1 extension-warning modal).
- **PARTIAL** (server behavior reaches UI but no purpose-built surface): #146 (raw error string), #151 (status-code-only), #130 (class declaration on the wire but unrendered), #128 (instrumentation plumbing only).
- **NO** (backend/contracts/CI/docs/cron, zero user surface): 8 of 12 in-window PRs + ~17 of 19 context PRs.

## What the founder's "20+ backend sprints, limited UI surface" feeling reflects

In the 10-day window, the **only** PR that landed pixel-affecting code in a game app was X14.1 (#152) — and even that is an opt-in soft-warning shown only when (a) a tournament is `human-only`, and (b) the user's connector is outside MetaMask/Coinbase/Base/Rabby. The default user path sees no visible change vs. 10 days ago.

Backend depth shipped without UI: AntiCheat enforcement (X20.0b + X20.1), Glicko-2 rating system end-to-end (X23.1 + X23.2 + X23.3), tournament class declaration (X14.0 + X14.0b), DevAttributionNFT, alerting infra, rate limiting, schema drift gate, 3 contract hardening sprints (X11.1/2/3).
