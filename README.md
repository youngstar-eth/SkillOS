# Skillbase

> Skill economy infrastructure for the agent era.

Verified human + agent skill arena protocol. Phase 1 testnet is live on Base Sepolia: six games, on-chain tournament settlement, three AI features, and permissionless sponsor-funded prize pools. Pure infrastructure — no custody, no protocol-level KYC, sweepstakes-safe at the storage layer.

> Brand evolution: the public-facing rebrand to **SkillOS** is queued for the Phase 2 mainnet cutover window.

The marketing site (`https://www.skillbase.games`) lives in a **separate repo** — `skillbase-apex` — and is not part of this monorepo.

## Overview

Skillbase is a 5-actor protocol:

- **Players** compete in daily skill tournaments and earn USDC from sponsor-funded prize pools. Free first entry, optional retry fees.
- **Developers** plug into the tournament framework and AI features to ship skill games without infra overhead. Public SDK is Phase 2 (see below).
- **Skillbase** runs the substrate: cron-driven tournament create + settle, attestation signer, anti-cheat review pipeline.
- **Sponsors** fund prize pools permissionlessly via `SponsorshipModule`. Soulbound `SponsorReceipt` (ERC-5192) issued per sponsorship.
- **AI Labs** access anti-cheat-verified decision sequences via x402 per-call settlement (no subscription tier).

Architectural invariants — non-negotiable, see [`CLAUDE.md`](./CLAUDE.md) for the full list:

1. **Storage-segregated sweepstakes safety.** Retry fees and prize pools live on separate slots in `TournamentPool`. Foundation treasury never funds prize pools. A buggy module physically cannot corrupt segregated accumulators.
2. **Class-agnostic protocol.** Humans and agents compete on the same arena. The storage layer does not differentiate player class.
3. **`trustedSigner` attestation.** Phase 1 reality. Decentralizes through Phase 5.
4. **Cron is the only tournament-state writer.** Manual settle paths exist only as ops break-glass.
5. **AI is fire-on-mount, not blocking.** Tournament settlement never depends on AI availability.

## Repository structure

```
apps/
  2048           — reference implementation; hosts public x402 endpoints
  wordle, sudoku, minesweeper, clicker, match3
                 — solo-tournament flow, mirror 2048 architecture
  sponsor        — permissionless prize-pool funding dashboard

packages/
  ai-coach       — Claude prompt library (Coach / Recap / Anti-Cheat per-game)
  contracts      — ABIs + addresses + game-slug helpers (re-exports from /contracts/out)
  duel-backend   — solo + duel API handlers, settle, settle-guard, cron
  game-types     — shared TypeScript types (Duel state, status enums)
  lib-shared     — Supabase client, http helpers, attestation, RPC utilities
  sp-engine      — Skill Points calculation engine
  ui             — design system + shared components

contracts/       — Foundry workspace (Solidity 0.8.26)
  src/           — Solidity sources
  test/          — Foundry tests (extend the settle-guard tripwire pattern)
  lib/           — vendored deps (openzeppelin-contracts, forge-std)
  deployments/   — chain deploy artifacts

deployments/             — chain deployment manifests (consumed by scripts + CI)
supabase/migrations/     — Postgres migration files (forward-only)
docs/                    — sponsor-flow.md, audit/, superpowers/
reports/                 — point-in-time audits
scripts/                 — backfill-sp, jury-tournaments seed, x402-smoke

@skillbase/sdk           — planned Phase 2 public release. Not yet scaffolded on disk;
                           do not import from this name yet.
```

## The six games

2048 · Wordle · Sudoku · Minesweeper · Clicker · Match3

Each lives at `<game>.skillbase.games`. 2048 is the reference implementation and currently hosts the public x402 endpoints; the other five mirror its solo-tournament flow.

## AI features (live across all six games)

| Feature | Role | Model |
|---|---|---|
| AI Coach | Post-match tactical feedback | Claude Sonnet 4.6 |
| AI Recap | Match summary | Claude Haiku 4.5 |
| AI Anti-Cheat | Server-side plausibility check on submit | Claude Haiku 4.5 |

Generation lives in `packages/ai-coach`. Per-flow handlers live in `packages/duel-backend/src/api`. AI is exposed via per-app routes at `/api/tournaments/solo/[runId]/{coach,recap,plausibility}` and POSTed from the result-page mount, not from the submission path. AI prompt formulations and anti-cheat detection methods are intentionally not documented in this README — see `packages/ai-coach` source.

## Smart contracts (Phase 1, Base Sepolia)

Foundry workspace at `/contracts/`. Solidity 0.8.26, optimizer 200 runs, no via_ir. Chain ID 84532.

Deployed v2.1 stack (April 29, 2026). Authoritative addresses live in [`deployments/sponsor-stack-base-sepolia.json`](deployments/sponsor-stack-base-sepolia.json):

| Contract | Address | Notes |
|---|---|---|
| `TournamentPool` v2.1 | `0x52049b812780134d2F69D6c20C2ef881D49702da` | Prize pool escrow, retry-fee collection, settlement (storage-segregated) |
| `SponsorshipModule` | `0xD76670adB574A4C8D06dfF47127e7143d780ff87` | Permissionless prize-pool funding |
| `SponsorReceiptSBT` | `0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768` | Soulbound receipt, ERC-5192 |
| `MockSanctionsOracle` | `0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC` | Pre-tx sanctions screen (mock; mainnet-gated swap) |

Verification: all four contracts verified on **Blockscout** (`https://base-sepolia.blockscout.com/`). Etherscan V2 API previously rejected bytecode-identical compilations; the deployment artifact records the switch.

Other Solidity sources in-tree (not part of the deployed v2.1 stack): `ChallengeEscrow.sol` (async-duel stake escrow, currently paused), `SkillbaseAnchor.sol` (daily SP-ledger snapshot anchor), `ArcadePool.sol`.

ABIs and address constants are exported from `@skillbase/contracts`.

**Tests:** 156 Foundry tests passing across 6 test suites (`forge test`). The settle-guard suite is the tripwire for the storage-segregation invariant — extend, don't skip.

**v2.2 (Phase 2 target — developer fee splitter):** moves the dev/platform split on-chain. Mainnet deployment is audit-gated; see Phase 2 below.

Scope (canonical pre-ADR record — README is the home for this spec until `docs/adr/` lands in Phase 2):

- New `createTournament(developerAddress, ...)` parameter — every tournament records the dev address that created it, on-chain.
- Separate withdrawal entrypoints — `withdrawFeesToDev()` and `withdrawFeesToPlatform()` operate on independent storage accumulators.
- Foundry invariant — `feeCollected_dev + feeCollected_platform == total_fees`, asserted in the storage-segregation test suite (same tripwire shape as the v2.1 settle-guard).
- Soulbound dev-attribution NFT — issued to `developerAddress` per tournament for the audit trail.

## Architecture

**Economic flows (Phase 1).** 1 USDC retry fees split 70/30 dev/platform (off-chain accounting in Phase 1; moves on-chain in v2.2). Permissionless sponsor funding routes directly into segregated prize-pool slots via `SponsorshipModule`. AI-lab data licensing settles per-call via x402 micropayments — no subscription tier.

**On-chain.** See [Smart contracts](#smart-contracts-phase-1-base-sepolia) above.

**Off-chain.** Next.js App Router on Vercel + Postgres on Supabase.

- Each app is a separate Next.js project deployed independently to its own Vercel project under scope `simpl3s-projects`. Shared code lives in `/packages`. Turborepo 2.3.3 orchestrates dev/build/lint/typecheck across the workspace.
- Per-app `/api/cron/*` routes drive tournament create + settle (signed by `STUDIO_PRIVATE_KEY`, gated on `CRON_SECRET`). Cron is the only writer of tournament state.
- Solo runs flow through `/api/tournaments/solo/[runId]/{coach,recap,plausibility}`. AI is fire-on-mount — Coach/Recap components POST only when the result page is viewed.
- Sponsor app (`apps/sponsor`) is the dashboard for prize-pool funding; it indexes `SponsorshipModule` events via a daily cron.

## Phase roadmap

Two numbering systems coexist in the codebase: a **product roadmap** (Phase 1 → 5, this section) and **engineering-internal contract versions** (v2.0 → v2.1 → v2.2, Smart Contracts section above). Don't reconcile — the audiences differ. See [`CLAUDE.md`](./CLAUDE.md#two-phase-numbering-systems).

- **Phase 1 — Shipped (now).** Testnet on Base Sepolia. Six games, three AI features, on-chain tournament settlement, permissionless sponsor MVP, Blockscout-verified v2.1 stack.
- **Phase 2 — Mainnet activation (Q3 2026, audit-gated).** v2.2 developer fee splitter (on-chain 70/30), `@skillbase/sdk` public release, agent player-class API, SkillOS rebrand cutover, sponsor onboarding pipeline. Mainnet contingent on sweepstakes legal review.
- **Phase 3+ (achievement-gated).** Dispute layer, Emergency Games Fund, ad revenue.
- **Phase 4+ (achievement-gated, optional).** Substrate-maturity-gated decisions including potential governance token + opt-in data tokenization. Triggers: sustained adoption + regulatory clarity (Howey/MiCA) + organic economy maturity + lawyer review. The SP system can remain off-chain accounting indefinitely if the platform doesn't warrant tokenization. Optionality > obligation.
- **Phase 5 (vision).** Substrate intelligence — native AI oracle, foundation models trained on anti-cheat-verified decision data.

## Development setup

**Requirements:**
- Node.js ≥ 20.0.0
- npm ≥ 10.0.0 (workspaces)
- Foundry (for contract work) — `forge`, `cast`, `anvil`
- Supabase project (URL + service-role key) for database-backed flows

**Install + dev:**

```bash
npm install                                # workspace install (all apps + packages)
npm run dev                                # turbo runs every app in parallel
npm run dev:2048                           # 2048 only (convenience alias)
npm run dev -w @skillbase/app-wordle       # any other game
```

Health check (any app, after `dev`): `http://localhost:3000/api/health`.

**Environment variables.** Each app has its own `.env.local.example` — there is no root-level template. Copy per app:

```bash
cp apps/2048/.env.local.example apps/2048/.env.local
# repeat for each app you intend to run
cp contracts/.env.example contracts/.env   # Foundry RPC + signer
```

Required keys (per app, see each `.env.local.example` for the canonical list): Supabase URL + service-role key, `STUDIO_PRIVATE_KEY`, `CRON_SECRET`, CDP / x402 facilitator keys (2048 only).

**Foundry tests:**

```bash
cd contracts
forge test                                 # 156 tests, 6 suites
forge test --match-contract TournamentPool # focused suite
```

**Database (Supabase).** Migrations are forward-only and live in `supabase/migrations/` (currently 11 files, `v2_*.sql` lineage starting 2026-04-21). Apply via the Supabase REST API or `supabase db push`.

**Vercel deployment.** Each app is its own Vercel project; install/build commands are pinned via per-app `vercel.json` (Vercel UI parsing has historically truncated workspace-relative install commands — do not rely on the dashboard for these). See [`CLAUDE.md`](./CLAUDE.md#vercel-push-gating) for the canonical git author identity required for pushes to Vercel-linked branches.

**No CI today.** `.github/workflows/` does not exist. PR checks are honor-system in Phase 1; required typecheck + lint + Foundry test gates land with the Phase 2 discipline transition.

## Engineering principles

1. **Sweepstakes safety > everything.** Storage-layer invariant, non-negotiable. Any change risking it requires explicit founder discussion before merge.
2. **Sponsor-funded prize pools only.** Enforced on-chain.
3. **Class-agnostic protocol.** Storage doesn't differentiate human vs. agent player class.
4. **Honest framing > overclaim.** Pitch what's shipped; signal what's roadmap; never promise unconditional tokens.
5. **CLI/MCP first.** Use `vercel`, `gh`, `cast`, `forge`, `supabase`, `npm` over dashboard manual work.
6. **Phase 2 discipline (transitioning):** direct-to-main BANNED, branch + PR + review mandatory, ADR docs (`docs/adr/`) for major decisions, pre-commit hooks (typecheck + secret scan), integration test expansion.

See [`CLAUDE.md`](./CLAUDE.md) for the full operational playbook.

## License

Currently private. License decisions deferred to the Phase 2 mainnet / SDK launch window.

## Live endpoints + proof

- Production sponsor app: <https://sponsor.skillbase.games>
- 2048 game + x402 public APIs: <https://2048.skillbase.games>
- x402 endpoints (Base Sepolia, CDP facilitator): docs at [`apps/2048/src/app/api/public/README.md`](apps/2048/src/app/api/public/README.md), live tx proof at [`reports/x402-live-proof.md`](reports/x402-live-proof.md).

## Reference docs

- [`CLAUDE.md`](./CLAUDE.md) — agent-operational guidance, architectural invariants, decision priority order
- [`docs/sponsor-flow.md`](docs/sponsor-flow.md) — sponsorship architecture, sanctions oracle, end-user flow
- [`docs/superpowers/specs/2026-04-21-skillbase-v2-backend-design.md`](docs/superpowers/specs/2026-04-21-skillbase-v2-backend-design.md) — V2 backend spec (locked)
- [`docs/audit/task-10-v2-cutover/README.md`](docs/audit/task-10-v2-cutover/README.md) — V2 cutover reconciliation
- [`reports/codebase-hygiene-20260424-1532.md`](reports/codebase-hygiene-20260424-1532.md) — pre-submission code audit (categories A–L)

## Links

- Live: <https://www.skillbase.games>
- Sponsor app: <https://sponsor.skillbase.games>
- Game examples: <https://2048.skillbase.games>, <https://wordle.skillbase.games>
- X / Twitter: [@SkillOS](https://x.com/SkillOS)
- Telegram: <https://t.me/Skill_OS>
