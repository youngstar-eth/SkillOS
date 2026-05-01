# Skillbase

**AI-powered infrastructure for skill gaming.** Six games where players earn USDC, AI labs access decision data, and developers build on tournament + AI APIs — all on Base.

> Base Batches 003 Student Track submission. Built by Simpl3 Inc.

## Overview

Skillbase is a three-sided platform:

- **Players** compete in daily skill tournaments across six games and earn USDC from sponsor-funded prize pools. Free first entry, optional retry fees. Sweepstakes-safe (no consideration, no chance).
- **AI labs** access high-signal human decision data: every match is timestamped, anti-cheat reviewed, opt-in consented.
- **Developers** plug into the tournament framework, AI pillars, and on-chain payment rails to ship skill games without infra overhead.

Phase 1 is shipped (six games, four AI pillars, on-chain settlement, permissionless sponsorship). Mainnet launch is gated on sweepstakes legal review — Q2 2026.

## The six games

2048 · Wordle · Sudoku · Minesweeper · Clicker · Match3

Each lives at its own subdomain (`<game>.skillbase.games`) and shares the same backend stack. 2048 is the reference implementation and currently hosts the public x402 endpoints; the other five mirror its solo-tournament flow.

## Four AI pillars (all live)

| Pillar | Role | Model |
|---|---|---|
| AI Coach | Post-match tactical feedback. Every loss becomes a lesson. | Claude Sonnet 4.6 |
| AI Recap | Shareable match narratives. A viral hook per run. | Claude Haiku 4.5 |
| AI Anti-Cheat | Plausibility review on every submission. Flagged matches enter admin review. | Claude Haiku 4.5 |
| On-chain Tournaments | Sponsor-funded prize pools, transparent settlement. | Base Sepolia |

All four ship with every game. Code lives in `packages/ai-coach` (generation), `packages/duel-backend/src/api` (per-flow handlers), and is exposed via per-app routes at `/api/tournaments/solo/[runId]/{coach,recap,plausibility}`.

## Revenue streams (4 layers)

1. **In-game purchases** — retry fees (USDC), SP boosters, cosmetics. Lives in `TournamentPool.chargeRetryFee`.
2. **B2B sponsorship** — anyone can fund any tournament prize pool via the permissionless `SponsorshipModule`. Soulbound `SponsorReceipt` SBT issued per sponsorship.
3. **Developer SDK** — tournament + AI APIs as a service, with profit share (alpha — see [Phase roadmap](#phase-roadmap)).
4. **AI data layer** — anti-cheat-verified decision sequences for RLHF training and cognitive-science research.

## Architecture

**On-chain** (Base Sepolia, Foundry workspace at `/contracts`):

| Contract | Role |
|---|---|
| `TournamentPool` (v2 / v2.1) | Prize pool escrow, retry-fee collection, settlement |
| `ChallengeEscrow` | Async-duel stake escrow |
| `SponsorshipModule` | Permissionless prize-pool funding |
| `SponsorReceipt` | Soulbound NFT receipt for sponsors |
| `SanctionsOracle` | Pre-tx OFAC + sanctions screen |
| `SkillbaseAnchor` | Daily SP-ledger snapshot anchor |

ABIs and address constants are exported from `@skillbase/contracts`.

**Off-chain** (Next.js App Router on Vercel + Postgres on Supabase):

- Each app is a separate Next.js project deployed independently. Shared code lives in `/packages`.
- Per-app `/api/cron/*` routes drive tournament creation + settle (signed by `STUDIO_PRIVATE_KEY`, gated on `CRON_SECRET`).
- Solo runs flow through `/api/tournaments/solo/[runId]/{coach,recap,plausibility}`. AI is fire-on-mount: the Coach/Recap components POST to their route only when the result page is viewed (lazy, cost-conscious).
- Sponsor app (`apps/sponsor`) is the dashboard for prize-pool funding; it indexes `SponsorshipModule` events via a daily cron.

## Phase roadmap

- **Phase 1 — Shipped.** Six games, four AI pillars, on-chain settlement on Base Sepolia, sweepstakes-safe architecture, permissionless sponsorship.
- **Phase 2 — In progress.** Solo tournament submission polish, duel-mode reactivation (currently paused; every `/duel/*` route serves `<DuelComingSoon />` from `@skillbase/ui`), developer SDK alpha, sponsor onboarding pipeline.
- **Phase 3 — Q2 2026.** Mainnet deployment (post-legal-review), public SDK launch, first external sponsor.
- **Phase 4 — Q3–Q4 2026.** AI data layer licensing & marketplace beta, cross-game leaderboards, mobile/PWA.

## Repo structure

```
apps/
  2048, clicker, match3, minesweeper, sudoku, wordle  — six game apps
  sponsor                                              — sponsor pool funding dashboard
packages/
  ai-coach        — Claude-backed Coach / Recap / Anti-Cheat generation
  contracts       — ABIs + addresses + game-slug helpers
  duel-backend    — solo + duel API handlers, settle, settle-guard, cron
  game-types      — shared TypeScript types (Duel, status enums)
  lib-shared      — Supabase client, http helpers, attestation, RPC
  sp-engine       — SP system (skill points, levels, tier distribution)
  ui              — design system + shared components (Header, Providers, OG cards)
contracts/        — Foundry workspace (Solidity, scripts, tests)
docs/             — sponsor flow, audit reports, V2 backend spec
scripts/          — backfill-sp, x402-smoke, jury-tournaments seed
reports/          — codebase hygiene audits, x402 launch artifacts
```

## Quick start

```bash
cp .env.local.example .env.local   # fill in Supabase + signer + CDP keys
npm install                         # workspace install (all apps + packages)
npm run dev                         # turbo runs every app in parallel
```

Per-app dev:

```bash
npm run dev:2048                          # convenience alias
npm run dev -w @skillbase/app-wordle      # any other game
```

Health check (any app): `http://localhost:3000/api/health`.

## Live endpoints + proof

- Production sponsor app: <https://sponsor.skillbase.games>
- 2048 game + x402 public APIs: <https://2048.skillbase.games>
- x402 endpoints (Base Sepolia, CDP facilitator): docs at [`apps/2048/src/app/api/public/README.md`](apps/2048/src/app/api/public/README.md), live tx proof at [`reports/x402-live-proof.md`](reports/x402-live-proof.md).

## Reference docs

- [`docs/sponsor-flow.md`](docs/sponsor-flow.md) — sponsorship architecture, sanctions oracle, end-user flow
- [`docs/superpowers/specs/2026-04-21-skillbase-v2-backend-design.md`](docs/superpowers/specs/2026-04-21-skillbase-v2-backend-design.md) — V2 backend spec (locked)
- [`docs/audit/task-10-v2-cutover/README.md`](docs/audit/task-10-v2-cutover/README.md) — V2 cutover reconciliation
- [`reports/codebase-hygiene-20260424-1532.md`](reports/codebase-hygiene-20260424-1532.md) — pre-submission code audit (categories A-L)
