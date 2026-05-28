# P2M-0 — Phase 2 Migration Recon: Gap Matrix (v1.12)

**Sprint:** P2M-0 (read-only recon) · **Date:** 2026-05-28 · **Branch:** `claude/elated-mclaren-5d2435` (worktree)
**Status:** RECON COMPLETE — no code/schema/route changes made. Founder reviews → locks Arena config SPEC before any build dispatch (A/B/C/D/E).

## Provenance & method

Four parallel surface-scan subagents (contracts / DB / API / SDK-MCP) + cross-surface reconcile.
Every claim below is tagged with the surface(s) that verify it. `skillos-architecture-planning.md`
("last verified May 10", lives in claude.ai project memory, **not on disk**) was treated as
hypothesis; where repo reality contradicts the v1.12 targets stated in the sprint brief, it is
called out under **Drift flags**. ≥2-surface triangulation applied; the two genuine cross-surface
disagreements were resolved by direct grep (see Reconcile notes).

Surfaces: **C** = contracts (Foundry) · **D** = Supabase migrations · **A** = API/routes · **S** = SDK/MCP/replay.

## Deployed on-chain reality (Base Sepolia, chainId 84532)

Confirmed from `contracts/deployments/sponsor-stack-base-sepolia.json` + env/source literals (no RPC calls made):

| Contract | Address | Source of truth | Note |
|---|---|---|---|
| TournamentPool **v2.1** | `0x52049b812780134d2F69D6c20C2ef881D49702da` | deploy artifact (C) + `TOURNAMENT_POOL_V21_ADDRESS` (A) | anchor confirmed; single `feeCollected` |
| TournamentPool **v2.2** | — (NOT deployed) | on-disk source only (C) | split fee buckets + bracket stub; **Phase 2 redeploy target** |
| ChallengeEscrow | `0x52e5E45456DeC882048b430a968Cda6061575be0` | `apps/api/src/lib/duel/runner.ts:64` + all 6 game `.env.local.example` | **LIVE**, env-injected; absent from sponsor-stack artifact but actively settling duels |
| SponsorshipModule | `0xD76670adB574A4C8D06dfF47127e7143d780ff87` | deploy artifact (C) | |
| SponsorReceiptSBT | `0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768` | deploy artifact (C) | ERC-5192 reuse pattern |
| MockSanctionsOracle | `0x0CB38F0A...` | deploy artifact (C) | only protocol-layer gate |
| DevAttributionNFT | — (NOT deployed) | on-disk source only (C) | rename target |
| ArcadePool | — (NOT deployed) | on-disk source only (C) | orphan / delete candidate |
| SkillbaseAnchor | — (not in this artifact) | on-disk source (C) | SP snapshot anchor |

**Reconcile note 1 (ChallengeEscrow):** Surface C reported "not in deployment artifact"; Surface A
reported the duel path actively settles on it. Both correct — it is deployed separately at
`0x52e5…575be0` (env-injected, hardcoded fallback in `runner.ts:64`), just not bundled in the
sponsor-stack JSON. **PvP deprecation impact is live, not theoretical.**

---

## Gap matrix — one row per v1.12 §10 delta

> Columns: **Current state** | **v1.12 target** | **Gap** | **Files touched** | **Blast radius** | **Dispatch-safety**
> Dispatch-safety = how risky a build sprint touching this is (LOW = isolated/additive · MED = multi-file or shared-package fan-out · HIGH = touches settle/sweepstakes/deployed-bytecode).

### Δ1 — Arena configurable object
- **Current:** No unified config object. Tournament config is scattered: `TournamentPool.Tournament` struct (C, `TournamentPool.sol:174-195`) + `v2_tournaments` columns (D) + per-route Zod schemas (A). Dimensions live implicitly (format via `entries.source`, fee via `paid_retries`/`fee_paid_usdc`).
- **v1.12 target:** Single Arena object with 8 dims: entry(free/fee) · prize(player-pool/sponsor/none) · format(PvP/Solo) · axes · data-tier · verification-family · resolution · data-rights.
- **Gap:** 6 of 8 dims net-new as first-class config; 2 partial (fee plumbing, format-via-source). No tournament-level config enum exists anywhere.
- **Files:** `TournamentPool.sol` struct + a new `v2_*` migration + `apps/api` schemas + `packages/sdk/api.gen.ts` regeneration.
- **Blast radius:** MED-HIGH (struct change → new bytecode → SDK regen → all 6 games + sponsor).
- **Dispatch-safety:** HIGH (struct change touches deployed bytecode path).

### Δ2 — Format: PvP = bracket-in-TournamentPool
- **Current:** `TournamentPool.startBracketRound(...)` is a **reverting stub** — `external pure { revert ReservedForV23(); }` (C, `TournamentPool.sol:990-998`). Only `BRACKET_ROUND_START_TYPEHASH` (`:275`) + calldata shape locked. **No TS bracket/round-advancement code** (A confirms zero functional `bracket`/`advanceRound` hits). **No bracket DB table** (D — X22 is code-only-claimed but on disk = nothing).
- **v1.12 target:** PvP runs as bracket inside TournamentPool.
- **Gap:** Entire bracket engine is net-new (contract body + TS round advancement + DB bracket/match table). The "X22 bracket round advancement" attributed to `packages/duel-backend` in CLAUDE.md does **not** exist on disk.
- **Files:** `TournamentPool.sol` (implement stub) + new migration (bracket/match table) + `packages/duel-backend` + cron settle.
- **Blast radius:** HIGH.
- **Dispatch-safety:** HIGH (settle path + new bytecode).

### Δ3 — Format: Solo = submitScore (stays)
- **Current:** Solo is live on **two** paths: (a) public `POST /v1/scores` SIWB-bearer + `POST /v1/agents/scores` SIWA, both signing `submitSoloScore` on TournamentPool v2.1, fire-and-forget (A, `scores.ts:138`, `agents.ts:40`); (b) per-game `packages/duel-backend/src/api/tournaments/solo.ts` with `evaluateF0Gate` acceptance (S/A).
- **v1.12 target:** Solo submitScore stays.
- **Gap:** Minimal — keep. But the **dual-path** must be acknowledged: the public API path has no plausibility gate; the duel-backend solo path does.
- **Files:** none required for the format itself.
- **Blast radius:** LOW.
- **Dispatch-safety:** LOW (keep-as-is, but anti-cheat removal in Δ5 touches path (b)).

### Δ4 — ChallengeEscrow deprecation
- **Current:** ChallengeEscrow is **deployed and live** (`0x52e5…575be0`), server-attested winner-takes-all 1v1 escrow. Off-chain blast radius ≈ **31 files** (C): entire `packages/duel-backend` (`handlers`, `settle`, `decide-winner`, `settle-guard`, `cron/reconcile-duels`), `packages/contracts/{abi,addresses,game-slug}`, `lib-shared/attestation`, `ui/api-client`, all 6 games' `game-slug.ts`, `apps/api/lib/contracts-vendored/*`, tests `ChallengeEscrow.t.sol` + `settle-guard.test.ts`.
- **v1.12 target:** Deprecate; PvP moves to TournamentPool bracket path (Δ2).
- **Gap:** Cannot remove until Δ2 ships — PvP would have no settlement venue. The `settle-guard` tripwire is wired to ChallengeEscrow.
- **Files:** see 31-file set above.
- **Blast radius:** HIGH (entire duel-backend + tripwire tests).
- **Dispatch-safety:** HIGH — **sequence after Δ2** (sweepstakes-safety: don't remove a live settle venue first).

### Δ5 — AntiCheat heuristic = DELETE
- **Current (multi-surface, reconciled):**
  - **On-chain:** `flagScore` (owner-only) + `excluded[id][player]` + `ScoreFlagged` event (C, `TournamentPool.sol:701-709`). **Load-bearing in `settle()`** via `_countNonExcluded` (`:724`) — exclusion set drives ranking-length validation.
  - **Off-chain gate:** `packages/anti-cheat` `plausibility()` → `evaluateF0Gate` at **one** production call site `packages/duel-backend/src/api/tournaments/solo.ts:436` (S). Already has a `moves=null` bypass.
  - **AI auditor:** `packages/ai-coach/src/anticheat/*` (Haiku) — fire-and-forget, **never blocks settle** (A, `settle.ts:136` `firePlausibilityCheckAsync` is `void`/`waitUntil`).
  - **Cron:** `flagScore` invoked from `cron/tournaments.ts:986`.
- **v1.12 target:** DELETE heuristic; deterministic-replay becomes the verification path.
- **Gap:** Deletion is multi-surface. On-chain removal of `flagScore`/`excluded` **requires reworking `settle()`'s count + ranking verification** (not a clean delete). **CRITICAL:** there is no deterministic-replay verifier to replace it with (see Δ6).
- **Files:** `TournamentPool.sol` (settle rework) + `packages/anti-cheat` (delete) + `solo.ts` (replace gate) + `ai-coach/anticheat` + cron + UI badges.
- **Blast radius:** HIGH.
- **Dispatch-safety:** HIGH — **blocked on Δ6** (don't delete the only gate before the replacement exists).

### Δ6 — Deterministic-replay = real verification path
- **Current (3-surface triangulation — strongest finding):** Replay is **ASSUMED, not real.**
  - Zero `seed` handling in any `.sol` (C); on-chain trust = server EIP-712 signature, never re-derives a score.
  - Only **one** game engine exists: `apps/api/src/lib/duel/game-2048.ts`, self-documented "replay verification (T2 tier, **post-Phase-2**)" (S). wordle/sudoku/minesweeper/clicker/match3 have **no** replay module.
  - The 2048 engine's only consumer is `runner.ts` agent **simulation** — **no call site verifies a submitted score** on settle/score-acceptance/SP paths (S).
  - `/v1/data/match-replay/:id` returns hash-derived `sampleData:true` **stubs** (A, `data.ts:96`); it does not re-execute moves.
- **v1.12 target:** Deterministic-replay is the verification family that supersedes the heuristic.
- **Gap:** Net-new for 6 games (engine + the on-chain/settle wiring + a real replay verifier behind the data endpoint). Seeds exist in DB (`v2_duels.seed`, `duel_runs.seed`, `solo_runs.game_state_hash` reserved) so the substrate is there, but nothing consumes them for verification.
- **Files:** new `apps/api/src/lib/duel/game-*.ts` (×5) + settle/score-acceptance wiring + `data.ts` real implementation.
- **Blast radius:** HIGH.
- **Dispatch-safety:** HIGH — **this is the biggest net-new design surface and the gating dependency for Δ5.**

### Δ7 — DevAttribution → ArenaCreator rename + fee-split
- **Current:** `DevAttributionNFT.sol` (soulbound, deterministic tokenId, mint-only-by-pool). Fee-split is **NOT in the NFT** — it lives in `TournamentPool.chargeEntryFee` via `DEV_BPS=7000`/`PLATFORM_BPS=3000` + `Tournament.devAddr` (C). NFT never deployed; ~16-file reference set, **all contract-layer** (no app/package refs).
- **v1.12 target:** Rename to ArenaCreator + retarget fee-split.
- **Gap:** Rename spans TWO surfaces: the NFT (`DevAttribution`→`ArenaCreator`, symbol `SBDEV`) AND TournamentPool's `devAddr`/`feeCollected_dev`/`withdrawFeesToDev` naming.
- **Files:** ~16 contract files (src + 7 tests + 2 deploy scripts + 2 audit docs) + `TournamentPool.sol`.
- **Blast radius:** LOW-MED (contract-layer-contained; no app/package fan-out).
- **Dispatch-safety:** MED (touches deployed v2.1 fee naming → coordinate with Δ1/Δ2 redeploy).

### Δ8 — Data-marketplace (x402 endpoints)
- **Current:** `GET /v1/data/match-replay/:id` (T2, $0.01) + `GET /v1/data/cohort-snapshot` (T3, $0.10), gated by global `@x402/hono` paymentMiddleware (A, `lib/x402.ts`). Both return `sampleData:true` **stubs**. MCP `fetch_match_replay`/`fetch_cohort_snapshot` consume them (S).
- **v1.12 target:** Migrate to real data-marketplace.
- **Gap:** Payment rail + route shape are done; the **data source is the Phase 2 work item** (depends on Δ6 replay being real for match-replay, and on consent/rights for cohort data — see Δ9).
- **Files:** `apps/api/src/routes/data.ts` + downstream MCP tools.
- **Blast radius:** MED (x402 route-order: `:id` param route vs static `cohort-snapshot` under `/v1/data/*`).
- **Dispatch-safety:** MED (additive; payment gating already live).

### Δ9 — Data-sovereignty / consent / data-rights
- **Current (D):** **Fully absent.** No table/column for ownership, consent, licensing, or opt-in/out. RLS is enabled on every table but **uniformly public-read/service-write or deny-all — no per-wallet row policies.** SP snapshots (`v2_sp_snapshots.canonical_json`, "public read for AI lab verification") flow with **no consent gate**.
- **v1.12 target:** data-rights as an Arena dimension + sovereignty.
- **Gap:** Net-new with zero scaffold. Likely Phase 2 RLS hardening surface (per-wallet policies).
- **Files:** new migration(s) + RLS policy rework + `apps/api` data routes.
- **Blast radius:** MED.
- **Dispatch-safety:** MED (additive schema; RLS changes need care).

### Δ10 — NFT / Pixie / Auction / Vault / burn-to-enter residue
- **Current (C):** **CLEAN — no residue.** Only the two expected soulbound NFTs. ERC1155/GameItems/Auction hits are vendored OZ/forge-std mocks in `contracts/lib/`; "pixie" is a Wordle dictionary word; "Vault" is only `feeVault` in ChallengeEscrow.
- **v1.12 target:** dropped (should not exist).
- **Gap:** None.
- **Dispatch-safety:** N/A (nothing to remove).

### Δ11 — Staked-resolution
- **Current (S):** **No dispute-stake / slashing / on-chain adjudication exists.** ChallengeEscrow is server-attested winner-takes-all, not adjudicated-dispute-with-stake.
- **v1.12 target:** NET-NEW.
- **Gap:** Confirmed net-new, no scaffold.
- **Dispatch-safety:** HIGH (new design surface; on-chain value-at-stake).

---

## Arena config object — proposed landing points

The 8 dimensions and where each plugs into the existing struct / schema / API:

| Dimension | Current state (surface) | Proposed landing |
|---|---|---|
| entry: free/fee | Partial — fee tracked post-hoc (`entries.paid_retries_count`/`total_fee_paid_usdc`, `solo_runs.is_paid_retry`, `x15_payment_attempts`); no config flag (D) | New enum on `Tournament` struct + `v2_tournaments` + Zod |
| prize: player-pool/sponsor/none | Partial — `prize_pool_usdc` + `sponsor_address` always present; no discriminator (D) | New enum; segregation already enforced by 3 disjoint slots in v2.2 (C) |
| format: PvP/Solo | Implicit via `entries.source`/`duel_runs.mode` (D); no tournament-level flag | New enum on struct + table; drives Δ2/Δ3 routing |
| axes (skill axes) | None (D) | Net-new column/table |
| data-tier | SP-tier in `sp-engine` code only, not a column (D/S) | Net-new column |
| verification family | Seeds exist (`v2_duels.seed`, `duel_runs.seed`, `solo_runs.game_state_hash` reserved); no enum (D) | New enum; depends on Δ6 to be meaningful |
| resolution | Settle fields exist (`settled_at`, statuses, `duel_runs.end_reason`); no policy config (D) | New config column |
| data-rights | None (D) | Net-new (Δ9) |

**Struct landing:** `TournamentPool.Tournament` (`TournamentPool.sol:174-195`) is the on-chain anchor — extending it = new bytecode (v2.2→v2.3 redeploy). DB landing: a single forward migration adding the config enums to `v2_tournaments`. API landing: route Zod schemas + regenerate `packages/sdk/src/api.gen.ts` (codegen from live Hono OpenAPI via `emit-openapi.ts`; CI drift guard at `.github/workflows/codegen-drift-check.yml`).

---

## Format mapping (Solo vs PvP) + deprecation

| Path | Today | Maps to |
|---|---|---|
| Solo | `POST /v1/scores` (SIWB) + `POST /v1/agents/scores` (SIWA) → `submitSoloScore` on TournamentPool v2.1 (A) | **Solo (submitScore) — stays** |
| Solo (per-game gate) | `duel-backend/.../solo.ts` `evaluateF0Gate` (S) | Solo — keep route, **remove F0 gate in Δ5** |
| PvP | `packages/duel-backend` `triggerSettle`/`checkAndTriggerWalkover` on **live ChallengeEscrow** (A) | **PvP → bracket-in-TournamentPool (Δ2)** |
| PvP bracket venue | `TournamentPool.startBracketRound` reverts `ReservedForV23()` (C) | Δ2 build target |

**ChallengeEscrow deprecation impact:** live contract + 31-file off-chain footprint incl. the `settle-guard` sweepstakes tripwire. **Must not be removed before Δ2 provides the replacement settle venue.**

---

## Drift flags (current-state surprises vs brief / CLAUDE.md / architecture-planning.md)

1. **`game-2048.ts:8-13` self-documents "replay verification (T2 tier, post-Phase-2)"** — repo author already knew replay is unbuilt. Contradicts any v1.12 framing that treats deterministic-replay as the *current* verification path. **It is not. (3-surface confirmed.)**
2. **CLAUDE.md claims `packages/duel-backend` does "bracket round advancement (X22)"** — no functional bracket/round-advancement code exists on disk; bracket is a reverting stub (C) with no DB table (D). CLAUDE.md `docs/sprints/` lists no X22 sprint either. Stale claim.
3. **TournamentPool on disk = v2.2 (split fee buckets + bracket stub), deployed = v2.1.** Phase 2 requires a redeploy; the sweepstakes 3-slot segregation only exists in the *undeployed* v2.2 source.
4. **ChallengeEscrow live but absent from the deploy artifact** — operational state diverges from the committed `sponsor-stack-base-sepolia.json`; future ops should not assume the JSON is the full deployed set.
5. **`evaluateF0Gate` already has a `moves=null` bypass** (`solo.ts:435-436`) — the heuristic gate is partially defeatable today, reinforcing the case to replace (not patch) it.
6. **SDK mainnet addresses = `null` → `getChainAddresses('mainnet')` throws** (`packages/sdk/src/contracts.ts:29-35`) — hard Phase 2 mainnet blocker.
7. **SDK `AgentScoreSubmitInput` is missing the API-required `game` field** (`agent.ts:64-70`); MCP `submit_score` inlines `game` to route around it (S). Latent SDK/API divergence — fix when regenerating for Δ1.
8. **`ArcadePool.sol`** — orphan `^0.8.24` prototype (older than the 0.8.26 pin), zero references, superseded by TournamentPool. Single-surface finding; recommend founder confirm delete.

---

## Probe findings (reconciled, honest)

- **Skill-purity (seed / replay built vs assumed):** seed handling is **100% off-chain** (`lib-shared/src/seed.ts`, carried on Duel type); **zero seed logic in Solidity.** Seed-equalization + deterministic replay are **assumed**, not enforced on the trust path. (C+S)
- **AntiCheat path to delete:** on-chain `flagScore`/`excluded`/`ScoreFlagged` (load-bearing in `settle` via `_countNonExcluded`) + `packages/anti-cheat` `plausibility()` at `solo.ts:436` `evaluateF0Gate` + `ai-coach/anticheat` (fire-and-forget) + cron `flagScore`. Heuristic confirmed; **deterministic-replay does not yet exist to supersede it.** (C+A+S)
- **Replay-engine wiring state:** 2048-only, scaffold, **no verification call site**; 5 other games have no engine; data endpoint returns stubs. (C+A+S, 3-surface)
- **NFT/Pixie residue:** **none.** Clean. (C)
- **Staked-resolution:** **net-new, no scaffold.** (C+S)
- **Data-sovereignty/consent:** **net-new, no scaffold;** RLS uniform, no per-wallet policies. (D)

---

## Gate

Read-only recon complete. **No contract, schema, or route was edited; no code PR opened.** This artifact
is recon + SPEC input only. Per the sprint gate: **STOP + report.** Founder reviews, then locks the
Arena config SPEC before any build dispatch (A/B/C/D/E).

**Recommended sequencing implied by dependencies (for SPEC, not yet decided):** Δ6 (replay) → Δ5
(anti-cheat delete) and Δ2 (bracket) → Δ4 (ChallengeEscrow deprecation); Δ1 (Arena struct) gates the
v2.2→v2.3 redeploy that Δ2/Δ7 also need. Δ8/Δ9/Δ10/Δ11 are comparatively isolated/additive.
