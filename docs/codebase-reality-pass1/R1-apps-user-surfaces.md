# CR1 / R1 — Apps + User Surfaces Inventory

**Status:** read-only audit, no code or infra changes.
**Author:** automated CR1 pass (Track R1), founder-reviewed.
**Audit date:** 2026-05-17.
**Base:** `origin/main` at `f3a7831` (PR #112 merge — `ur/track-b-offchain`).
**Worktree:** `cr1/r1-apps-user-surfaces`.

This pass inventories every user-reachable surface in the SkillOS substrate along
the Phase 1 → Phase 5 trajectory and grades each feature against actual ship
state, not memory or planning docs. Memory entries and CLAUDE.md claims were
cross-checked against on-disk reality; drift instances are surfaced in §6.

"Live" = deployed + user-reachable + not stubbed. "Stubbed" = route exists but
renders a placeholder. "Broken" = route exists, attempts real work, fails for
the typical user. "Planned" = referenced in roadmap / memory / code comments
but no implementation on disk. "Memory-claim-only" = asserted by memory but
not verifiable in repo.

---

## 1. Master app inventory

| App | Repo path | Production URL | Vercel project | Last prod deploy | User-facing? | Live state summary |
|-----|-----------|----------------|----------------|------------------|--------------|--------------------|
| 2048 | `apps/2048` | `2048.skillos.games` | `mas-2048` | ~2h ago (2026-05-17) | yes | Solo + tournament + leaderboard + profile live; duel stubbed. Reference impl: hosts unique `/api/paymaster`, `/api/public`, `/api/sp-snapshot-status`. |
| Wordle | `apps/wordle` | `wordle.skillos.games` | `mas-wordle` | ~2h ago | yes | Same template as 2048 minus reference-only routes. |
| Sudoku | `apps/sudoku` | `sudoku.skillos.games` | `mas-sudoku` | ~2h ago | yes | Same template as 2048. |
| Minesweeper | `apps/minesweeper` | `minesweeper.skillos.games` | `mas-minesweeper` | ~2h ago | yes | Same template as 2048. |
| Clicker | `apps/clicker` | `clicker.skillos.games` | `mas-clicker` | ~2h ago | yes | Same template as 2048. |
| Match3 | `apps/match3` | `match3.skillos.games` | `mas-match3` | ~2h ago | yes | Same template as 2048. Chronic sponsor-wallet-burndown failure mode resolved by PR #80 preflight. |
| Sponsor | `apps/sponsor` | `sponsor.skillos.games` | `skillbase-sponsor` | ~2h ago | yes | Cross-game tournament list + per-tournament sponsor flow + `/dashboard` (my sponsorships). |
| Orchestrator | `apps/orchestrator` | `skillbase-orchestrator.vercel.app` | `skillbase-orchestrator` | ~2h ago | no (ops) | Cron host. Root page is a static "no public UI" explainer. 6 cron routes (see §4). |
| API | `apps/api` | `api.skillos.network` | `api` | ~2h ago | indirect | Hono service. 16 documented OpenAPI paths under `/v1/*`. Live: `/v1/health` returned `version 0.1.0, base-sepolia, chainId 84532`. |
| Agent-runner | `apps/agent-runner` | n/a (CLI) | none | n/a | no (CLI) | TS CLI invoked via `tsx src/cli.ts`. Not deployed. SIWA handshake + score submit + ERC-8004 registration. |
| Apex | `youngstar-eth/skillos-apex` (separate repo, local `/Users/inancayvaz/skillbase-apex`) | `skillos.network` (+ www, + legacy `skillbase.games`, `skillbase-apex.vercel.app`) | `skillbase-apex` | 22h ago (deploy `dpl_6HpvFQe4P...`) | yes | Marketing pages (`/`, `/how`, `/why`, `/roadmap`, `/x402`, legal), `/banners`, `/watch` + `/watch/[runId]` replay viewer. No wallet auth. |

**Notes**
- `node_modules` and `simpl3` Vercel projects exist in the `simpl3s-projects` scope but are unrelated to SkillOS user surfaces (per memory: `simpl3.ai` corp site is role-asymmetric to apex).
- "Last prod deploy ~2h ago" was confirmed via `vercel ls --scope simpl3s-projects` at audit time.
- The CLAUDE.md header line "Multi-app SkillOS monorepo — 7 game apps + 1 sponsor app + 7 shared packages" is stale: there are **6 game apps** on disk (2048, wordle, sudoku, minesweeper, clicker, match3). The Structure section of the same CLAUDE.md correctly lists 6 games. Drift logged in §6.

---

## 2. Per-app feature matrix

### 2.1 Game apps (uniform template — 2048 / wordle / sudoku / minesweeper / clicker / match3)

All 6 game apps share an **identical Next.js App Router route shape**. Behaviour
diverges only in `src/lib/<game-name>/` and game-specific React components
under `src/components/`. The matrix below applies to every game; per-game
deviations are called out inline.

| Feature | State | Auth flow | Backend deps | Phase tag | Notes |
|---------|-------|-----------|--------------|-----------|-------|
| `/` landing (`ModeChooser`) | live | none | none | Phase 1 | 4-line shell — all logic in `@skillos/ui`. |
| `/tournament` daily + weekly | live | wagmi `useAccount` (read-only) | `/api/tournaments` → `api.skillos.network` | Phase 1 | React Query 5s/15s refetch; prize-curve preview; sponsor strip. |
| `/tournament/[id]` detail | live | wagmi read-only | `/api/tournaments/[id]` | Phase 1 | Backed by Supabase tournament row + on-chain id. |
| `/tournament/solo` (pay-then-play) | live | SIWB sign-in via `@skillos/sdk/react` | api `/v1/scores`, contracts (`approve` + `chargeRetryFee`), Coach + Recap (fire-on-mount) | Phase 1 | `useSoloRetry` hook in `@skillos/ui`. **EIP-5792 batched paymaster explicitly deferred to Phase 2** per comment block. Every wallet uses legacy `useWriteContract` approve + charge today (bundler-drop bug). |
| `/tournament/archive` | live | none | `/api/tournaments/archive` | Phase 1 | Last 10 settled tournaments. |
| `/leaderboard` (global SP) | live | none | `/api/leaderboard` | Phase 1 | Cross-game all-time. Code comment: "per-game filtering, time windows — post-submission backlog." |
| `/profile/[address]` | live | none | `/api/profile/[address]` | Phase 1 | Public profile, no auth gate. Activity feed = duel + solo rows. **Duel rows will populate only after duel reactivation (Phase 2).** |
| `/duel/waiting` | **stubbed** | n/a | n/a | Phase 2 target | 4-line file: `return <DuelComingSoon />;` from `@skillos/ui`. |
| `/duel/[id]` | **stubbed** | n/a | n/a | Phase 2 target | Same stub. |
| `/duel/[id]/result` | **stubbed** | n/a | n/a | Phase 2 target | Same stub. |
| `/api/leaderboard` (BFF) | live | none | proxy to api.skillos.network | Phase 1 | |
| `/api/profile/[address]` (BFF) | live | none | proxy to api.skillos.network | Phase 1 | |
| `/api/sp-earned` (BFF) | live | bearer | api scores | Phase 1 | Used by SPEarnedCard after solo run. |
| `/api/tournaments[*]` (BFF) | live | none | proxy to api.skillos.network | Phase 1 | |
| `/api/duel/queue` (BFF) | broken-by-design | n/a | n/a | Phase 2 target | Route file exists; underlying duel system gated by `DuelComingSoon`. Not user-reachable from any live page. |
| `/api/duel/submit` (BFF) | broken-by-design | n/a | n/a | Phase 2 target | Same. |
| `/api/duel/status` (BFF) | broken-by-design | n/a | n/a | Phase 2 target | Same. |
| `/api/admin/flags` | live | privileged | re-export of `adminFlagsHandler` from `@skillos/duel-backend` | Phase 1 | Internal ops. |
| `/api/admin/system-health` | live (2048 only) | privileged | duel-backend | Phase 1 | Reference impl only. |
| `/api/health` | live | none | self | Phase 1 | Liveness check. |
| `/api/paymaster` | live (2048 only) | wallet | x402 facilitator | Phase 1 | Per-game x402 surface lives on the reference impl. |
| `/api/public` | live (2048 only) | none | duel-backend | Phase 1 | Reference public route surface. |
| `/api/sp-snapshot-status` | live (2048 only) | none | duel-backend | Phase 1 | Reference SP snapshot status surface. |
| `/dev/game-test` | live | none | none | dev-only | Internal QA harness. |
| `/dev/sdk-demo` | live (2048 only) | SIWB | sdk | Phase 1 | SDK demo / live SIWB handshake debug page. |
| `/.well-known/farcaster.json` | live | none | static | Phase 1 | Farcaster Frames embed manifest. |
| Builder-code attribution | live | sdk provider config | `submitSoloScore` dataSuffix | Phase 1 | Per-game unique code: 2048=`bc_o6szuvg1`, wordle=`bc_l0drfg77`, sudoku=`bc_ixx8hzql`, minesweeper=`bc_6gsgkv5q`, clicker=`bc_m59xxykm`, match3=`bc_iqoz78rc`. Memory `project_api_server_side_datasuffix_attribution_gap` (CLOSED 2026-05-14) confirms chain-verified. |
| Basenames resolution (display) | live | n/a (read-only) | `useBasename` hook (ENSIP-19) | Phase 1 | `<AddressDisplay>` progressively enhances any address to its Basename. |

**Per-game lib divergence (audit out of scope for R1; flagged for R2):**
each game has its own `src/lib/<game>/` directory containing game-logic
primitives (board state, scoring, etc.). Anti-cheat plausibility behavior
will vary by game; the API-side T0 signature gate is uniform (per memory
`project_phase2_mainnet_blocker_plausibility`).

### 2.2 Sponsor app

| Feature | State | Auth flow | Backend deps | Phase tag | Notes |
|---------|-------|-----------|--------------|-----------|-------|
| `/` cross-game active tournament list | live | none | `/api/sponsor/tournaments` | Phase 1 | 5-min React Query refetch (matches indexer cadence). |
| `/[onChainId]` per-tournament sponsor flow | live | wallet sign (via shared providers) | contracts `sponsorPool()` | Phase 1 | Permissionless — anyone can fund. Soulbound receipt per CLAUDE.md sweepstakes invariant. |
| `/dashboard` my sponsorships | live | wallet | `/api/sponsor/contributions` | Phase 1 | |
| `/api/sponsor/tournaments` | live | none | duel-backend | Phase 1 | |
| `/api/sponsor/contributions` | live | wallet | duel-backend | Phase 1 | |
| `/api/sponsor/tournament/[tournamentId]/sponsors` | live | none | duel-backend | Phase 1 | Per-tournament sponsor list. |

### 2.3 Orchestrator app

| Feature | State | Auth flow | Backend deps | Phase tag | Notes |
|---------|-------|-----------|--------------|-----------|-------|
| `/` static explainer | live | none | none | Phase 1 | Deliberately UI-less per source comment. |
| `/api/cron/create-tournaments` (cron: `0 0 * * *` daily 00:00 UTC) | live | `CRON_SECRET` Bearer | duel-backend `runCreateTournaments`, RPC, Supabase | Phase 1 | Worst-case 12 txs (6 games × daily + 6 × weekly). Schedule contradicts in-product copy — see §6 drift D-4. |
| `/api/cron/settle-tournaments` (cron: `5 0 * * *`) | live | `CRON_SECRET` Bearer | duel-backend, RPC | Phase 1 | Memory `project_settle_tournaments_silent_swallow_phase2` flags an unfixed silent-swallow bug at `tournaments.ts ~line 739` (TournamentAlreadySettled) — Phase 2 must patch before mainnet. |
| `/api/cron/index-sponsor-events` (cron: `15 0 * * *`) | live | `CRON_SECRET` Bearer | duel-backend, RPC | Phase 1 | |
| `/api/cron/index-tournaments-created` (cron: `23 0 * * *`) | live | `CRON_SECRET` Bearer | duel-backend, RPC | Phase 1 | Memory `project_post_yc_tournament_created_indexer` claimed no listener existed; this route refutes the claim (or post-dates the memory). Drift surfaced in §6. |
| `/api/cron/reconcile-duels` (cron: `13 1 * * *`) | live (cron live; duel data path stubbed) | `CRON_SECRET` Bearer | duel-backend | Phase 1 | Reconciliation work scoped for an unbuilt duel system. Effectively dormant until Phase 2 duel reactivation. |
| `/api/cron/anchor-sp-snapshot` (cron: `7 2 * * *`) | live | `CRON_SECRET` Bearer | duel-backend, contracts | Phase 1 | |

### 2.4 API app (Hono on Vercel)

Verified via `curl https://api.skillos.network/openapi.json` and
`/v1/health`.

| Route | State | Auth | Phase tag | Notes |
|-------|-------|------|-----------|-------|
| `GET /v1/health` | live | none | Phase 1 | Returned `{version, commit:'', uptimeSeconds, network:base-sepolia, chainId:84532}`. |
| `GET /v1/tournaments` | live | none | Phase 1 | |
| `GET /v1/tournaments/{id}` | live | none | Phase 1 | |
| `GET /v1/tournaments/{id}/leaderboard` | live | none | Phase 1 | |
| `POST /v1/scores` | live (T0 only — signature gate; plausibility deferred) | bearer | Phase 1 | Per memory `project_phase2_mainnet_blocker_plausibility`: real-USDC tournaments need T1+ before mainnet. |
| `GET /v1/scores/{wallet}` | live | none | Phase 1 | |
| `GET /v1/sponsors/{wallet}/receipts` | live | none | Phase 1 | |
| `POST /v1/auth/siwb/nonce` | live | none | Phase 1 | Used by `@skillos/sdk/react.signIn` from every game app. |
| `POST /v1/auth/siwb/verify` | live | none | Phase 1 | Issues bearer + sessionId. |
| `POST /v1/auth/siwa/nonce` | live | none | Phase 1 | Agent path. |
| `POST /v1/auth/siwa/verify` | live | none | Phase 1 | Agent path. |
| `POST /v1/agents/matches/start-solo` | live | SIWA bearer | Phase 1 | Hotfix C1 wired the auth gate (commit `246ba54`). |
| `GET /v1/agents/profile` | live | SIWA bearer | Phase 1 | |
| `POST /v1/agents/scores` | live | SIWA bearer | Phase 1 | Agent submit path; uses `chargeRetryFee` (memory: function still named `chargeRetryFee`, not `chargeEntryFee`). |
| `GET /v1/data/cohort-snapshot` | live | x402 paywall | Phase 1 | Substrate revenue surface. |
| `GET /v1/data/match-replay/{id}` | live | x402 paywall | Phase 1 | Substrate revenue surface. |

### 2.5 Agent-runner app (CLI, not deployed)

Pure operator CLI — `package.json` exposes only `agent: tsx src/cli.ts`. No
build, no Vercel project, no public URL. Uses `@buildersgarden/siwa` 0.0.24
+ viem. Per memory `project_x4_siwa_library_signer_brittleness`, this is the
sanctioned bypass-the-helper path that uses direct `viem.writeContract`.

### 2.6 Apex (separate repo, `skillos-apex`)

| Feature | State | Auth flow | Backend deps | Phase tag | Notes |
|---------|-------|-----------|--------------|-----------|-------|
| `/` landing | live | none | static | Phase 1 | 37-line shell — content modules under `components/skillos/`. |
| `/how`, `/why`, `/roadmap` | live | none | static | Phase 1 | Marketing narrative. |
| `/x402` | live | none | static | Phase 1 | x402 narrative page. |
| `/banners` | live | none | static | Phase 1 | Asset/banner reference page. |
| `/watch` (run index) | live | none | Supabase server-side | Phase 1 | |
| `/watch/[runId]` replay | live | none | Supabase server-side: `duel_runs` + `duel_moves` + `payment_attempts` (X15.5) | Phase 1 | Per memory `project_x15_replay_ux_shipped`: `duel_moves.board_after` is snapshot source, `scrubIndex=null` ≡ follow-tail. |
| `/legal/{privacy,sweepstakes,terms}` | live | none | static | Phase 1 | |
| `/.well-known/farcaster.json` | live | none | static | Phase 1 | |
| Wallet sign-in / wagmi | **absent** | n/a | n/a | n/a | No `signIn`, `wagmi`, `useSiwb`, `@buildersgarden`, or `connectAsync` references anywhere in `app/`, `lib/`, or `components/`. Apex is fully read-only. |
| `/demo` redirect | live | none | redirect to `/watch/a9b96de9-...` | Phase 1 | Outreach short URL — commit `c906357`. |

---

## 3. Identity + profile layer assessment

### 3.1 What happens when a user signs in

The game apps use **SIWB (Sign-In With Base)**, not SIWA. The flow lives in
`packages/sdk/src/react.tsx::useSkillOSAuth.signIn`:

1. wagmi connects the first available connector if not already connected.
2. SDK fetches `/v1/auth/siwb/nonce` (api.skillos.network).
3. SDK builds a SIWE-format message (`domain` defaults to `DEFAULT_SIWB_DOMAIN`, chainId from `getChainAddresses(config.env).chainId`).
4. wagmi `signMessageAsync` prompts the wallet.
5. SDK POSTs to `/v1/auth/siwb/verify`; receives `{ token, expiresAt, sessionId }`.
6. SDK stores the bearer snapshot in `localStorage` (per `persistAuth: "localStorage"` config in every game's `layout.tsx`).
7. Expiry is enforced via a single `setTimeout(setBearer(null), msUntilExpiry)`.

**SIWA** is the agent-only path, surfaced exclusively by `apps/api/src/routes/auth-siwa.ts` and consumed by `apps/agent-runner`. No user-facing app imports SIWA.

### 3.2 What identity persists post-sign-in

| Layer | What persists | Where |
|-------|--------------|-------|
| Wallet address | the EOA / Smart Wallet that signed | wagmi state + bearer snapshot |
| Bearer token + sessionId | server-issued, expiry-bounded | localStorage (game apps only) |
| SP balance | aggregated cross-game total | api → Supabase (`v2_scores` etc., per R4) |
| Level | derived from SP via `@skillos/sp-engine` | api → derived |
| Activity history | duels (Phase 2) + solo runs | api `/v1/scores/{wallet}` |
| Builder Code attribution | dataSuffix attached at submit time | `submit_tx_hash.raw_input` tail — chain-verified |
| Basename (if any) | reverse-resolved on display | `useBasename` (`packages/ui`) — runtime only, not persisted |
| ERC-8004 agent ID | mint receipt + tokenURI | `agent-receipt.ts` (api), agent-runner; not user-facing |
| Avatar, bio, display name, social handles | **none** | — |

### 3.3 Profile completeness

There is **no user-editable profile**. `/profile/[address]` is a pure read view
keyed on the address. No display name. No avatar upload. No bio. No social
links. The only identity-rich surface is Basenames inline display.

**Phase 5 implication:** the substrate currently produces (address → SP, level,
match history). It does not produce (address → handle, avatar, persona). If
Phase 5 narratives lean on rich identity, the gap is real today.

### 3.4 Agent metadata layer state

- **Registry:** ERC-8004 `AgentRegistry` contract is wired into agent-runner's authentication path (`registerAgent` helper). Memory `reference_erc8004_registry_view_fns` documents minimal ABI and warns: no owner→agentId reverse lookup; `ownerOf(agentId)→address`.
- **Encoder spec:** Memory `project_erc8021_encoder_spec_compliance` flags the SDK emits 11B raw ASCII whereas spec calls for 16B structured. `base.dev` lenient today — runtime-verified working but spec-non-compliant. Phase 2/audit hardening item.
- **UI surface:** **None.** No `/agents` route in any game app, no agent leaderboard, no agent profile page. Search across `apps/*/src` for "AgentRegistry / agentId / ERC-8004" returned matches in `apps/agent-runner` and `apps/api` only — both backend.
- **Implication:** Per CLAUDE.md invariant 3 ("agent participation is a class, not a feature flag"), this is consistent — agents play under the same arena, indistinguishable to the UI from a human address. However, if the pitch claims an "agents leaderboard" or "agent showcase," that surface does not exist as of audit.

### 3.5 Basenames integration

`packages/ui/src/useBasename.ts` reverse-resolves any 0x... address via ENSIP-19
(Base reverse-suffix derived from ENSIP-11 cointype `0x80000000 | chainId`).
`AddressDisplay` (used in profile, leaderboard, tournament leaderboard) drops
in the basename inline when one resolves. **No basename minting / claiming UI
exists in any app.** If a user wants a Basename, they self-serve via
`base.org/names` or equivalent — SkillOS only displays.

---

## 4. Cross-game / aggregation features

| Feature | State | Where it lives | Notes |
|---------|-------|---------------|-------|
| Global SP leaderboard (cross-game, all-time) | live | Per-game `/leaderboard` page; same rows on every game | Backed by api leaderboard endpoint. No per-game filter, no time window — flagged "post-submission backlog" in source. |
| Cross-app SP balance | live | `/profile/[address]` shows aggregated `totalSp`, `currentLevel` | Computed via `@skillos/sp-engine`. |
| Cross-app activity feed | partial (solo only) | `/profile/[address]` activity rows | Duel kind exists in `ActivityRow` type but rows populate only post duel reactivation (Phase 2). |
| Cross-app tournament discovery | live | `sponsor.skillos.games/` | Lists daily + weekly tournaments across all 6 games sorted by `endsAt` ASC. The **only** cross-game tournament discovery UI for users today. Game apps only show their own game's tournaments. |
| Watch / replay aggregation | live | apex `/watch` + `/watch/[runId]` | Reads `duel_runs` from Supabase; tolerant of missing `payment_attempts` table. Multi-game. |
| Builder Code aggregation / split telemetry | not user-facing | Server-side dataSuffix on `submitSoloScore` | Per memory closed 2026-05-14. No UI for builders to see attribution split. |

**Missing aggregation surfaces** (not built; relevant to Phase 5 substrate intelligence narrative):
- No per-game cross-app leaderboard view (e.g. "top 10 Wordle players this week").
- No time-windowed leaderboard (daily / weekly / monthly).
- No agent vs human split / agent-only board.
- No skill-class / cohort discovery surface for AI labs (the cohort-snapshot is API + x402 only).
- No tournament discovery in the game apps themselves — players land on a single game's `/tournament` and cannot easily switch to another game's tournament from the UI (apex `/watch` covers replays, sponsor app covers prize-pool, but neither is a player-tournament-browser).

---

## 5. Per-app Phase trajectory readiness

### 5.1 The 6 game apps (uniform read)

**Phase 1 ready:** yes for solo path. Solo flow is the entire user-facing
narrative today — pay → play → submit → SP → level → leaderboard. End-to-end
in production. The "skill duels on Base" framing in `metadata.description` of
every game's `layout.tsx` is misleading vs reality (no duel ships).

**Phase 2 work required per game:**
- Replace `DuelComingSoon` with real duel UI on `/duel/waiting`, `/duel/[id]`, `/duel/[id]/result`.
- Wire `/api/duel/queue|submit|status` to the duel backend matchmaker (currently file scaffolds; underlying matcher is Phase 2 reactivation work per CLAUDE.md).
- Promote `tournament/solo` to EIP-5792 batched paymaster path (currently legacy approve+charge — bundler-drop bug not diagnosed).
- Lift the API plausibility gate from T0 (signature only) to T1+ before mainnet (memory `project_phase2_mainnet_blocker_plausibility`).

**Phase 5 substrate contribution:** every game generates `(address, game, score, runId, dataSuffix)` rows in `v2_scores` and `duel_runs`. These rows are the raw substrate. The constraint is variety: 6 deterministic-state games skewed toward word/number/spatial puzzles is a narrow slice of cohort behavior. Substrate-intelligence claims that depend on a wide skill surface need either (a) more game classes (action, strategy, social), (b) AI-graded subjective tasks, or (c) honest scoping in the pitch.

### 5.2 Sponsor

**Phase 1 ready:** yes. Cross-game discovery + permissionless funding flow is live and the sweepstakes-safety invariant (segregated prize-pool slot) is preserved by contract design.

**Phase 2 work:** soulbound receipt branding/verification UI polish if mainnet messaging changes; sponsor-side replay / receipt-share surface.

**Phase 5 contribution:** sponsor wallets become a labelled cohort feature for substrate datasets (which sponsors fund which game classes), but no current surface exposes that.

### 5.3 Orchestrator

**Phase 1 ready:** yes for the 6 cron routes that drive tournament state.
However: cron schedule is **daily**, not hourly. Worst-case ~24h gap between
tournament cycles. If pitch material implies "always-on tournaments", this is
honesty drift (see §6 D-4).

**Phase 2 work:**
- Patch silent-swallow at `settle-tournaments` Path I (memory: `project_settle_tournaments_silent_swallow_phase2`).
- Decide hourly vs daily cadence with founder + cost analysis; reconcile with UI copy.
- Add cron-throughput refactor (per CLAUDE.md post-YC backlog).

**Phase 5 contribution:** orchestrator is the substrate's "metronome" — anchor-sp-snapshot is the timestamping primitive that lets cohort-snapshot have versioned reads.

### 5.4 API

**Phase 1 ready:** yes. 16 documented paths, live OpenAPI, SIWB + SIWA both shipping, x402 paywall on `/v1/data/*`.

**Phase 2 work:**
- T1+ plausibility for `POST /v1/scores`.
- Mainnet contract address rotation everywhere addresses are inlined.
- Settle-tournaments silent-swallow patch (api side of the same bug — see memory).
- Rate-limit + abuse posture for `/v1/data/*` x402 surface once mainnet broadens audience.

**Phase 5 contribution:** the API **is** the substrate's read interface. Every Phase 5 lab-facing endpoint will be an extension here, not a new app.

### 5.5 Agent-runner

**Phase 1 ready:** yes for solo agent submission (`runId → score → SIWA-signed submit`).

**Phase 2 work:** retry-race handling (memory `project_x15_chargeretryfee_first_paid_retry_race` documents a needs_manual_review row pattern on first paid retry — open).

**Phase 5 contribution:** the agent-runner CLI is the reference for "any team can register an agent and play under the same arena" — Phase 5 substrate quality depends on multiple independent agent populations. Today there is one.

### 5.6 Apex

**Phase 1 ready:** yes for marketing + watch. Live at primary domain.

**Phase 2 work:** apex narrative cadence is documented as "intentionally on different cadence than monorepo README" per CLAUDE.md "Two phase numbering systems." Update marketing-public Phase 02 messaging when mainnet activation date locks.

**Phase 5 contribution:** the `/watch` replay surface is the **closest thing to a substrate showcase** that exists today. If Phase 5 needs a "see the substrate" public surface, apex `/watch` is the seed.

### 5.7 The duel stub (cross-cutting)

All 6 games ship duel routes as `<DuelComingSoon />`. The `/tournament` page
footer link "Play a duel →" routes to `/duel/waiting`, which renders the
ComingSoon placeholder. This is a **non-broken, but misleading user flow**:
the link works, the page loads, but a player following the link learns the
feature isn't live. Whether this is acceptable for Phase 1 wrap depends on
how prominently "skill duels" feature in the public Phase 1 narrative.

CLAUDE.md openGraph description on every game (`"Stake 1 USDC, match a player,
play 2048 for 2 minutes. Higher score wins the pool."`) describes the duel,
not the solo flow. The metadata over-promises relative to what ships. See §6
D-2.

---

## 6. Drift inventory (memory / docs vs reality)

### D-1 — CLAUDE.md header count
- **Claim:** "Multi-app SkillOS monorepo — 7 game apps + 1 sponsor app + 7 shared packages" (CLAUDE.md line 3).
- **Reality:** 6 game apps on disk. The Structure section of the same CLAUDE.md correctly lists 6 (2048, wordle, sudoku, minesweeper, clicker, match3).
- **Surfaced by:** `ls apps/` → 10 entries, of which 6 are games (the other 4 are `api`, `agent-runner`, `orchestrator`, `sponsor`).
- **Impact:** low. Internal-doc-drift; corrects with a single header edit.

### D-2 — Game metadata over-promises duel
- **Claim:** every game's `layout.tsx` exports `metadata.title = "SkillOS — On-chain skill duels on Base"` and `metadata.description = "Stake 1 USDC, match a player, play 2048 for 2 minutes. Higher score wins the pool."` (the SEO + general link-preview surface).
- **Reality:** duel is `<DuelComingSoon />` on every game. Solo is the live flow. OG-specific overrides (`openGraph.description = "Merge tiles. Prove skill. Earn SP."`) are correctly neutral on 2048, so most Farcaster/X cards are fine — but the general `metadata.description` (and any scraper that ignores openGraph) still shows the duel copy.
- **Surfaced by:** `sed -n '7,15p' apps/2048/src/app/layout.tsx` + `cat apps/2048/src/app/duel/[id]/page.tsx` (4 lines, returns `<DuelComingSoon />`).
- **Impact:** medium. The `<title>` shown in browser tabs and the page-level meta description used by Google + non-OG scrapers describe a feature that isn't shipped.

### D-3 — Memory `project_post_yc_tournament_created_indexer` says "no event listener exists"
- **Memory claim:** "TournamentCreated indexer — no event listener exists; permissionless createTournament() orphans v2_tournaments row, manual backfill needed."
- **Reality:** `apps/orchestrator/src/app/api/cron/index-tournaments-created/route.ts` is live and scheduled at `23 0 * * *`.
- **Surfaced by:** `find apps/orchestrator/src/app/api/cron -name 'route.ts'`.
- **Impact:** memory is stale (or the route was shipped after the memory was written). Confirm the route actually indexes `TournamentCreated` events (R3 contract track to verify wiring), then mark memory closed.

### D-4 — Tournament empty-state copy contradicts cron schedule
- **UI claim:** `/tournament` empty state and `EmptyState` component: *"A fresh daily tournament opens every hour, top-of-hour. The weekly cycle starts each Monday at 00:00 UTC."*
- **Cron reality:** `apps/orchestrator/vercel.json` schedules `create-tournaments` at `0 0 * * *` — **once per day at 00:00 UTC**, not hourly.
- **Surfaced by:** reading `tournament/page.tsx` lines 222-223 and `orchestrator/vercel.json` schedule block in the same audit pass.
- **Impact:** medium-high. Empty-state copy promises a 1-hour worst-case wait; reality is up to ~24h. Either change the schedule, the copy, or accept the gap with founder.

### D-5 — Memory `project_x15_8_payment_attempts_schema_lock` open follow-up
- **Memory claim:** "X15.5 apex frontend rename PR still OPEN."
- **Reality:** apex `/watch/[runId]/page.tsx` reads `payment_attempts` table tolerantly ("X15.5: latest payment attempt, tolerant of 'table not found'"). Verifying whether the rename PR landed is R4 (schema) territory; flagged here for cross-track follow-up.
- **Impact:** low for R1 — apex `/watch` page works either way due to tolerant fetch.

### D-6 — `metadata.title` says "On-chain skill duels"
- Same surface as D-2 — `title: "SkillOS — On-chain skill duels on Base"`. Public-positioning verb is "duels" while ship-state is "solo tournaments." Acknowledged here as a sibling of D-2; bundling the metadata-update fix is cheapest.

---

## 7. Open questions for founder

These ambiguities materially affect Phase 1 wrap framing and Phase 2 sprint
sequencing. Founder decision recommended before any track ships.

### Q-1 — Phase 1 wrap definition: include duel or not?
The 6 games ship duel routes as ComingSoon stubs. The metadata describes
duels. The pitch traditionally leans into "skill duels". Three honest options:

  (a) **Declare Phase 1 wrap as solo-only**, treat duel reactivation as Phase 2 first sprint, update OG metadata + apex landing to match.
  (b) **Hold Phase 1 wrap declaration** until duel is reactivated for at least 1 game (4-6 weeks?), keep current metadata.
  (c) **Ship a minimal duel** (e.g., async-asymmetric, no real-time matchmaking) inside Phase 1 wrap, narrow the scope of "duel" to what's actually buildable in 1-2 sprints.

R1 is read-only; this is a sequencing call.

### Q-2 — Cron cadence: hourly or daily?
The UI promises hourly tournament cycles; the cron runs daily. Which is
correct for Phase 1 wrap? Hourly cadence multiplies Vercel cron + RPC
spend ~24×; daily cadence is the conservative posture. Decide and align
copy + cron.

### Q-3 — Cross-game tournament browser in game apps
Today, a player on `wordle.skillos.games/tournament` cannot see `clicker`'s
tournament without manually navigating to a different subdomain. The
sponsor app aggregates cross-game; the game apps do not. Is a cross-game
tournament list a Phase 1 wrap requirement or Phase 2 polish?

### Q-4 — Agent surface visibility
No app exposes ERC-8004 agent IDs, agent profiles, or an agent leaderboard.
Per invariant 3 (agent = class, not feature flag), this is consistent. But
if pitch material claims "an agent showcase" or "watch agents compete,"
that surface needs to be built. Confirm whether agent visibility is in
Phase 1 wrap scope.

### Q-5 — Identity richness
No display name, avatar, bio, or social-handle UI exists. Phase 5
substrate-intelligence narrative could lean on rich identity. Is
identity-richness Phase 5 work that we defer, or Phase 2 polish that
unblocks growth-loop sharing? (If a player shares their profile and it's
just `0x123… L4 SP 2410`, viral coefficient is low.)

### Q-6 — `apps/orchestrator/api/cron/reconcile-duels` is dormant
The route exists, the cron is scheduled (`13 1 * * *`), but the underlying
duel system is `DuelComingSoon`. Today it runs and reconciles nothing.
Two options: (a) disable the cron until duel reactivation; (b) leave it
in place as a no-op. (a) saves Vercel cron invocations; (b) keeps the
schedule alive against the day duel reactivates. Cheap, but worth a
founder call.

### Q-7 — `agent-runner` and `app/api/duel/*` paths are scope-overlap
`apps/agent-runner` is a CLI for agent participation; `apps/*/src/app/api/duel/*` BFF routes scaffold for a duel system not yet built. When duel reactivates, do agent submissions flow through the per-game BFF (`/api/duel/queue`) or through the API service (`/v1/agents/matches/start-solo`)? Today only the API path is live. Confirm whether the BFF duel routes are intended targets or vestigial.

### Q-8 — apex `/watch` as the only Phase 5 substrate showcase
apex `/watch` is currently the **only** user-reachable surface that shows raw substrate data (moves, scores, attempts). If Phase 5 needs a "see the substrate" public artifact, is `/watch` the seed we build out, or do we add a substrate-explorer to the game apps / sponsor / a new app?

---

## Appendix A — Source-of-truth commands used

```
git -C /Users/inancayvaz/MAS-cr1-r1 log -1 --oneline   # base = origin/main
ls apps/                                                 # 10 dirs
vercel project ls --scope simpl3s-projects               # 12 projects (10 SkillOS-related + simpl3 + node_modules)
vercel ls --scope simpl3s-projects                       # last 2h prod deploys for all 8 SkillOS Vercel projects
find apps/*/src/app -name 'page.tsx' -o -name 'route.ts' # full route enumeration per app
grep -rln 'DuelComingSoon' apps/*/src                    # 18 stubbed duel pages (3 per game × 6)
grep -rln 'TODO\|FIXME\|STUB\|XXX' apps/*/src            # 1 marker total (in apps/api)
cat apps/orchestrator/vercel.json                        # cron schedule = all daily
curl -sS https://api.skillos.network/v1/health           # version 0.1.0, base-sepolia, chainId 84532
curl -sS https://api.skillos.network/openapi.json        # 16 paths
curl -sS https://2048.skillos.games/api/tournaments      # live tournament data
curl -sS https://sponsor.skillos.games/api/sponsor/tournaments  # cross-game list
vercel inspect skillos.network --scope simpl3s-projects  # apex aliases incl. legacy skillbase.games
```

## Appendix B — What R1 did NOT cover (handoff to other tracks)

- **R2 (packages/developer surface):** per-game `src/lib/<game>/` divergence, `@skillos/sdk` API completeness, `@skillos/ui` exhaustive surface, package versioning and consumer compatibility.
- **R3 (contracts/infra):** ChallengeEscrow + TournamentPool + AgentRegistry deploy state, trustedSigner / feeVault rotation, dual-profile Foundry config, X19a-X19c work.
- **R4 (schema/tests):** Supabase migration ordering, `payment_attempts` rename PR status (D-5), `v2_*` table semantics, test coverage map.

End of R1.
