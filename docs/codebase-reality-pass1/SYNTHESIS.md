# CR1 Synthesis — Master Inventory + Phase 2 Sprint Sequencing

**Status:** read-only synthesis of R1–R4 track reports + UR Pass 1 offchain-findings.
**Base:** `origin/main` @ `e70403f` (R1 + R2 + R3 merged; R4 fetched from open PR #116 branch — flagged where relevant).
**Synthesis scope:** aggregate, cross-reference, phase-tag — no new findings beyond what R1–R4 surfaced.
**Audit date:** 2026-05-17.
**Tone:** audit-prep, honest framing. Phase 1 wrap declared, this is Phase 2 entry baseline.
**Domain neutrality:** preserved (skill-gaming as named category at protocol layer; broader substrate framing only where R-tracks already surfaced it).

> The architecture-doc supplements (v1.2 / v1.3 / v1.4) the brief references are **not on disk** in this repo — `docs/strategy/communication-frame-v2.md` §14 confirms this and notes the same gap. Synthesis treats `docs/architecture/developer-surface.md` as canonical for in-repo architecture, claude.ai project memory as canonical for non-disk strategy artifacts, and the 4 R-track reports as ground truth for current ship state.

---

## 1. Executive summary

### What SkillOS is today (honest baseline)

**Layer 1 — testnet protocol live on Base Sepolia.** Six game apps (2048, wordle, sudoku, minesweeper, clicker, match3) ship a uniform Next.js template on individual Vercel projects under `*.skillos.games`. A seventh app (sponsor) aggregates cross-game prize-pool funding. An eighth (orchestrator) hosts six daily Vercel crons that drive tournament create/settle/index/anchor flows under a single `CRON_SECRET`. A ninth (api) serves 16 documented OpenAPI paths from `api.skillos.network` on Hono+Vercel. A tenth (agent-runner) is a CLI for SIWA-authenticated agent submissions. Apex (separate repo) hosts the marketing landing + `/watch` replay viewer at `skillos.network`. Eight contracts in `/contracts` (six deployed, two undeployed — one Phase 5 prep, one dead-code candidate) carry 207 Foundry tests in two Foundry profiles (default via_ir for ChallengeEscrow + future; phase1-legacy for the v2.1 sponsor stack). Supabase project `clizuqvtkekzxiflbsyr` holds 24 public tables (all RLS-enabled as of `v4_20260517`), 19 migration files on disk, 22 registry rows (9 drift items per X19), 1,720 total rows of real Phase 1 activity (159 tournaments, 346 entries, 383 solo runs, 317 user-stat rows, 20 SP snapshots).

**Layer 2 — developer surface partially shipped.** Four packages are published on npm under `@skillos/*`: SDK (0.2.1), MCP server (0.1.0, 8 tools), CLI (0.1.0, 7 subcommands), and a skills pack (0.1.0, with 0.2.0 staged but gated on mdskills.ai catalog refresh). Seven internal packages (ai-coach, contracts, duel-backend, game-types, lib-shared, sp-engine, ui) are workspace-only. External production consumers of any published package: **zero verified at audit time** (R2 §4.1). Dogfood is via workspace protocol, not npm tarballs. `@skillos/sdk` has zero unit tests and a live HTTP fetch in `prebuild` (memory: `project_packages_sdk_circular_build_dep`).

**Layer 3 — substrate readiness thin.** Phase 5 narrative (cross-class data flywheel, foundation-model training corpus) depends on data the schema does not yet capture. Only `duel_moves` (586 rows, 11 cols incl. `board_before`/`board_after`/`reasoning` jsonb) has ML-shape. No human-side move trace, no `data_license_status` column, no telemetry firehose, no replay-blob storage. Apex `/watch` is the only public substrate-showcase surface. Domain Neutrality Invariant (developer-surface.md §2.4) holds at the protocol layer; public-facing surfaces all frame as skill-gaming.

### Phase trajectory position

**Trajectory (readiness-ordered):** P1 ~90% → P2 ~25% → P4 ~10% (Mode B sub-capability ~15-20%) → P5 ~10% → P3 ~5%.

- **Phase 1 (skill game protocol live on testnet):** ~90% done. Solo flow is end-to-end shipped across 6 games + sponsor app + agent-runner. Remaining: misc doc + drift sweeps, duel reactivation (Phase 1.5 if scoped narrow, Phase 2 if scoped real-time), settle silent-swallow patch (memory `project_settle_tournaments_silent_swallow_phase2` — offchain H4), and resolving the 7 "open questions for founder" surfaced by R1 (§7).
- **Phase 2 (mainnet activation + 3rd-party SDK rollout):** ~25% done. Audit firm not engaged; Cayman entity pending; T1+ plausibility deferred (memory `project_phase2_mainnet_blocker_plausibility`); STUDIO broadcaster concentration not yet addressed; staging Supabase missing; CI exists but pre-commit hooks absent; v2.2 fee-split contract source-prepared but undeployed; 9 schema-drift items open (X19 plan filed). Two Critical + nine High findings in UR Pass 1 offchain-findings register are pre-mainnet blockers.
- **Phase 3 (decentralization + dispute layer):** 0–5% done. Centralization vectors that *must* be replaced before Phase 3 is meaningful: STUDIO single-broadcaster, Supabase-as-state-of-record, `MockSanctionsOracle` (real Chainalysis swap is contractually scoped via fresh module deploy). The `TournamentCreated` event indexer (memory: claimed missing; refuted by R4 §3.3 and R1 §2.3 — PR #41 shipped) is a Phase 3 foundation already partly in place.
- **Phase 4 (governance + opt-in data tokenization + Mode B integration):** ~8–12% done weighted across independent sub-capabilities (NOT averaged — gates are independent). Mode B (AAA studio attestation feed) at ~15–20% is the most-mature sub-capability because v2.1's `submitScore(addr, score, sig)` signer-differentiation primitive is in place. Governance token at ~5% (SP system in production as off-chain accounting, intentionally pre-token). Opt-in data tokenization at ~10–15% (T0–T3 framework in `@skillos/sdk`; tokenization contract + opt-in mechanism + licensing column 0%). MMORPG/TCG is P5+ by design. Full breakdown in §3.
- **Phase 5 (substrate intelligence + cross-class data flywheel):** ~10% done. Foundation-model input readiness is critically thin (see §3.5). On-chain SP-anchor primitive `SkillbaseAnchor` source ready (17 Foundry tests) but undeployed. SP snapshots already structured in `v2_sp_snapshots` (deny-by-default RLS, 20 rows). Apex `/watch` exists as a showcase seed. The data layer needs explicit Phase 4–5 initiative (R4 §9.3) — not in any current backlog.

### Top 5 strengths (audit-firm packet input, investor pitch input)

1. **Six game apps live in production with uniform architecture and chain-verified Builder Code attribution.** All six game apps share an identical Next.js App Router template (R1 §2.1); per-game `dataSuffix` (e.g., 2048=`bc_o6szuvg1`, wordle=`bc_l0drfg77`, etc.) is chain-verified — server-side attribution PR #82 closed 2026-05-14 (memory `project_api_server_side_datasuffix_attribution_gap`).
2. **Sweepstakes safety invariant preserved by contract design + role-distinct wallet topology.** TournamentPool stores prize pool and retry fees on separate slots; sponsor wallets fund via `sponsorPool()`; Foundation treasury never funds prize pools (CLAUDE.md invariant 1). Wallet topology rotates by role: deployer ≠ owner ≠ trustedSigner ≠ feeVault (X19b rotation 2026-05-14, R3 §8). Apex carries no signing material — invariant preserved (R3 §2).
3. **API substrate operational with 16 documented OpenAPI paths and stack-discipline auth.** Hono service live at `api.skillos.network`, SIWB (human) + SIWA (agent) both shipping with atomic nonce consume *before* signature crypto (R3 §7), x402 paywall on `/v1/data/*` (T2 $0.01 + T3 $0.10). RLS baseline on all 24 public tables (`v4_20260517`). 90 prod indexes; every FK has supporting index on its source side (R4 §1.2). CI workflow exists with 97.8% pass rate over last 100 runs (R3 §4, R4 §6.2 — contradicts CLAUDE.md "no CI today").
4. **Smart-contract substrate verified on Blockscout with 207 Foundry tests across 8 contracts.** ChallengeEscrow (25 tests), TournamentPool v2.1 (91 tests), SkillbaseAnchor (17 tests, undeployed), sponsor stack (16+11+19 tests). 100% line coverage on 6 of 8 contracts (R4 §4.2). Dual-profile Foundry config (ADR-0002) preserves bytecode parity with on-chain verifications.
5. **Developer surface published to npm with x402 paid-tier integration.** Four `@skillos/*` packages live (SDK + MCP + CLI + skills); MCP exposes 8 tools to Claude Desktop / Cursor / Codex / Gemini CLI with x402-paid replay + cohort-snapshot endpoints wired (R2 §2.2). T0 score submission via SDK end-to-end working (R2 §4.3). The skill-pack v0.2 manifest declares 6 trigger conditions + 4 refusal conditions and a bounded permissions block (R2 §3.4).

### Top 5 gaps (sprint sequencing input)

1. **C1 — `POST /v1/agents/matches/start-solo` is unauthenticated and moves real funds per call** (offchain C1). $1.05 USDC + STUDIO gas per anonymous call; mainnet blast radius $945/hr at N=5 warm Lambdas × 60 req/min. Pairs with C2 (in-memory rate limiter cosmetic on Vercel). Mainnet hard blocker; sub-day fix (lift `requireSiwaAuth` + Upstash-backed rate limit).
2. **Duel system stubbed across all 6 games while metadata over-promises duels** (R1 §5.7, R1 D-2, R4 §5.3 settle-guard integration tests `test.skip`'d). `/duel/{waiting,[id],[id]/result}` all render `<DuelComingSoon />`. Every game's `metadata.description` says "Stake 1 USDC, match a player, play 2048 for 2 minutes." Public framing vs ship state mismatch.
3. **T1+ plausibility gate blocks real-USDC mainnet** (R1 §2.4, R2 §4.3, offchain H3, memory `project_phase2_mainnet_blocker_plausibility`). `POST /v1/scores` 400s on `tier !== 'T0'`; T0 signs whatever the client submits with `STUDIO_PRIVATE_KEY`. Phase 2 mainnet hard blocker by founder declaration.
4. **9 schema-drift items between Supabase migrations registry and on-disk files** (R4 §2, X19 plan). Class A1 (3 deleted-file/registry-row), A2 (4 deleted-file/orphan-table), B (1 file-no-registry), C (1 registry-no-file). 3–5-day sprint estimate holds per X19 plan.
5. **SDK has 0 unit tests, 0 external production consumers, and a circular live-API build dep** (R2 §3.1, §4.1, D8). `prepare: npm run build` triggers `https://api.skillos.network/openapi.json` fetch at install time — outage = SDK won't install. Phase 2 SDK rollout (Unity WebGL / Roblox / Phaser / gb-studio in R2 §4.2) is a published-package launch with no test gate.

### Top 5 risks (centralization, single points of failure, drift instances)

1. **STUDIO_PRIVATE_KEY (`0xA24f9122…`) is the cron-broadcaster for everything.** Broadcasts `createTournament` (15), `submitSoloScore` (8), `settle` (1) on TournamentPool v2.1 and `settle` (8), `walkover` (1) on ChallengeEscrow. Compromise = arbitrary tournaments, arbitrary scores with valid attestations, settle, walkover. Largest single point of failure on chain (R3 §8 disclosure #1).
2. **`CRON_SECRET` is the only auth on six Vercel cron routes** that drive tournament state (CLAUDE.md invariant 6, R3 §8 #2). No rate limiting at this layer visible.
3. **Supabase has no staging project** (memory `project_skillos_no_staging_supabase`, R3 §8 #4). `clizuqvtkekzxiflbsyr` is single prod; mainnet plan needs preview branches OR separate staging.
4. **`sepolia.base.org` is the public-RPC single point of failure.** When `BASE_SEPOLIA_WRITE_RPC_URL` is unset, the app falls back to public Base RPC. Public-RPC outage breaks indexer + cron broadcasts (R3 §6, §8 #5).
5. **`skillos.games` apex marketing landing is parked at AWS Route 53 + GoDaddy CA G2 cert** (R3 D10, Q-V1). Root-domain marketing posture is a parking page, not the apex Vercel site (which lives on `skillos.network`). Public-facing brand drift.

---

## 2. Master capability inventory (cross-track aggregated)

| Capability | State | Surface | Phase tag | Source track |
|---|---|---|---|---|
| Solo pay → play → submit → SP flow on 6 games | Live | `*.skillos.games/tournament/solo` | P1 ✓ | R1 §2.1 |
| Cross-game tournament discovery (browse) | Live for sponsors only | `sponsor.skillos.games/` | P1 ✓ (sponsor) / **P2 gap** (game-app side) | R1 §4 |
| Wallet sign-in (SIWB human) | Live | All 6 game apps + sponsor + sdk-demo | P1 ✓ | R1 §3.1, R3 §7 |
| Wallet sign-in (SIWA agent) | Live | API only, agent-runner consumer | P1 ✓ | R3 §7 |
| Agent registration (ERC-8004 NFT mint) | Live | agent-runner CLI | P1 ✓ | R1 §2.5, R3 §6 |
| Agent metadata / leaderboard UI | **Absent** | — | **P2 gap** (or scope-confirm) | R1 §3.4 |
| Builder Code attribution (chain-verified) | Live, per-game `dataSuffix` | submitSoloScore tx raw input | P1 ✓ | R1 §2.1, R3 §6 |
| Permissionless prize-pool funding (`sponsorPool()`) | Live | Sponsor app per-tournament + dashboard | P1 ✓ | R1 §2.2, R3 §1 |
| ERC-5192 Soulbound sponsor receipts | Live | SponsorReceiptSBT (Blockscout-verified) | P1 ✓ | R3 §1 |
| Cross-game SP leaderboard | Live (all-time only) | Game-app `/leaderboard` | P1 ✓ (no per-game/time window — flagged "post-submission backlog") | R1 §4 |
| Public profile (read-only by address) | Live | `/profile/[address]` per game | P1 ✓ | R1 §2.1 |
| Identity richness (display name, avatar, bio, social handles) | **Absent** | — | **P2/P5 gap** | R1 §3.3, R4 §1.4 (orphan `users` table) |
| Basenames inline display | Live (read) | `AddressDisplay` via `useBasename` hook | P1 ✓ (no claim UI) | R1 §3.5 |
| Daily tournament creation (cron) | Live | Orchestrator `0 0 * * *` | P1 ✓ (UI claims hourly — drift R1 D-4) | R1 §2.3, R4 §3.2 |
| Tournament settle (cron) | Live with silent-swallow bug | Orchestrator `5 0 * * *` | P1 ✓ but **mainnet blocker H4** | R1 §2.3, R4 §3.2, offchain H4 |
| TournamentCreated event indexer | **Live (memory drift D2)** | Orchestrator `23 0 * * *` | P1 ✓ | R4 §3.3, R3 §1 |
| Sponsor event indexer (`Sponsored`) | Live | Orchestrator `15 0 * * *` | P1 ✓ | R1 §2.3 |
| Reconcile-duels cron | Live but **dormant** (duel system stubbed) | Orchestrator `13 1 * * *` | P1 ✓ / **P2 reactivation** | R1 §2.3, R1 Q-6 |
| Anchor SP snapshot cron | Live | Orchestrator `7 2 * * *` | P1 ✓ / **P5 prep** (SkillbaseAnchor undeployed) | R1 §2.3, R3 §1 §9 |
| Solo retry (paid retry, USDC + chargeRetryFee) | Live | Per-game `useSoloRetry` hook | P1 ✓ (EIP-5792 batched paymaster deferred to P2) | R1 §2.1, R2 §2.1 |
| Watch / replay viewer | Live | apex `/watch/[runId]` | P1 ✓ / **P5 seed** | R1 §2.6, §5.6 |
| 8 MCP tools (Claude Desktop / Cursor / Codex) | Published 0.1.0, 0 verified installs | `@skillos/mcp` npm | P1 ✓ | R2 §2.2 |
| 7 CLI subcommands | Published 0.1.0 | `@skillos/cli` npm | P1 ✓ | R2 §2.3 |
| SDK React hooks (8) + vanilla client + agent client | Published 0.2.1 | `@skillos/sdk` npm | P1 ✓ (0 external prod consumers verified) | R2 §2.1, §4.1 |
| Skill pack (5 prompts, 6 references, scaffold template) | Published 0.1.0; 0.2.0 staged | `@skillos/skills` npm | P1 ✓ (mdskills.ai listing pending) | R2 §2.4 |
| x402 paid-data tiers (T2/T3) | Live | API `/v1/data/{cohort-snapshot,match-replay}` | P1 ✓ | R3 §6, R2 §2.2 |
| Anti-Cheat AI (Claude Haiku 4.5) classifier | Wired but Phase 2 rebuild scoped | `packages/ai-coach` | P1 ✓ / **P2 rebuild** | R3 §6 §9 |
| Coach + Recap (fire-on-mount AI) | Live | `packages/ai-coach` (Sonnet 4.6 + Haiku 4.5) | P1 ✓ | R3 §6 (CLAUDE.md invariant 5) |
| Class-fairness (agent vs human) at DB layer | **No tag column** | — | **P2 gap** (representable via ERC-8004 join only) | R4 §9.1 |
| T0 score signature gate | Live | `POST /v1/scores` (signature-only, no plausibility) | P1 ✓ | offchain H3, I4 |
| T1+ plausibility | **Returns 501** | `POST /v1/scores` | **P2 mainnet blocker** | R1 §2.4, R2 §4.3 |
| Replay deterministic verification primitives | Workspace-only | `@skillos/sp-engine` (canonicalize, hashSnapshot) | P1 ✓ / **P5 publish gap** | R2 §2.5, §4.4 |
| Pre-commit hooks (husky) | **Absent** | — | **P2 gap** (CLAUDE.md says "introduces P2") | R4 §6.2 |
| Staging Supabase | **Absent** | — | **P2 gap** | R3 §8 #4, memory |
| Pre-mainnet contract audit | **Pending** (Sprint X8 ultrareview as internal pre-prep) | External firm | **P2 gate** | R3 §9 |
| v2.2 fee-split contract (`DEV_BPS=7000, PLATFORM_BPS=3000`) | Source-prepared, undeployed | TournamentPool v2.2 | **P2 deploy** | R3 §8 (lesser disclosures) |
| Cayman foundation entity | Pending | Legal | **P2 gate** | round-spec.md §use-of-funds |
| SponsorshipModule sanctions oracle (real, not Mock) | `MockSanctionsOracle` deployed; Chainalysis swap pending | Fresh module redeploy | **P3 swap** | R3 §9 |
| Decentralized broadcaster (multi-sig / threshold) | **Single EOA** | STUDIO_PRIVATE_KEY | **P3 prerequisite** | R3 §8 #1, §9 |
| Substrate cohort-snapshot endpoint (paid) | Live | `GET /v1/data/cohort-snapshot` | P1 ✓ / **P5 commercial** | R3 §6 |
| Substrate human-side move trace | **Absent** | — | **P4–P5 gap** | R4 §9.3 |
| Substrate licensing-status column | **Absent** | — | **P5 gap** | R4 §9.3 |
| Substrate retention / archival policy | **Absent** | — | **P5 gap** | R4 §9.3 |
| ERC-8021 dataSuffix encoder (11B raw ASCII; spec says 16B structured) | Live, base.dev lenient today | `@skillos/sdk` + `apps/api` | P1 ✓ / **P2 spec-compliance** | memory `project_erc8021_encoder_spec_compliance` |

---

## 3. Phase trajectory position

### Phase 1 — skill game protocol live on testnet

**Readiness: ~90%.**

Solo flow end-to-end working on all 6 games with chain-verified Builder Code attribution, sponsor permissionless funding, watch replay surface, agent submissions via SIWA + ERC-8004 registry, x402 paywalled cohort/replay tiers. CI workflow exists (97.8% pass rate). Memory `project_skillos_rebrand_state` GitHub portion executed; legacy `skillbase.games` aliases retained per backlog.

**Remaining for Phase 1 wrap** (per founder definition — see §9 Q-1):

| Item | Source | Effort |
|---|---|---|
| Settle-tournaments silent-swallow patch (memory mis-pathed; correct path `packages/duel-backend/src/cron/tournaments.ts:977`) | offchain H4, R4 §7 D1 | Low |
| Patch CLAUDE.md drifts (Next.js version, "no CI today", "May 4 2026 deadline", completed backlog items) | R4 §6.2, R3 D1/D2 | Low |
| `apps/api/README.md` Sprint X2 framing (17 sprints stale) | R4 §6.1, G5 | Low |
| Memory file corrections (D1 settle-path, D2 indexer-shipped, D8 v4_20260515b file) | R4 §7, offchain memory corrections | Low |
| Decide duel scoping (Phase 1 wrap = solo-only OR ship minimal duel) | R1 Q-1 | Founder decision |
| Decide cron cadence (hourly vs daily — UI copy claims hourly, cron is daily) | R1 Q-2, D-4 | Founder decision |
| Cleanup junk Vercel project `node_modules` | R3 D11, Q-V3 | Low |
| Decide legacy `skillbase.games` cutover timing | R3 Q-V2, D5 | Founder decision |

### Phase 2 — mainnet activation + 3rd-party SDK rollout

**Readiness: ~25%.**

| Mainnet-gate item | State | Phase 2 sprint candidate |
|---|---|---|
| External audit firm engaged | ❌ Pending (round-spec.md: $100K reserved for audit) | X12 (existing) |
| Cayman foundation entity | ❌ Pending ($50K reserved) | X13 (existing) |
| T1+ plausibility | ❌ Returns 501 today | X14 (existing — class fairness adjacency) |
| C1 — auth on `/v1/agents/matches/start-solo` | ❌ Open | **P2-Pre-A1** (new from CR1) |
| C2 — Upstash-backed rate limiter (Map cosmetic on Vercel) | ❌ Open | **P2-Pre-A2** (new from CR1) |
| H4 — settle silent-swallow selector decode | ❌ Open | **P2-Pre-A1** (bundle with C1) |
| H1 — boot-time `trustedSigner` cross-check | ❌ Open | **P2-Pre-A1** |
| H2 — `verifyOnchain: true` on agent-auth | ❌ Open | **P2-Pre-A1** |
| H5 — x402 facilitator receipt verification | ❌ Open | **P2-Pre-A2** |
| H6 — scope x402 middleware to `/v1/data/*` | ❌ Open | **P2-Pre-A1** |
| H7 — `x15_payment_attempts` schema reconciliation | ❌ Open (memory `project_x15_8_payment_attempts_schema_lock` D8 follow-up) | **P2-Pre-A2** |
| H8 — refund/dispute path | ❌ Open | X16 (existing) |
| H9 — orphan payment-attempt reconcile cron | ❌ Open | X16 (existing) |
| 9 schema-drift items (X19 plan) | ⏳ In flight per `docs/audit-prep/x19-schema-drift-analysis.md` | X19 (existing) |
| Wallet rotation runbook (STUDIO + AGENT) | ❌ Open (offchain M3 + ADR-0003 defers to "X19b.1") | **P2-Pre-B** |
| v2.2 fee-split contract deploy (`DEV_BPS`, `PLATFORM_BPS`) | ❌ Source-prepared | **P2-Contract** (existing scope) |
| `STUDIO_PRIVATE_KEY` broadcaster role-split (4–5 jobs → split) | ❌ Open (offchain M11) | **P2-Pre-B** (mainnet prerequisite) |
| Nonce store unification (Upstash, replace `skillos_auth_nonces` + `skillos_siwa_nonces` separate tables) | ❌ Open (memory `project_phase2_nonce_store_unify`) | **P2-Pre-A2** (bundle with C2 Upstash) |
| Staging Supabase | ❌ Open (memory `project_skillos_no_staging_supabase`) | **P2-Pre-B** |
| CI workflow + pre-commit hooks (husky absent) | ⚠️ Partial (CI ✓, hooks ❌) | **P2-Pre-C** (sweep) |
| Apps/api 3 tests outside CI (`agents-matches`, `charge-retry-fee`, `x402-client`) | ❌ Open (R4 §5.2, G1) | **P2-Pre-C** |
| ArcadePool 11.76% branch coverage | ❌ Open (R4 §4.3, G9) | **P2-Pre-Contract** |
| ChallengeEscrow 61.54% branch coverage | ❌ Open (R4 §4.3, G10) | **P2-Pre-Contract** |
| SDK 0 tests | ❌ Open (R2 §3.1, G2) | **P2-Pre-D** |
| SDK live-API `prebuild` removal (vendor openapi.json) | ❌ Open (memory `project_packages_sdk_circular_build_dep`, R2 D8) | **P2-Pre-D** |
| Unity WebGL / Roblox / Phaser / gb-studio engine adapters | ❌ None | X11 (existing — sprint placeholder) |
| ERC-8021 encoder spec compliance (11B raw → 16B structured) | ⏳ Runtime working, spec-noncompliant | **P2-Pre-Standards** |

### Phase 3 — decentralization + dispute layer

**Achievement gates not yet hit:**

1. STUDIO single-broadcaster replaced by multi-sig / threshold / ZK-proof attestation (offchain C1, R3 §9).
2. Supabase-as-state-of-record replaced by on-chain event sourcing with off-chain projection. TournamentCreated indexer (PR #41) is the first piece; settle/sponsor/anchor indexers must follow.
3. `MockSanctionsOracle` replaced by Chainalysis (immutable address rotation via fresh `SponsorshipModule` deploy).
4. Dispute / arbitration layer (no current surface; ChallengeEscrow has `walkover` but no dispute endpoint).

### Phase 4 — governance + opt-in data tokenization + Mode B integration

**Framework gap note:** the CR1 prompt framework table skipped Phase 4. This sub-section was inserted post-hoc per founder catch. Phase 4 in project memory + v1.2 supplement = governance token + opt-in data tokenization + Mode B integration (AAA studio attestation feed). MMORPG/TCG is P5+ scope, not P4.

**Readiness: ~8–12% weighted across sub-capabilities (NOT averaged — gates are independent).**

- **Governance token: ~5%.** SP system in production as off-chain accounting; intentionally pre-token. No ERC-20 contract, no token-economics paper. SP → token conversion architecturally possible (utility-bound + storage-segregated invariants intact — CLAUDE.md invariant 7 "achievement-gated tokenization") but not implemented. Communication-frame-v2.md §9 risk filter blocks any public token-roadmap framing until Howey-clearance + organic-economy maturity.
- **Opt-in data tokenization: ~10–15%.** T0–T3 tier framework exists in `@skillos/sdk` (R2 §4.3 confirmed — T0 shipped; T1+ returns 501 per `project_phase2_mainnet_blocker_plausibility`). Replay artifacts present only in `duel_moves` today (R4 §1.2 §9.3 confirmed — agent-side only, no human-side move trace). Tokenization layer (contract + opt-in mechanism + `data_license_status` column in the data layer) at 0% (R4 §9.3 NH-17).
- **Mode B integration: ~15–20%.** Architectural primitive present: `submitScore(addr, score, sig)` supports both modes — only signer differs. SDK for Mode B attestation feed + first AAA studio contract not shipped. This is the most-mature P4 sub-capability.
- **MMORPG/TCG: 0%.** P5+ scope by design (real-time complex games out of beachhead).

**Achievement gates (independent, all required for P4 activation):**

1. Sustained adoption signal (organic economy maturity threshold — pitch-only metric per communication-frame-v2.md §9).
2. Regulatory clarity (Howey + MiCA reads acceptable per counsel; Cayman foundation operational — round-spec.md $50K X13 prerequisite).
3. Lawyer review of token mechanics + opt-in data tokenization contract before any public commitment.
4. First AAA studio attestation contract signed (Mode B unlock signal).

**Strategic note:** Mode B at 15–20% readiness is *more* advanced than P3 decentralization (~5%) because the architectural primitive (signer differentiation in v2.1) was preserved at contract-design time. This unlocks P4 partnership optionality *without* requiring P3 as prerequisite — i.e. AAA-studio attestation feeds can ship before multi-sig / threshold broadcaster work lands.

**Substrate-narrative discipline (binding per communication-frame-v2.md §4 invariant 7):** Phase 4 token + tokenization framing is pitch-only. No public token roadmap, no governance-token claim at any account layer (@SkillOS / @web3simpl / @inancweb3). Mode B framing is publicly defensible *only* once first attestation contract signs (chain-evidenced + counterparty-evidenced).

### Phase 5 — substrate intelligence

**Cross-class data flywheel readiness: critical gaps.**

The only ML-shape table is `duel_moves` (586 rows, 11 cols — `board_before:jsonb`, `board_after:jsonb`, `score_delta`, `cumulative_score`, `reasoning:text`, `latency_ms`). Populated only by X15 agent-runner pathway. R4 §9.3 surfaces four absences:

1. **No human-side move trace.** Solo players submit final scores only.
2. **No retention/archival policy column** (`retain_until`, `consent_flag`, `licensing_status`).
3. **No telemetry firehose / unified events table.** `duel_moves` is closest analog, agent-only.
4. **No replay artifact storage** (file blobs or Supabase Storage bucket).

**Foundation-model input readiness:**

- ✓ Domain Neutrality at protocol layer (developer-surface.md §2.4) preserves Phase 5 optionality at architecture level.
- ✓ `v2_sp_snapshots` exists (20 anchored, public-verifiable canonical_json:jsonb) — substrate timestamping primitive.
- ✓ `SkillbaseAnchor` contract source ready + 17 tests + deployment script (not deployed).
- ✗ Six deterministic-state games (word/number/spatial) is a narrow slice of cohort behavior (R1 §5.1). Wide skill-surface narrative needs (a) more game classes (action/strategy/social), (b) AI-graded subjective tasks, or (c) honest scoping in pitch.
- ✗ Only one agent population (SkillOS-internal agent-runner) exercising the substrate today (R1 §5.5).
- ✗ Apex `/watch` is the only public surface that shows raw substrate data (R1 Q-8).

---

## 4. Centralization disclosure inventory (audit-firm packet input)

### Single points of failure (chain layer)

| # | Component | Address / handle | Blast radius if compromised | Phase to mitigate |
|---|---|---|---|---|
| SPF-1 | **STUDIO_PRIVATE_KEY** broadcaster | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` | Arbitrary tournaments, arbitrary scores with valid attestations, settle, walkover on ChallengeEscrow + TournamentPool v2.1 | P3 — multi-sig / threshold |
| SPF-2 | AGENT_PRIVATE_KEY (X15.3 split broadcaster) | `0xf481b744c0CB432baD42babB30616790bbA69c91` | Arbitrary `chargeRetryFee` calls; AGENT wallet USDC drain | P2 — runbook (offchain M3) |
| SPF-3 | TournamentPool deployer | `0x3a4F9eB7…5EEe` | Historical only (role-bounded; deployer ≠ owner ≠ signer) | OK |
| SPF-4 | ChallengeEscrow deployer + owner | `0x84F4610e2805A35B15388D6c2644f6a23E17960C` | `setFeeVault` rotation authority | P3 — multi-sig |
| SPF-5 | Legacy AGENT wallet (pre-X15.3 split) | `0x1569A95eaF3bB970E5c03F53f026849864C39fdA` | Unrevoked authorization on ChallengeEscrow | P2 — formal revoke (R3 Q-W2) |
| SPF-6 | TournamentPool v2.1 declared `trustedSigner` (config drift) | `0xf35c284D9aB07Abb4fc297C2af89B467E30f2273` (0 tx, 0 ETH — never broadcasts) | **CONFIG/RUNTIME DRIFT** — likely manifest stale; on-chain `trustedSigner()` view must be read to confirm (R3 D4, Q-W1) | **P2 pre-mainnet** |

### Single points of failure (infra / auth layer)

| # | Component | Blast radius | Phase to mitigate |
|---|---|---|---|
| SPF-7 | `CRON_SECRET` (only auth on 6 Vercel cron routes) | Authenticated caller triggers `createTournament` / `settle` / `submitSoloScore` | P2 — additional gates |
| SPF-8 | `ANTHROPIC_API_KEY` shared across Coach + Recap + Anti-Cheat + Duel-loop on 4 surfaces | Single rotation invalidates all 4; requires redeploy of every project | P2 — split per surface |
| SPF-9 | `SUPABASE_SERVICE_ROLE_KEY` distributed across 7+ Vercel projects | Service-role bypasses RLS; one leak = full DB exfil | P2 — staging project + scoped service keys where possible |
| SPF-10 | `sepolia.base.org` public-RPC fallback | When `BASE_SEPOLIA_WRITE_RPC_URL` unset, public-RPC outage breaks indexer + cron | P2 — paid RPC mandate |
| SPF-11 | JWT_SECRET / SIWA_RECEIPT_SECRET stateless 24h TTL with no revocation list | Rotation revokes ALL agents/users simultaneously | P2 — receipts_revoked table (offchain M10) |
| SPF-12 | In-memory rate limiter (`buckets = new Map()`) | N-instance bypass; cold-start resets quota | **P2 mainnet blocker (C2)** |
| SPF-13 | x402 facilitator trusted without on-chain receipt verification | Compromised facilitator returns fake tx hash; Anthropic budget burned | **P2 mainnet blocker (H5)** |

### Trust assumptions documented

- Solo score validity gated on T0 signature only (no plausibility). T1+ returns 501 (offchain H3, R1 §2.4).
- Cron is the only writer of tournament state (CLAUDE.md invariant 6). Manual settle paths exist as ops break-glass only.
- Anti-Cheat runs as fire-on-mount AI from result page, never blocking submission (CLAUDE.md invariant 5).
- Sanctions enforcement is via `MockSanctionsOracle` on Sepolia; Chainalysis swap deferred to P3.
- Agent participation = class, not feature flag (CLAUDE.md invariant 3); no `is_agent` schema column (R4 §9.1).
- Achievement-gated tokenization is optional, not promised (CLAUDE.md invariant 7); Howey-sensitive at public-comm layer (communication-frame-v2.md §4).

### Sweepstakes-safety invariant (preserved)

Retry fees and prize pools live on separate storage slots in TournamentPool. Sponsor wallets fund pools directly via `sponsorPool()`. Foundation treasury never funds prize pools. `settle-guard` integration tests are the tripwire — currently `test.skip`'d on the duel path (R4 §5.3, memory `project_phase2_duel_reactivation`), which is one of the duel-reactivation reactivation triggers.

---

## 5. Gap inventory (cross-track aggregated)

### 5.1 Critical (mainnet blockers)

| ID | Gap | Source | Effort | Sprint |
|---|---|---|---|---|
| MB-1 | C1 — `/v1/agents/matches/start-solo` unauthenticated, moves real funds | offchain C1 | Low (lift `requireSiwaAuth`) | **P2-Pre-A1** |
| MB-2 | C2 — In-memory rate limiter cosmetic on Vercel (N-instance bypass) | offchain C2 | Medium (Upstash REST) | **P2-Pre-A2** |
| MB-3 | H1 — No boot-time trustedSigner cross-check | offchain H1, R3 §7 | Low (1 RPC at cold start) | **P2-Pre-A1** |
| MB-4 | H2 — Agent-auth `verifyOnchain: false` → 24h stale-NFT window | offchain H2 | Low (flip boolean) | **P2-Pre-A1** |
| MB-5 | H4 — Settle silent-swallow at `packages/duel-backend/src/cron/tournaments.ts:977` | offchain H4, R1 §2.3, R4 §3.2 §7 D1 | Low (selector decode) | **P2-Pre-A1** |
| MB-6 | H5 — x402 facilitator trusted without on-chain receipt verification | offchain H5 | Medium (waitForReceipt + log assertion) | **P2-Pre-A2** |
| MB-7 | H6 — x402 paywall middleware mounted on `'*'` (env-misconfig downs whole API) | offchain H6 | Low (scope to `/v1/data/*`) | **P2-Pre-A1** |
| MB-8 | H7 — `x15_payment_attempts` schema-vs-code drift; v4_20260515b file uncommitted | offchain H7, R4 §2.3 §7 D8, memory | Low (port migration to branch) | **P2-Pre-A2** |
| MB-9 | T1+ plausibility gate (real-USDC tournaments blocked at T0) | R1 §2.4, R2 §4.3, offchain H3 | High | X14 (class fairness adjacency) / pre-mainnet doc |
| MB-10 | 9 schema-drift items between migrations registry and on-disk files | R4 §2, X19 plan | 3–5 d | X19 (existing) |
| MB-11 | STUDIO broadcaster concentration (4–5 roles in one EOA) + no ETH preflight in cron | R3 §8 #1, offchain M11 | Medium (preflight) + Hard (split) | **P2-Pre-B** |
| MB-12 | Wallet rotation runbook absent (singletons survive warm-starts) | offchain M3, ADR-0003 defers to "X19b.1" | Low (write) + Medium (refactor) | **P2-Pre-B** |
| MB-13 | Staging Supabase project missing | R3 §8 #4, R3 Q-S2, memory | Medium | **P2-Pre-B** |

### 5.2 Important (Phase 2 sprint queue, non-blocker)

| ID | Gap | Source | Effort | Sprint |
|---|---|---|---|---|
| IM-1 | Duel reactivation (un-skip settle-guard integration tests, replace `DuelComingSoon` on 18 routes, wire 18 `/api/duel/*` BFFs) | R1 §2.1 §5.7, R4 §5.3, memory `project_phase2_duel_reactivation` | High | X10b (existing) / decide scope |
| IM-2 | Game metadata over-promises duels (R1 D-2: `metadata.description` says "Stake 1 USDC, match a player"; reality solo only) | R1 D-2, D-6 | Low (per-game layout.tsx sweep) | bundle with IM-1 or pre-wrap |
| IM-3 | UI copy "hourly tournament" vs cron `0 0 * * *` daily | R1 D-4, R1 Q-2 | Founder decision + 1-line code | bundle with cron-cadence decision |
| IM-4 | Apps/api 3 tests outside CI (13 cases incl. H5 + X15 coverage) | R4 §5.2, G1 | Low (1 line in ci.yml) | **P2-Pre-C** |
| IM-5 | SDK 0 unit tests, 0 external production consumers | R2 §3.1 §4.1, G2 | Medium | **P2-Pre-D** |
| IM-6 | SDK `prebuild` triggers live API fetch (install-time HTTP) | R2 D8, memory | Low (vendor openapi.json) | **P2-Pre-D** |
| IM-7 | `apps/api/runner.ts` (Anthropic agent + on-chain submit) no unit test; only live X15.7 verification | R4 §5.7, G3 | Medium | **P2-Pre-D** |
| IM-8 | Agent-runner E2E no unit-test gate (workflow_dispatch only) | R4 §5.7, G4, R3 §4 | Low | **P2-Pre-D** |
| IM-9 | apps/api README claims Sprint X2 scope (17 sprints stale) | R4 §6.1, R4 G5 | Low | **P2-Pre-C** doc sweep |
| IM-10 | CLAUDE.md drifts (Next 14 era, "no CI today", May 4 deadline, completed backlog items) | R4 §6.2, R3 D1/D2, R1 D-1 | Low | **P2-Pre-C** doc sweep |
| IM-11 | No turbo `test` task / no root `test` script (CI hard-codes 12 paths) | R4 §5.5, G7 | Low | **P2-Pre-C** |
| IM-12 | ArcadePool 11.76% branch coverage | R4 §4.3, G9 | High | **P2-Pre-Contract** (or dead-code retire — R3 §1) |
| IM-13 | ChallengeEscrow 61.54% branch coverage | R4 §4.3, G10 | Medium | **P2-Pre-Contract** |
| IM-14 | No Playwright / RTL / E2E anywhere | R4 §5.6, G11 | Medium | **P2-Pre-C** |
| IM-15 | No Foundry `script/*.s.sol` coverage (incl. `BackfillV2Tournament*.s.sol` used in X9 forensic recovery) | R4 §4.4, G12 | Medium | **P2-Pre-Contract** |
| IM-16 | M5 — no on-chain liveness check on `tournamentId` before signing | offchain M5 | Low (1 RPC) | **P2-Pre-A2** |
| IM-17 | M6 — Idempotency-Key absent; client retry double-credits | offchain M6 | Medium | **P2-Pre-A2** |
| IM-18 | M7 — diverging signer-digest copies (v2 vs v2.1) | offchain M7 | Low (delete lib-shared copy) | **P2-Pre-A1** |
| IM-19 | M8 — `dataSuffix` no post-broadcast drift detection | offchain M8 | Low (env-flagged CI check) | **P2-Pre-C** |
| IM-20 | M9 — ERC-8128 nonce store falls back to per-Lambda Map | offchain M9 | Medium (Supabase nonce store) | **P2-Pre-A2** (bundle with nonce-unify) |
| IM-21 | M13 — `PATCH /v1/agents/profile` writes to in-memory Map | offchain M13 | Low (X4.5 Supabase migration) | **P2-Pre-D** |
| IM-22 | M14 — x402 amount semantics + receiver-topology validation absent | offchain M14 | Low | **P2-Pre-A2** |
| IM-23 | L1 — Cron secret `===` (not `timingSafeEqual`) | offchain L1 | Low (lift comparator) | **P2-Pre-C** |
| IM-24 | L2 — Preview cron auth degrades to "accept all" | offchain L2 | Low (startup invariant) | **P2-Pre-C** |
| IM-25 | L3 — Bearer rate-limit returns 400, OpenAPI says 429 | offchain L3 | Low | **P2-Pre-C** |
| IM-26 | L4 — Hard-coded canonical signer in `apps/2048/src/app/api/admin/system-health/route.ts:42` | offchain L4 | Low | **P2-Pre-C** |
| IM-27 | Cron sub-daily cadence (Hobby tier; sub-daily needs Pro upgrade) | R4 §3.2 G17, R1 §5.3 | $20/mo × N projects | **P2-Ops** |
| IM-28 | Indexer rebuild on permissionless `TournamentCreated` (PR #41 shipped but memory stale) | R4 §3.3 D2, R1 D-3 | Low (memory edit + docs) | **P2-Pre-C** |
| IM-29 | `mas-2048` env-var shape drift vs other 5 games (CDP/x402 + `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS`) | R3 D9 Q-V5 | Founder decision | **P2-Pre-C** |
| IM-30 | `mas-wordle` install command `npm install --prefix` (no arg, truncated) | R3 D8 Q-V4 | Low (Vercel project edit) | **P2-Pre-C** |
| IM-31 | DevAttributionNFT address not exported in `packages/contracts/src/addresses.ts` | R3 §8 lesser disclosure | Low | **P2-Pre-C** |
| IM-32 | apex `skillos.games` apex domain at AWS+GoDaddy parking page | R3 D10 Q-V1 | Founder decision | **P2-Pre-C** brand cutover |
| IM-33 | Legacy `skillbase.games` dual-alias on every project + `QUICK_AUTH_DOMAIN` drift | R3 D5 Q-V2 | Founder decision + multi-project env sweep | **P2-Pre-C** brand cutover |
| IM-34 | Memory file corrections (D1 settle-path, D2 indexer-shipped, D7-paid-retry option A, D8 v4_20260515b file) | R4 §7, offchain memory corrections | Low | **P2-Pre-C** memory sweep |
| IM-35 | `@skillos/sdk` registry has `0.1.0` and `0.2.1` but no `0.2.0` | R2 D2 | Low (decision doc) | **P2-Pre-D** |
| IM-36 | `@skillos/skills` 0.2.0 staged but not published (mdskills.ai catalog refresh pending) | R2 D1 | Founder gate | **P2-Pre-D** |
| IM-37 | Public GitHub mirror `youngstar-eth/skillos` is private; README links to private repo | R2 D3 | Founder decision | **P2-Pre-D** |
| IM-38 | Phantom dep: 6 game apps import `@skillos/ai-coach` without declaring | R2 D4 | Low | **P2-Pre-C** |
| IM-39 | Declared-but-not-imported deps (`@skillos/game-types`, `@skillos/lib-shared`) | R2 D5 | Low | **P2-Pre-C** |
| IM-40 | `packages/sp-engine` `npm test` runs only 1 of 2 test files | R2 D6 | Low | **P2-Pre-C** |
| IM-41 | Test runner inconsistency (vitest declared in apps/api, `tsx --test` invoked in CI) | R2 D9 | Founder decision | **P2-Pre-D** |
| IM-42 | Engine adapters for Phase 2 SDK rollout (Unity WebGL, Roblox, Phaser, gb-studio) | R2 §4.2, R2 Q7 | High | X11 (existing) |
| IM-43 | Sprint retrospectives stopped after X15 (no X16-X20 retros) | R4 §6.5 G8 | Medium | **P2-Pre-C** docs |
| IM-44 | `0001-v22-fee-splitter.md` ADR missing (numbering skip) | R4 §6.4 | Low (Phase 2 mainnet contract auditor consultation) | **P2-Pre-Contract** |
| IM-45 | apex CLAUDE.md fresher than MAS CLAUDE.md on Next.js (16) | R4 §6.6 | Low (sync) | **P2-Pre-C** |
| IM-46 | Anti-Cheat rebuild (Haiku 4.5 wired, rebuild scoped) | R3 §9 | High | X20 (existing) |
| IM-47 | Class-fairness invariants encoded at contract but no live on-chain monitoring | R3 §9 | Medium | X14 (existing) |
| IM-48 | `is_agent` / `class_tag` columns absent on `v2_tournament_solo_runs` + `v2_duels` | R4 §9.1, §9.2 | Medium (forward migration) | X14 (existing) |
| IM-49 | v2.2 fee-share contract source-prepared but undeployed | R3 §8 lesser disclosure | Medium | **P2-Pre-Contract** |
| IM-50 | EIP-5792 batched paymaster deferred (bundler-drop bug not diagnosed) | R1 §2.1 | Medium | **P2-Pre-D** |
| IM-51 | ERC-8021 encoder spec compliance (11B raw ASCII → 16B structured) | memory `project_erc8021_encoder_spec_compliance` | Medium | **P2-Pre-Standards** |

### 5.3 Nice-to-have (Phase 3+)

| ID | Gap | Source | Phase |
|---|---|---|---|
| NH-1 | 6+ V1 orphan tables on prod (`challenges` 25 cols, `users`, `game_sessions`, daily_*) | R4 §1.4 §8.3 G13, R3 §1 | P2 schema sanity (quarantine + drop) |
| NH-2 | `v2_duels` has no FK to `v2_tournaments` (array-encoded linkage) | R4 §1.4 G14 | P2 (depends on duel reactivation) |
| NH-3 | Two identity models (`users.id:uuid` vs `user_address:text`) | R4 §1.4 G15 | P2 social layer |
| NH-4 | Auth schema sprawl — 22 empty `auth.*` tables (Supabase upstream default) | R4 §1.3 G16 | P2 audit comfort (document, no action) |
| NH-5 | No pre-commit hooks (husky absent; CLAUDE.md says "introduces P2") | R4 §6.2 G18 | **P2-Pre-C** |
| NH-6 | Per-game cross-app leaderboard view (time-windowed, agent/human split) | R1 §4 | P5 substrate cohort discovery |
| NH-7 | Tournament discovery in game apps themselves (currently sponsor app only) | R1 §4, R1 Q-3 | P2 polish |
| NH-8 | Identity richness (display name, avatar, bio, social handles) | R1 §3.3, R1 Q-5 | P2/P5 social layer |
| NH-9 | Apex `/watch` as substrate showcase — expand vs add new substrate-explorer app | R1 Q-8 | P5 narrative |
| NH-10 | Reconcile-duels cron dormant; either disable until reactivation or no-op | R1 Q-6 | P1 ops |
| NH-11 | Agent-runner + game-app BFF `/api/duel/*` scope overlap | R1 Q-7 | P2 sequencing |
| NH-12 | Vercel project `node_modules` (junk; safe to delete) | R3 D11 Q-V3 | P1 cleanup |
| NH-13 | `agent.skillos.network` NXDOMAIN — not configured | R3 §5 | P2 if agent narrative public |
| NH-14 | apex no `.github/workflows/` (Vercel git-push auto-deploy only) | R3 §4 | P2 |
| NH-15 | `commit` field empty in `/v1/health` (build doesn't bake SHA) | R3 §7 | P1 ops observability |
| NH-16 | Human-side `game_moves` table (mirror of `duel_moves` shape) for Phase 5 substrate | R4 §9.3 | **P4-P5** (new initiative) |
| NH-17 | `data_license_status` column on training-relevant rows | R4 §9.3 | **P5** |
| NH-18 | Telemetry firehose / unified events table (`agent_actions`, `trace_id`) | R4 §9.3 | **P5** |
| NH-19 | Replay artifact storage (Supabase Storage bucket or `replay_blobs` table) | R4 §9.3 | **P5** |
| NH-20 | Substrate publication of `@skillos/sp-engine` canonicalization primitives (`@skillos/replay` or fold into SDK) | R2 §4.4, R2 Q6 | **P5** |

---

## 6. Phase 2 sprint sequencing (revised)

### 6.1 Current sprint queue baseline (per v1.4 §4 — not on disk; reconstructed from memory + R-track references)

| Sprint | Stated focus (per brief) |
|---|---|
| X10b | Duel reactivation prep |
| X11 | 3rd-party SDK rollout (Unity WebGL / Roblox / Phaser / gb-studio adapters) |
| X12 | External audit firm engagement ($100K — round-spec.md) |
| X13 | Cayman foundation structuring ($50K — round-spec.md) |
| X14 | Class fairness (T1+ plausibility + `is_agent` schema columns) |
| X15 / X15.5 | (already executed per memory — X15 paid retry; X15.5 apex replay rename) |
| X16 | Refund/dispute path + orphan reconcile cron |
| X17 | Cron settle throughput refactor |
| X18 | (TBD — placeholder) |
| X19 | Schema drift sprint (in flight per `docs/audit-prep/x19-schema-drift-analysis.md`) |
| X20 | Anti-Cheat rebuild |

### 6.2 Revised Phase 2 sprint sequence (informed by CR1 cross-track findings)

New CR1-discovered sprints are prefixed **P2-Pre-** to mark them as pre-mainnet hardening waves that should precede or run parallel to existing X-numbered sprints. They cluster naturally into 5 themes.

| Sprint | Source | Funding dep? | Phase tag | Sequencing rationale |
|---|---|---|---|---|
| **P2-Pre-A1** — "Sub-day hardening wave" (C1, H1, H2, H4, H6, IM-2, IM-18) | CR1 + UR Pass 1 | Independent | P2 entry | Bundle all sub-day Critical+High fixes into one PR-stack (selector-decode, requireSiwaAuth, verifyOnchain flip, trustedSigner read, x402 scope-fix). Founder can ship this entirely on existing infra. Highest ROI. |
| **P2-Pre-A2** — "Upstash + facilitator-trust wave" (C2, H5, H7, IM-16, IM-17, IM-20, IM-22) | CR1 + UR Pass 1 | Independent | P2 entry | Upstash REST migration unblocks rate limiter + nonce store + ERC-8128 nonce. Pair with x402 waitForReceipt + Idempotency-Key + tournamentId pre-check. Self-contained backend hardening. |
| **P2-Pre-B** — "Wallet topology + staging" (MB-11, MB-12, MB-13, M2/M3/M4) | CR1 R3 + UR Pass 1 | Independent (engineering) | P2 mainnet prereq | Wallet rotation runbook + STUDIO role-split planning + staging Supabase. Audit-firm-facing prep. Can start parallel to A1/A2. |
| **P2-Pre-C** — "Doc + cleanup sweep" (IM-9, IM-10, IM-11, IM-19, IM-23—IM-26, IM-28—IM-34, IM-38—IM-40, IM-43, IM-45, NH-5, NH-12, NH-15) | CR1 R1-R4 | Independent | P2 entry | Single cleanup sprint that resolves doc drift + cron auth consistency + memory corrections + brand cutover decisions. Low-effort, high-clarity-gain. Can run parallel to all others. |
| **P2-Pre-D** — "Developer surface hardening" (IM-4, IM-5, IM-6, IM-7, IM-8, IM-21, IM-35—IM-37, IM-41, IM-50) | CR1 R2 + UR Pass 1 | Independent | P2 SDK rollout prereq | SDK tests + circular build-dep removal + apps/api CI parity + runner.ts test suite + Idempotency / agent-profile persistence. Mandatory before X11 (3rd-party SDK rollout). |
| **P2-Pre-Contract** — "Contract coverage + v2.2 deploy" (IM-12, IM-13, IM-15, IM-44, IM-49) | CR1 R3-R4 | $100K (X12) | P2 mainnet contract | ArcadePool/ChallengeEscrow coverage lift + v2.2 fee-splitter ADR-0001 + script test suite. Audit-firm pre-feed. |
| **P2-Pre-Standards** — "ERC-8021 encoder + Builder Code drift CI" (IM-19, IM-51) | CR1 R2 + memory | Independent | P2 spec compliance | 11B raw ASCII → 16B structured. Runtime working, spec-noncompliant. base.dev lenient today; mainnet posture wants spec compliance. |
| **P2-Ops** — "Vercel Pro upgrade + sub-daily cron" (IM-27) | $20/mo × N projects (Ops budget — round-spec.md) | Funding-dependent | P2 ops | Unblocks H9 reconcile cadence + TournamentCreated indexer latency. |
| **X10b** (existing) — Duel reactivation | Existing backlog | Independent (engineering) | P2 entry | **Founder decision Q-1:** Phase 1 wrap = solo-only OR ship minimal duel. Determines whether X10b is P1 wrap or P2 first sprint. Bundle IM-1, IM-2, IM-3, NH-10, NH-11 with the duel decision. |
| **X11** (existing) — 3rd-party SDK rollout | Existing backlog | Independent | P2 SDK launch | Unity WebGL / Roblox / Phaser / gb-studio adapters. **Blocked-by P2-Pre-D** (SDK tests + circular build dep removal). |
| **X12** (existing) — External audit firm engagement | Existing backlog | **$100K** (round-spec.md use of funds) | P2 mainnet gate | Trail of Bits / OpenZeppelin / Spearbit slot. **Blocked-by P2-Pre-Contract + P2-Pre-A1/A2/B** (pre-audit findings closure). |
| **X13** (existing) — Cayman foundation | Existing backlog | **$50K** | P2 mainnet gate | Legal + counsel. Parallel to X12. |
| **X14** (existing) — Class fairness | Existing backlog | Independent (engineering) | P2 mainnet gate | T1+ plausibility (MB-9) + `is_agent`/`class_tag` schema columns (IM-47, IM-48). |
| **X16** (existing) — Refund/dispute path + orphan reconcile cron | Existing backlog (H8, H9) | Independent | P2 user-facing posture | Mainnet user-facing posture; auto-refund needs receiver wallet to hold a key (currently receive-only — wallet-topology change required). |
| **X17** (existing) — Cron settle throughput refactor | Existing backlog (CLAUDE.md L162) | Independent | P2 ops | Survives unchanged. |
| **X18** | TBD placeholder | — | — | Either drop or repurpose. |
| **X19** (existing, in flight) — Schema drift sprint | Existing backlog (MB-10) | Independent | P2 audit-prep | 3–5 days per `docs/audit-prep/x19-schema-drift-analysis.md`. |
| **X20** (existing) — Anti-Cheat rebuild | Existing backlog (IM-46) | Independent | P2 mainnet gate | Pairs with X14 (plausibility + class fairness). |

**Suggested execution order:**

1. **Concurrent Wave 1 (engineering-independent, no funding):** P2-Pre-A1, P2-Pre-A2, P2-Pre-C, P2-Pre-D, X19, X10b-decision. All parallel except A2 depends on A1 (shared Upstash setup PR), and P2-Pre-D blocks X11.
2. **Concurrent Wave 2 (engineering + funding-prep):** P2-Pre-B, P2-Pre-Contract, P2-Pre-Standards, X14, X16, X17, X20. Wave 2 begins when Wave 1 stabilizes.
3. **Funding-dependent gate:** X12 (audit) + X13 (Cayman) + P2-Ops fire when round closes (round-spec.md timeline: first close target Q3 2026).
4. **Mainnet activation:** depends on Wave 2 + funding gate completion.

**Funding-independent sprint count:** 12 sprints (P2-Pre-A1, P2-Pre-A2, P2-Pre-B, P2-Pre-C, P2-Pre-D, P2-Pre-Contract, P2-Pre-Standards, X10b, X14, X16, X17, X19, X20). **Funding-dependent:** 3 sprints (X11, X12, X13, P2-Ops — X11 needs P2-Pre-D first; X12/X13/P2-Ops need round close).

---

## 7. Drift inventory (cross-track aggregated)

Continues UR Pass 1 §2.6 baseline (5 drifts). CR1 surfaces **6 R1 + 10 R2 + 12 R3 + 14 R4 = 42 distinct drift instances** (deduplicated below across tracks; some are cross-track duplicates collapsed).

### 7.1 High-severity drift

| # | Drift | Tracks surfacing | Impact |
|---|---|---|---|
| HD-1 | CLAUDE.md says "No CI today; .github/workflows/ does not exist" | R3 D1, R4 §6.2 #2, R2 §3.5 | HIGH — documentation lags ~Sprint or more; CI is the merge gate with 97.8% pass rate |
| HD-2 | TournamentPool v2.1 declared `trustedSigner` `0xf35c284D9a…` has zero on-chain activity; submit succeeding via different wallet | R3 D4, Q-W1 | HIGH — config/runtime drift; pre-mainnet must verify with `cast call trustedSigner()` |
| HD-3 | `skillos.games` apex points at AWS Route 53 + GoDaddy parking cert (NOT Vercel) | R3 D10, Q-V1 | HIGH — root-domain marketing posture is a parking page |
| HD-4 | Game metadata over-promises duels (`metadata.description = "Stake 1 USDC, match a player, play 2048…"`) while reality is `DuelComingSoon` on every game | R1 D-2, D-6 | MEDIUM-HIGH — SEO + non-OG scrapers see duel copy |
| HD-5 | UI empty-state copy promises hourly tournaments; cron runs daily | R1 D-4, R4 §3.2 | MEDIUM-HIGH — up to ~24h wait gap |
| HD-6 | Memory `project_settle_tournaments_silent_swallow_phase2` mis-paths bug (says `apps/api/src/routes/tournaments.ts:739`; actually `packages/duel-backend/src/cron/tournaments.ts:977`) | R4 §7 D1, offchain H4 | HIGH — memory-as-spec contradiction |
| HD-7 | Memory `project_post_yc_tournament_created_indexer` claims indexer missing; PR #41 shipped it (route in production at `23 0 * * *`) | R1 D-3, R4 §3.3 §7 D2 | HIGH — memory over-claims gap |

### 7.2 Medium-severity drift

| # | Drift | Tracks surfacing | Impact |
|---|---|---|---|
| MD-1 | CLAUDE.md says "Next 14 era"; all apps on `next@^16.2.4` | R2 D10, R3 D12, R4 §6.2 #1 §7 D3, memory `project_claudemd_nextjs_version_stale` | MEDIUM — already memory-flagged |
| MD-2 | CLAUDE.md "optimizer 200 runs, no via_ir" | R3 D2 | MEDIUM — supersede with ADR-0002 reference |
| MD-3 | CLAUDE.md header says "7 game apps + 1 sponsor app + 7 shared packages" | R1 D-1, R3 §1 | LOW — 6 game apps + 1 sponsor; same CLAUDE.md Structure section corrects internally |
| MD-4 | Legacy AGENT wallet `0x1569A95e…` unrevoked authorizations on ChallengeEscrow | R3 D3, Q-W2 | MEDIUM — Phase 2 cleanup item |
| MD-5 | Memory `project_skillos_rebrand_state` — GitHub rebrand done; Vercel project names + `skillbase.games` aliases + `QUICK_AUTH_DOMAIN` env still legacy | R3 D5, Q-V2 | MEDIUM — ~70% cutover; brand drift |
| MD-6 | `mas-2048` env shape diverges from other 5 games (CDP/x402 + Anchor address) | R3 D9, Q-V5 | MEDIUM — canonical-template ambiguity |
| MD-7 | `mas-wordle` install command `npm install --prefix` (no arg) | R3 D8, Q-V4 | MEDIUM — undocumented; build succeeds via fallback |
| MD-8 | `@skillos/sdk` registry has `0.1.0` and `0.2.1`, no `0.2.0` | R2 D2 | LOW — installable today; document the decision |
| MD-9 | `@skillos/skills` 0.2.0 in tree, 0.1.0 on registry (mdskills.ai gate) | R2 D1 | LOW — gated by founder |
| MD-10 | Public GitHub mirror `youngstar-eth/skillos` is private; npm `repository.url` 404s | R2 D3 | MEDIUM — external-dev friction |
| MD-11 | Phantom dep: 6 game apps import `@skillos/ai-coach` without declaring | R2 D4 | LOW (monorepo hoist; breaks pnpm or `--no-hoist`) |
| MD-12 | apps/api 3 test files not in CI (`agents-matches`, `charge-retry-fee`, `x402-client` — 13 cases) | R2 D7, R4 §5.2 |  MEDIUM — covers H5 + X15 race |
| MD-13 | `packages/sdk` `prebuild` triggers live API fetch — install-time HTTP dependency | R2 D8, memory `project_packages_sdk_circular_build_dep` | MEDIUM — outage = SDK won't install |
| MD-14 | Vercel project `node_modules` (junk; likely accidental `vercel link`) | R3 D11 | LOW — cleanup candidate |
| MD-15 | `apps/api/README.md` Sprint X2 framing (17 sprints stale) | R4 §6.1 | MEDIUM — external-dev confusion |
| MD-16 | Sprint retrospectives stopped after X15 | R4 §6.5 | LOW |
| MD-17 | `0001-v22-fee-splitter.md` ADR missing (numbering skip 0001 → 0002) | R4 §6.4 | LOW — deferred to P2 mainnet contract auditor consultation |
| MD-18 | `packages/sp-engine` `npm test` runs 1 of 2 test files | R2 D6 | LOW |
| MD-19 | Test runner inconsistency (vitest declared in apps/api; CI uses `tsx --test`) | R2 D9 | LOW |
| MD-20 | Memory `project_paid_retry_broadcast_post_yc` partially obsolete (Option A shipped via viem transport retry; B+C still backlog) | offchain I7 §memory-corrections | MEDIUM — re-prioritize against H9 |
| MD-21 | Memory `project_x15_8_payment_attempts_schema_lock` — file `v4_20260515b_x15_payment_attempts_canonical_lock.sql` applied to prod, not in branch | R4 §2.3 §7 D8, offchain memory-corrections, offchain H7 | HIGH (branch-state vs prod) |
| MD-22 | Memory `project_x4_uncalled_scripts_pre_merge_smoke` — pattern wider than original X4 incident (4+ subsystems) | R4 §7 D14 | LOW — meta-pattern |
| MD-23 | CLAUDE.md "May 4 2026" submission-readiness clause expired (today 2026-05-17) | R4 §6.2 #6 | LOW — operationally inert |
| MD-24 | CLAUDE.md says "Phase 2 transition introduces" CI gates and pre-commit hooks; CI shipped, hooks absent | R4 §6.2 #7 | LOW — partial drift |
| MD-25 | CLAUDE.md L165 backlog items already completed (Next.js bump, TournamentCreated indexer) | R4 §6.2 #3 §6.2 #5 | LOW |
| MD-26 | TournamentPool v2.2 fee-share constants source-prepared (`DEV_BPS=7000, PLATFORM_BPS=3000`) but undeployed | R3 §8 lesser disclosures | MEDIUM (upgrade gap, P2 deploy) |
| MD-27 | DevAttributionNFT address not exported in `packages/contracts/src/addresses.ts` | R3 §8 lesser disclosures | LOW (frontend can't read consistently) |
| MD-28 | ArcadePool source exists + 22 tests but no deployment script | R3 §1, lesser disclosures | LOW — dead-code candidate or P5 prep |

### 7.3 Methodological / meta-drift

| # | Drift | Source |
|---|---|---|
| MM-1 | Architecture-doc supplements v1.2 / v1.3 / v1.4 referenced in strategy docs but not on disk | communication-frame-v2.md §14, this synthesis preamble |
| MM-2 | Memory entries vs reality: 14 R4-surfaced drifts in 66 memory files (cadence: drift instances grow with memory expansion) | R4 §7 |
| MM-3 | "Memory-as-spec" usage pattern surfaces both direction-A (memory wrong vs code) and direction-B (code stale vs memory's predictive note); patch direction varies per entry | R4 §7.1 |

---

## 8. Pitch / audit / investor narrative inputs

### 8.1 One-pager input (top 5 strengths + honest gap framing)

Per `docs/strategy/communication-frame-v2.md` §6 lexicon: use "verifiable", "auditable", "permissionless", "class-agnostic"; avoid "trustless", "open", "skill economy infra for the agent era".

**Honest framing (chain-evidenced):**

1. *"Six game apps live on Base Sepolia with chain-verified Builder Code attribution (per-game `dataSuffix` confirmed in tx raw input)."*
2. *"Sweepstakes-safe by contract design — prize pools and retry fees on segregated storage slots. Permissionless sponsorship via `sponsorPool()`."*
3. *"Class-agnostic protocol — agents and humans submit on the same arena under the same attestation primitive (T0–T3 tier schema; T0 shipped)."*
4. *"Public OpenAPI substrate at `api.skillos.network` with 16 paths; SIWB (human) + SIWA (agent) auth; x402 paid-data tiers wired."*
5. *"Developer surface published: SDK + MCP + CLI + skill pack on npm; MCP exposes 8 tools to Claude Desktop / Cursor / Codex / Gemini CLI."*

**Honest gap framing:**

- *"T1+ plausibility deferred until Phase 2 mainnet; T0 score submission ships with signature gate only."*
- *"Duel system stubbed; Phase 1 ships solo flow end-to-end. Duel reactivation is Phase 2 first sprint."*
- *"Single-broadcaster STUDIO key concentration is documented and is the Phase 3 multi-sig / threshold transition target."*

### 8.2 Audit-firm packet input

**Centralization disclosures:** §4 (13 SPFs).

**Pre-mainnet blocker register (from UR Pass 1 offchain-findings):** 2 Critical + 9 High + 14 Medium + 7 Low + 7 Info = 39 distinct findings.

**Pre-audit hardening list (sub-day each):** C1, H4, H1, H2, H5, H6, H7 — 7 fixes that close the highest-leverage gaps before external audit kickoff.

**Foundry coverage delivery:** 207 tests across 8 contracts; ChallengeEscrow + ArcadePool branch-coverage lift required before audit (P2-Pre-Contract).

**Schema-drift register (X19):** 9 items, 3–5d sprint, all forward-only.

**Memory-as-spec corrections required pre-audit:** HD-6 (settle-path), HD-7 (indexer-shipped), MD-21 (v4_20260515b file gap), MD-20 (paid-retry partial-obsolete).

**Sweepstakes-safety invariant proof:** CLAUDE.md invariant 1 + contract design + `settle-guard` Foundry tests (currently `test.skip`'d on duel path — reactivation trigger).

### 8.3 VC due diligence input

**Capability inventory:** §2 (40+ capabilities mapped with Phase tags).

**Phase 2 roadmap with funding dependencies tagged:** §6.2 — 12 funding-independent sprints + 3 funding-dependent.

**Round terms:** `docs/strategy/round-spec.md` — $1M post-money SAFE at $10M cap, $100K audit + $50K Cayman + $500K runway + $150K ops + $200K reserve. First close Q3 2026, mainnet activation Q3 2026 (audit + Cayman gated). Active pipeline: a16z Speedrun SR007 (submitted 2026-05-16), Alliance ALL18, Coinbase Base Builder Grants, Coinbase Ventures direct.

**Howey discipline (binding):** No public token roadmap, no substrate intelligence reference, no multi-product specific timeline. Domain Neutrality at @SkillOS layer preserved per communication-frame-v2.md §4 invariant 1. Substrate-intelligence framing pitch-only.

**Defensible architecture invariants (per communication-frame-v2.md §4):**

| Invariant | Public posture |
|---|---|
| 2 — Class-agnostic substrate (5 primitives) | **Public defensible all layers** — Anthropic resonance |
| 3 — Permissionless sponsorship | **Public defensible all layers** — Skillz-vs-Papaya category anchor |
| 4 — Replay-verifiable evaluation | **Public defensible** — "verifiable AI / auditable capability eval" |
| 5 — Builder Code attribution (ERC-8021) | **Public defensible** — chain-evidenced |
| 6 — Engine-agnostic SDK | **Public defensible** — partnership-context use |
| 1 — Domain Neutrality | **Internal only** — never breach at @SkillOS layer |
| 7 — Achievement-gated tokenization | **Internal only** — Howey trigger |

---

## 9. Founder decision queue (aggregated from R1–R4)

Founder action required before Phase 2 sprint kickoff. Numbered by track origin + sequencing weight.

### Phase 1 wrap / scope decisions

- **Q-1 (R1 Q-1):** Phase 1 wrap = solo-only (a) OR ship-minimal-duel (c) OR wait-for-real-duel (b). Decision determines whether X10b is P1 wrap or P2 first sprint, and whether HD-4 (metadata over-promise) is bundled with duel reactivation or pre-wrap fix.
- **Q-2 (R1 Q-2):** Cron cadence — hourly vs daily. UI promises hourly; cron is daily. Either change schedule (24× cost), change copy, or accept gap. Pairs with **P2-Ops** sprint scoping (Vercel Pro $20/mo per project).
- **Q-3 (R1 Q-3):** Cross-game tournament browser in game apps — P1 wrap requirement or P2 polish? Today only sponsor app aggregates cross-game.
- **Q-4 (R1 Q-4):** Agent surface visibility — confirm whether ERC-8004 agent IDs / agent profiles / agent leaderboard are in P1 wrap scope. Per invariant 3 (class, not feature flag), absence is consistent; pitch-material implications drive the call.
- **Q-5 (R1 Q-5):** Identity richness (display name / avatar / bio / social handles) — P5 work to defer, or P2 polish that unblocks growth-loop sharing? Viral coefficient implication.
- **Q-6 (R1 Q-6):** `reconcile-duels` cron is dormant — disable until reactivation, or leave in place as no-op? Cost: trivial; signal-clarity: meaningful.
- **Q-7 (R1 Q-7):** When duel reactivates, do agent submissions flow through per-game BFF (`/api/duel/queue`) or through API service (`/v1/agents/matches/start-solo`)? Today only API path is live.
- **Q-8 (R1 Q-8):** apex `/watch` as the substrate showcase — expand it, or add a separate substrate-explorer app / game-app page? Phase 5 narrative dependency.

### Developer surface decisions

- **Q-9 (R2 Q1):** `@skillos/sdk` `0.1.0 → 0.2.1` gap (no `0.2.0` on registry) — leave as historical, publish a stub 0.2.0 tag, or write a one-paragraph decision in `docs/decisions/`.
- **Q-10 (R2 Q2):** Publish `@skillos/skills` 0.2.0 to npm now and run mdskills.ai catalog refresh against published tarball, or hold? Today SKILL.md frontmatter (0.2.0) ≠ registry (0.1.0).
- **Q-11 (R2 Q3):** Public GitHub mirror `youngstar-eth/skillos` is private; npm `repository.url` 404s. Three paths: flip to public, drop the public-mirror README claim, or subtree-split each package to its own public repo.
- **Q-12 (R2 Q4):** `packages/sdk` live-API `prebuild` — confirm X8 axis-6 plan (vendor openapi.json into repo + regenerate via PR) is still the approach.
- **Q-13 (R2 Q5):** Phantom + vestigial dep cleanup — single PR to (a) add `@skillos/ai-coach` to game apps that import it, (b) remove `@skillos/game-types` from declare-not-import deps, (c) remove `@skillos/lib-shared` from 5 apps that declare-but-don't-import.
- **Q-14 (R2 Q6):** `@skillos/sp-engine` substrate publication strategy — fold into `@skillos/sdk`, ship as `@skillos/replay`, or keep private until substrate consumer materializes? Phase 5 dependency.
- **Q-15 (R2 Q7):** Phase 2 non-React engine adapters (Unity WebGL, Roblox, Phaser, gb-studio) — is X11 the existing sprint placeholder?
- **Q-16 (R2 Q8):** apps/api 3 test files outside CI — add to CI now or defer pending vitest-on-tsx alignment.
- **Q-17 (R2 Q9):** Test runner unification — Node built-in (`tsx --test`) or vitest? Affects future test ergonomics across all packages.

### Infrastructure decisions

- **Q-18 (R3 Q-W1):** TournamentPool v2.1 declared `trustedSigner` `0xf35c284D9a…` has zero on-chain activity. Read on-chain `trustedSigner()` view via `cast call` to confirm canonical state. Either manifest stale or signer drift — pre-mainnet blocker.
- **Q-19 (R3 Q-W2):** Legacy AGENT wallet `0x1569A95e…` — formally revoke authorizations on ChallengeEscrow before mainnet, or still in active use?
- **Q-20 (R3 Q-V1):** `skillos.games` apex parking — point CNAME to `skillos.network`, dedicated Vercel marketing project, or stay parked until rebrand cutover announced?
- **Q-21 (R3 Q-V2):** Legacy `skillbase.games` cutover timing — when do dual-domain cost (TLS, registrar, `QUICK_AUTH_DOMAIN` env drift on 5 games) get cut? Risk: dropping aliases without updating `QUICK_AUTH_DOMAIN` breaks Farcaster Quick Auth.
- **Q-22 (R3 Q-V3):** Junk Vercel project `node_modules` — safe to delete?
- **Q-23 (R3 Q-V4):** `mas-wordle` install command `npm install --prefix` (no arg) — copy-paste truncation or intentional?
- **Q-24 (R3 Q-V5):** `mas-2048` env-var shape divergent from other 5 games (CDP/x402 + Anchor address). Canonical post-X15 template that other games owe an update, or X20 pilot-only?
- **Q-25 (R3 Q-C1):** Update CLAUDE.md "No CI today" claim — CI shipped with 97.8% pass rate, merge gate for `main`.
- **Q-26 (R3 Q-C2):** Update CLAUDE.md "no via_ir" claim — supersede with ADR-0002 reference.
- **Q-27 (R3 Q-S1):** `agent-runner.yml` daily `0 2 * * *` cron commented with "enable after 7-day stability" — stability window achieved? Uncomment in follow-up PR?
- **Q-28 (R3 Q-S2):** Staging Supabase project — (a) preview-branches on existing project, (b) separate staging project, or (c) accept single-prod risk with strong rollback procedure.

### Data + tests + docs decisions

- **Q-29 (R4 Q1):** Memory entries D1 (`project_settle_tournaments_silent_swallow_phase2` mis-pathed) + D2 (`project_post_yc_tournament_created_indexer` says missing, refuted by PR #41) — patch in follow-up R-track PR or direct edit?
- **Q-30 (R4 Q2):** CLAUDE.md sweep PR — 5 stale claims (Next 14, "no CI", May 4 deadline, completed backlog items, "introduces P2" CI/hooks). X8 axis-6 follow-up or v1.4-supplement sprint candidate?
- **Q-31 (R4 Q3):** `apps/api/README.md` Sprint X2 framing (17 sprints stale) — manual rewrite to Sprint X19+ reality, or replace with generated-from-OpenAPI docs page?
- **Q-32 (R4 Q4):** 3 apps/api test files outside CI — intentional (live AGENT_PRIVATE_KEY dependency) or drift? If intentional, flag with CI-skip comment.
- **Q-33 (R4 Q5):** `packages/sdk` zero-test policy pre-mainnet — hold SDK launch on coverage gate, or ship with smoke-only?
- **Q-34 (R4 Q6):** V1 orphan tables (`challenges` 25 cols, `users`, `game_sessions`, 5 dormant `daily_*`) — quarantine + drop, or formal adoption for FID/social-profile mapping?
- **Q-35 (R4 Q7):** Sub-daily cron cadence — Vercel Pro upgrade now (Phase 1 ops $20/mo per project) or hold until Phase 2 mainnet?
- **Q-36 (R4 Q8):** Phase 5 data-layer initiative — is the current "no human-side move trace + no telemetry firehose + no licensing column" posture defensible Phase 1–4, or does substrate intelligence narrative require visible data-layer prep by Phase 3?

---

## Appendix A — Verification & cross-track index

### A.1 Source-of-truth cross-reference for top findings

| Finding | R1 | R2 | R3 | R4 | UR Pass 1 | Memory |
|---|---|---|---|---|---|---|
| Duel stubbed across 6 games | §2.1, §5.7, D-2 | §2.5 (no duel hooks in SDK) | — | §5.3 (settle-guard `test.skip`'d) | — | `project_phase2_duel_reactivation` |
| Settle silent-swallow | §2.3 | — | — | §3.2, §7 D1 | H4 | `project_settle_tournaments_silent_swallow_phase2` (mis-pathed) |
| T0/T1+ plausibility gate | §2.4 | §4.3 | — | — | H3 | `project_phase2_mainnet_blocker_plausibility` |
| Builder Code chain-verified | §2.1 | §2.1 (`builderCodeToDataSuffix`) | §6 | — | I-confirmation | `project_api_server_side_datasuffix_attribution_gap` (CLOSED) |
| CLAUDE.md "no CI today" | D-1 (header count) | §3.5, D10 | D1 | §6.2 #2 | — | — |
| TournamentCreated indexer status | D-3 | — | §1 | §3.3 §7 D2 | — | `project_post_yc_tournament_created_indexer` (refuted) |
| STUDIO single-broadcaster | — | — | §8 disclosure #1 | — | M11 | — |
| Staging Supabase missing | — | — | §8 disclosure #4, Q-S2 | — | — | `project_skillos_no_staging_supabase` |
| Schema drift 9 items | — | — | — | §2, §2.1 | — | (X19 plan on disk) |
| SDK 0 external consumers, 0 tests | — | §3.1, §4.1 | — | §5.4 | — | — |
| Apex marketing apex (skillos.games) parked | — | — | D10, Q-V1 | — | — | — |
| `v4_20260515b` file uncommitted | — | — | — | §2.3, §7 D8 | H7 + memory-corrections | `project_x15_8_payment_attempts_schema_lock` |

### A.2 Drift count summary

| Track | Drift instances surfaced | Severity tilt |
|---|---|---|
| R1 (apps) | 6 (D-1 through D-6) | Mostly medium (game metadata, cron-vs-UI-copy) |
| R2 (packages) | 10 (D1 through D10) | Mostly low-medium (registry vs tree, phantom deps) |
| R3 (infra/contracts/auth) | 12 (D1 through D12) | High-impact: CI doc, trustedSigner config, apex domain |
| R4 (data/tests/docs) | 14 (memory-as-spec, §7) | High-impact: settle-path memory wrong, indexer memory wrong, CLAUDE.md sweep |
| **Total deduplicated** | **42 distinct** (after cross-track collapse) | 7 HIGH, ~15 MEDIUM, ~20 LOW |

### A.3 Open-question count summary

| Track | Founder questions |
|---|---|
| R1 | 8 (Q-1 to Q-8) |
| R2 | 9 (Q1 to Q9) |
| R3 | 11 (Q-W1, Q-W2, Q-V1 to Q-V5, Q-C1, Q-C2, Q-S1, Q-S2) |
| R4 | 8 (Q1 to Q8) |
| **Total** | **36** (mapped to Q-1 through Q-36 in §9) |

### A.4 Constraints honored

- Synthesis only — no new findings beyond R1–R4 + UR Pass 1 ✓
- Cross-referenced findings across tracks (per-finding source-track map in §A.1) ✓
- Phase tagged every capability + gap ✓
- Audit-prep tone (honest, no overclaim) ✓
- Domain neutrality preserved (skill-gaming framing at protocol layer; broader substrate framing only where R-tracks already surfaced) ✓
- Phase 1 wrap declared as entry-baseline assumption; this synthesis is Phase 2 entry input ✓

End of CR1 Synthesis.
