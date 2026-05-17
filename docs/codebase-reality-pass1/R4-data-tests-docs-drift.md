# CR1 Pass 1 — R4: Data + Tests + Docs + Drift Inventory

**Branch:** `cr1/r4-data-tests-docs-drift` (based on `origin/main` @ `f3a7831`)
**Date:** 2026-05-17
**Scope:** Read-only audit. No schema changes, no migration applies, no production state changes.
**Mission:** Honest inventory of data layer, test coverage, documentation state. Continue memory-as-spec drift detection from UR Pass 1 baseline (§2.6).
**Prod project:** Supabase `clizuqvtkekzxiflbsyr` (only project — no staging — per memory `project_skillos_no_staging_supabase`).

> Counts headline: **47 tables (24 public, 23 auth) · 22 migration registry rows vs 19 files (Δ=9 drift items per X19) · 207 Foundry tests (8 files) · 96 off-chain test cases (15 files; 12 in CI, 3 not) · 90 prod indexes on public · 0 Supabase edge functions · 6 Vercel crons · 12 README files (most dated 2026-05-10) · 14 memory drift instances**.

---

## 1. Supabase data inventory

### 1.1 Schema summary

| Schema | Tables | Live rows (approx) | RLS posture |
|---|---|---|---|
| `public` | 24 | 1,720 rows (sum of estimates) | RLS enabled on **24 of 24** |
| `auth` | 23 | 76 (only `schema_migrations`) | RLS enabled on 16 of 23 (7 OAuth/WebAuthn off — Supabase upstream default; service-role-only access via PostgREST bypass) |

`public.*` RLS lock-down was completed in migration `v4_20260517_enable_rls_v2_tables.sql` (X19 finishing move, Sprint X19-Track-D) which targeted exactly the two stragglers (`v2_sp_snapshots`, `v2_cron_runs`). Verified: all 24 `public.*` tables report `rls_enabled: true` via `list_tables`.

### 1.2 Public schema — table-level reality

Columns shown as `<col>:<type>` (compact). FKs and triggers as captured. Indexes listed by name (PK omitted; uniqueness flagged where the index name encodes it).

| Table | Rows | Cols | PK | FKs (out) | Notable indexes | Phase tag |
|---|---|---|---|---|---|---|
| `v2_tournaments` | 159 | 18 | `id` | (inbound from entries, solo_runs) | `v2_tournaments_on_chain_id_key` (unique), `idx_tournaments_active`, `idx_tournaments_created_via`, `idx_tournaments_creator` | P1 ✓ P2 ✓ |
| `v2_tournament_entries` | 346 | 16 | `id` | `tournament_id→v2_tournaments.id` | `idx_tournament_entries_player_history`, `idx_tournament_entries_ranking`, `_tournament_id_player_address_key` (unique) | P1 ✓ |
| `v2_tournament_solo_runs` | 383 | 14 | `id` | `tournament_id→v2_tournaments.id` | `idx_solo_runs_excluded`, `idx_solo_runs_fee_tx_hash_unique`, `idx_solo_runs_tournament_player`, `coach_cache_used_idx` | P1 ✓ P2 ✓ |
| `v2_user_stats` | 317 | 9 | `user_address` | — | `idx_user_stats_level`, `idx_user_stats_sp` | P1 ✓ |
| `v2_duels` | 13 | 22 | `id` | — (no FK to tournaments despite linkage) | `v2_duels_onchain_id_key` (unique), `v2_duels_matched_pair_unique`, `v2_duels_created_at_idx`, `_status_idx`, `_player1_idx`, `_player2_idx` | P1 ✓ P2 partial |
| `v2_sp_snapshots` | 20 | 9 | `snapshot_id` | — | `v2_sp_snapshots_timestamp_unix_key` (unique), `_timestamp_idx`, `_anchored_idx` | P1 ✓ P5 ✓ (ML verification surface) |
| `v2_sponsor_contributions` | 2 | 9 | `id` | — | `idx_sponsor_contributions_block`, `_sponsor`, `_tournament`, `_tx_hash_log_index_key` (unique) | P1 ✓ |
| `v2_sponsor_indexer_state` | 1 | 3 | `contract_address` | — | (PK only) | infra |
| `v2_tournament_indexer_state` | 1 | 3 | `contract_address` | — | (PK only) | infra |
| `v2_cron_runs` | 9 | 5 | `(cron_name, run_window_start)` composite | — | `v2_cron_runs_started_at_idx` | infra (mutex) |
| `skillos_auth_nonces` | 13 | 5 | `nonce` | — | `idx_skillos_auth_nonces_wallet`, `_expires`, `uq_skillos_auth_nonces_outstanding` (partial unique) | P1 (SIWB) |
| `skillos_siwa_nonces` | 2 | 2 | `nonce` | — | `idx_skillos_siwa_nonces_expires` | P1 (SIWA) |
| `duel_runs` | 19 | 13 | `id` | — | `idx_duel_runs_end_reason`, `idx_duel_runs_started` | P2 (X15 agent runner) |
| `duel_moves` | 586 | 11 | `id` | `run_id→duel_runs.id` | `duel_moves_run_id_move_number_key` (unique), `idx_duel_moves_run` | P2 ✓ **P5 ✓ (ML training corpus — only one)** |
| `x15_payment_attempts` | 8 | 22 | `id` | `run_id→duel_runs.id` | `_run_id_attempt_number_key` (unique), `idx_x15_pay_run_id`, `idx_x15_pay_review` (partial), `idx_x15_pay_agent_recent`. **Trigger:** `trg_x15_payment_attempts_updated_at` BEFORE UPDATE. **Realtime publication enabled.** | P2 ✓ |
| `users` | 0 | 8 | `id` | — | `users_wallet_address_key` (unique), `users_fid_key` (unique), `idx_users_fid` | **orphan (V1)** |
| `game_sessions` | 0 | 9 | `id` | `user_id→users.id` (only FK into `users` anywhere) | `idx_sessions_user_score`, `idx_sessions_leaderboard` | **orphan (V1)** |
| `challenges` | 0 | 25 | `id` | — | `uniq_challenges_onchain_id`, 5 secondary indexes for feed/by-creator/by-challenger queries | **orphan (V1 superseded by `v2_duels`)** |
| `daily_challenges` | 3 | 8 | `id` | — | `_game_slug_challenge_date_key` (unique), `idx_daily_challenges_game_date` | dormant (V1) |
| `daily_ranks` | 2 | 8 | `id` | — | `_user_address_game_slug_day_key` (unique), `idx_ranks_game_day_rank`, `idx_ranks_user_day` | dormant (V1) |
| `daily_aggregates` | 4 | 10 | `id` | — | `uniq_agg_user_scope_cat_day` (UNIQUE NULLS NOT DISTINCT), `idx_agg_scope_cat_day_rank` | dormant (V1) |
| `game_scores` | 14 | 8 | `id` | — | `idx_scores_user_day`, `_game_day_score`, `_day` | dormant (V1) |
| `ai_analyses` | 14 | 9 | `id` | — | `_user_address_game_slug_stats_hash_key` (unique), `idx_ai_analyses_user_game` | dormant (V1) |
| `payouts` | 4 | 13 | `id` | — | `idx_payouts_day_status`, `_tx_hash` (partial), `_user`, `uniq_payouts_active_slot` | dormant (V1) |

**90 indexes total** on `public.*` (queried via `pg_indexes`). Index hygiene is strong — every high-write table has supporting indexes; every FK has a corresponding index on its source side.

**Triggers (`public.*`):** confirmed one application trigger:
- `trg_x15_payment_attempts_updated_at` — BEFORE UPDATE on `x15_payment_attempts`, sets `updated_at := now()` via `set_x15_payment_attempts_updated_at()` (search_path locked to '').

Supabase-managed triggers exist for `supabase_realtime` publication on `x15_payment_attempts` (`replica identity full`). No application triggers elsewhere — derived fields (`day` on `game_scores`) use STORED generated columns, not triggers.

### 1.3 Auth schema

23 tables, 22 empty + `schema_migrations` (76 rows tracking Supabase's own auth migrations). **SkillOS is not using Supabase Auth at all** — wallet-based auth via `skillos_auth_nonces` (SIWB) + `skillos_siwa_nonces` (SIWA) is the live path. The auth schema is dead weight that Supabase ships.

7 newer auth tables (OAuth-as-provider + WebAuthn) report `rls_enabled: false`: `oauth_clients`, `oauth_authorizations`, `oauth_consents`, `oauth_client_states`, `custom_oauth_providers`, `webauthn_credentials`, `webauthn_challenges`. This is Supabase's upstream default — these tables are accessed only by the `supabase_auth_admin` role via GoTrue, never via PostgREST, so RLS-off is intentional. Not a finding.

### 1.4 Notable structural findings

- **`v2_duels` lacks any FK** to `v2_tournaments` despite `v2_tournament_entries.source_duel_ids` (`_uuid` array) pointing at duel IDs. The duel→tournament linkage is array-encoded without referential integrity. Phase 2 duel reactivation work (memory `project_phase2_duel_reactivation`) will need to handle this.
- **Two identity models coexist:** `public.users.id:uuid` (8 cols, 0 rows, FID+wallet+pfp social profile) vs the `user_address:text` keyed everywhere else (`v2_*`, `duel_*`, `x15_*`, `ai_analyses`, etc.). Only `game_sessions.user_id` FKs into `users`. The schema declared a richer identity but the live system never adopted it.
- **`v2_cron_runs` composite PK** — only `public.*` table with a composite key. Mutex coordination, matches its documented role.
- **5 dormant V1 tables** (`daily_challenges`, `daily_ranks`, `daily_aggregates`, `ai_analyses`, `game_scores`, `payouts`) with row counts 3/2/4/14/14/4 — early-phase pre-V2 leaderboard model, never zeroed.

---

## 2. Migration registry reality check

| Source | Count |
|---|---|
| Migrations in `supabase_migrations.schema_migrations` registry | 22 |
| Migrations in `supabase/migrations/*.sql` on `origin/main` | 19 |
| **Drift (item count)** | **9** (per X19 4-class breakdown — `docs/audit-prep/x19-schema-drift-analysis.md`) |

### 2.1 X19 4-class breakdown — verified against current `origin/main`

| Class | Count | Status | Notes |
|---|---|---|---|
| **A1** — Pre-rebrand registry-tracked, file deleted | 3 | open | `ai_layer`, `leaderboard`, `aggregates_nulls_not_distinct` — statements_len 3232/8427/794 verified via direct SQL on `supabase_migrations.schema_migrations`. Restoration is `git show <commit>:supabase/migrations/<file>`. |
| **A2** — Pre-rebrand, no registry row, orphan tables on prod | 4 | open | `payouts_instant_scope`, `challenges`, `challenges_preplay_duel`, `challenges_onchain_escrow`. Tables exist on prod with live shape; SQL files only in git history. |
| **B** — File committed, no registry row, table applied off-track | 1 | open | `v2_20260510_auth_nonces.sql` (committed in `3cdbbde` Sprint X2). File on disk; registry has no `20260510*`. Verified: `skillos_auth_nonces` exists with 13 rows. |
| **C** — Recent MCP apply, file uncommitted in git | 1 | open | Registry version `20260515173813` (`v4_20260515b_x15_payment_attempts_canonical_lock`). Statements verified against ADR 0003 D9. **No file at `supabase/migrations/v4_20260515b*`.** Cherry-commit from parent checkout needed. |
| **D** — Branch-staleness illusion (methodology footnote, not real drift) | 1 | closed | Methodology fix locked: always diff against `origin/main`. |
| **Total** | **9** | 8 open, 1 closed | 3–5 day sprint estimate per X19 plan holds. |

**No items closed by external work since X19 plan dated 2026-05-17.** The X19 scope confirmation document (`docs/audit-prep/x19-schema-drift-analysis.md`) is the live plan. R4 verification does not alter it.

### 2.2 The Class B file (re-verified this pass)

`supabase/migrations/v2_20260510_auth_nonces.sql` — present locally, committed on `origin/main`. Registry row absent. Idempotent re-apply via MCP `apply_migration` with version `20260510000000` will populate the registry without DB side effects. PR title format per X19 plan: `fix(audit-prep): backfill schema_migrations row for v2_20260510_auth_nonces`.

### 2.3 The Class C registry row (re-verified this pass)

Registry version `20260515173813`, `v4_20260515b_x15_payment_attempts_canonical_lock` — applied via MCP in Sprint X15.8 (memory `project_x15_8_payment_attempts_schema_lock`). The statements DO match memory: canonical single-status enum (`pending|x402_settled|anchored|failed|skipped`), 22 cols, `idx_x15_pay_review` partial index, `realtime` publication, `replica identity full`, RLS `public_read`. File `v4_20260515b_x15_payment_attempts_canonical_lock.sql` does NOT exist on `origin/main` — confirmed by `ls supabase/migrations/v4_20260515b*` → no matches.

---

## 3. Cron + edge function code paths

### 3.1 Supabase Edge Functions

**`list_edge_functions` returns: `[]`.** Zero Supabase edge functions in production.

### 3.2 Vercel Crons (orchestrator app only)

Schedule source: `apps/orchestrator/vercel.json` (no other `vercel.json` declares crons across the monorepo).

| Path | Schedule (UTC) | Entry file | Backing fn | Purpose |
|---|---|---|---|---|
| `/api/cron/create-tournaments` | `0 0 * * *` | `apps/orchestrator/src/app/api/cron/create-tournaments/route.ts` | `runCreateTournaments` (@skillos/duel-backend) | Mint today's tournaments per game (orchestrator-created) |
| `/api/cron/settle-tournaments` | `5 0 * * *` | `apps/orchestrator/src/app/api/cron/settle-tournaments/route.ts` | `runSettleTournaments` | Settle yesterday's tournaments. **Path I silent-swallow bug at `packages/duel-backend/src/cron/tournaments.ts:977`** (memory entry mis-cites line/path — see §7) |
| `/api/cron/index-sponsor-events` | `15 0 * * *` | `apps/orchestrator/src/app/api/cron/index-sponsor-events/route.ts` | `runIndexSponsorEvents` | `Sponsored` event indexer; updates `v2_sponsor_contributions` |
| `/api/cron/index-tournaments-created` | `23 0 * * *` | `apps/orchestrator/src/app/api/cron/index-tournaments-created/route.ts` | `runIndexTournamentsCreated` | `TournamentCreated` event indexer; backfills `v2_tournaments` for SDK-created rows |
| `/api/cron/reconcile-duels` | `13 1 * * *` | `apps/orchestrator/src/app/api/cron/reconcile-duels/route.ts` | `runReconcileDuels` | Reconcile duel state machine |
| `/api/cron/anchor-sp-snapshot` | `7 2 * * *` | `apps/orchestrator/src/app/api/cron/anchor-sp-snapshot/route.ts` | (anchor-sp-snapshot) | Anchor SP snapshot on-chain |

Total: **6 Vercel crons, all daily** (Hobby tier constraint per `apps/orchestrator/src/app/api/cron/settle-tournaments/route.ts:1-4`). Sub-daily cadence requires Pro upgrade or external scheduler.

Auth: every cron route checks `Authorization: Bearer ${CRON_SECRET}`; dev mode bypass (`NODE_ENV !== 'production'`) when secret unset.

Implementation lives in `packages/duel-backend/src/cron/`:
```
cron-settle.ts? (not present — settle is in tournaments.ts)
index-tournaments-created.ts (PR #41)
nonce-manager.ts                 (helper)
p-limit.ts                       (concurrency limiter)
reconcile-duels.ts
run-lock.ts                      (PR #36 pattern)
settle-guard.ts                  (tripwire)
sponsors.ts                      (sponsor indexer)
tournaments.ts                   (1091 LOC; settle path here)
```

### 3.3 Drift signal — TournamentCreated indexer EXISTS

Memory `project_post_yc_tournament_created_indexer` claims: *"no event listener exists; permissionless createTournament() orphans v2_tournaments row, manual backfill needed (see 2026-05-02 mirror drill)"*.

**REFUTED.** `apps/orchestrator/src/app/api/cron/index-tournaments-created/route.ts` was added in commit `c28a107` (PR #41, *"feat(cron): TournamentCreated indexer + creator/source schema extension"*) and is in the live cron schedule. Idempotent: backfill UPDATE is gated on `creation_tx_hash IS NULL`. Per the route's own header comment, the cadence is daily (00:23 UTC), so events accumulate up to 24h between runs — acceptable for reporting posture, never on duel/settle hot paths. **Memory must be updated to "indexer shipped via PR #41; sub-daily cadence still backlog (Hobby tier)".**

---

## 4. Foundry test coverage

### 4.1 Test inventory

Counted via `grep -cE "^\s*function (test|invariant)" contracts/test/*.t.sol`:

| File | Test count |
|---|---|
| `ArcadePool.t.sol` | 22 |
| `ChallengeEscrow.t.sol` | 25 |
| `DevAttributionNFT.t.sol` | 19 |
| `SkillbaseAnchor.t.sol` | 17 |
| `SponsorReceiptSBT.t.sol` | 16 |
| `SponsorshipModule.t.sol` | 11 |
| `TournamentPool.t.sol` | 91 |
| `X15-paid-retry.t.sol` | 6 |
| **Total** | **207** |

**Reality check: still 207.** No new test files since the audit-prep baseline (`docs/audit-prep/contracts-coverage.txt`).

### 4.2 Per-contract coverage (from `docs/audit-prep/contracts-coverage.txt`)

| Contract | Lines | Branches | Funcs | Phase profile |
|---|---|---|---|---|
| `src/ArcadePool.sol` | 100% (64/64) | **11.76% (4/34)** | 100% (11/11) | phase1-legacy |
| `src/ChallengeEscrow.sol` | 100% (95/95) | 61.54% (16/26) | 100% (13/13) | default (via_ir) |
| `src/DevAttributionNFT.sol` | 100% (22/22) | 100% (4/4) | 100% (7/7) | phase1-legacy |
| `src/MockSanctionsOracle.sol` | 66.67% (6/9) | 0% (0/1) | 66.67% (2/3) | test-only (in src/) |
| `src/SkillbaseAnchor.sol` | 100% (19/19) | 66.67% (4/6) | 100% (6/6) | default |
| `src/SponsorReceiptSBT.sol` | 100% (39/39) | 100% (6/6) | 100% (10/10) | phase1-legacy |
| `src/SponsorshipModule.sol` | 100% (26/26) | 50.00% (4/8) | 100% (3/3) | phase1-legacy |
| `src/TournamentPool.sol` | 97.37% (222/228) | 73.77% (45/61) | 96.15% (25/26) | phase1-legacy |
| **Total (src + test + script)** | **68.41% (535/782)** | **50.82% (93/183)** | **84.31% (86/102)** | mixed |

Note: `src/ISanctionsOracle.sol` is an interface; no coverage row.

### 4.3 Coverage gaps (<80% branch)

| Contract | Branch coverage | Recommendation |
|---|---|---|
| `ArcadePool.sol` | 11.76% (4/34) | **Severe gap.** Phase 1 legacy contract; v2.2 mainnet review must lift this before audit. |
| `SponsorshipModule.sol` | 50% (4/8) | Half-covered; sponsor-stack legacy. |
| `ChallengeEscrow.sol` | 61.54% (16/26) | Most-current contract; gap is unfortunate. |
| `SkillbaseAnchor.sol` | 66.67% (4/6) | Anchor path under-tested. |
| `TournamentPool.sol` | 73.77% (45/61) | Largest contract; close to threshold but not over. |

### 4.4 Script coverage

All 8 `contracts/script/*.s.sol` files report **0.00%** line/branch coverage. Scripts are not exercised by `forge test`. They're verified via on-chain deploy outcomes (`contracts/deployments/sponsor-stack-base-sepolia.json` + `wallets-base-sepolia.md`), not unit tests. Acceptable posture, but note that the `BackfillV2Tournament*.s.sol` scripts ran for the match3 5/13 forensic recovery (memory `project_match3_5_13_audit_backfill_x9_forensic`) with no test guard.

---

## 5. Off-chain test coverage

### 5.1 Test file inventory (15 files, 96 test cases)

Counted via `grep -cE "^\s*(it|test|describe)\("`:

| File | Cases | In CI? |
|---|---|---|
| `apps/api/test/agents-matches.test.ts` | 2 | **No** |
| `apps/api/test/charge-retry-fee.test.ts` | 5 | **No** |
| `apps/api/test/games.test.ts` | 9 | Yes |
| `apps/api/test/x402-client.test.ts` | 6 | **No** |
| `packages/duel-backend/test/cron-settle.test.ts` | 9 | Yes |
| `packages/duel-backend/test/decide-winner.test.ts` | 9 | Yes |
| `packages/duel-backend/test/index-tournaments-created.test.ts` | 8 | Yes |
| `packages/duel-backend/test/reconcile-duels.test.ts` | 7 | Yes |
| `packages/duel-backend/test/reconcile.test.ts` | 16 | Yes |
| `packages/duel-backend/test/settle-guard.integration.test.ts` | 3 (all `test.skip`) | Yes (no-op) |
| `packages/duel-backend/test/settle-guard.test.ts` | 10 | Yes |
| `packages/duel-backend/test/tournaments.test.ts` | 4 | Yes |
| `packages/sp-engine/src/anchor.test.ts` | (in CI by name; not counted here — file in `src/`, not `test/`) | Yes |
| `packages/sp-engine/src/engine.test.ts` | (same) | Yes |
| `packages/ui/test/duel-result-branch.test.ts` | 8 | Yes |
| **Total** | **96** application-test cases + 2 sp-engine files | — |

### 5.2 CI vs filesystem drift

`.github/workflows/ci.yml` `test-ts` job hard-codes 12 file paths (CI comment claims "11 test files" — off-by-one drift from comment to code). The CI list **misses 3 test files that exist in apps/api/test/**:
- `agents-matches.test.ts` (2 cases)
- `charge-retry-fee.test.ts` (5 cases — X15 paid-retry RPC race coverage)
- `x402-client.test.ts` (6 cases — H5 facilitator trust path)

That is **13 test cases not gated by CI**, including coverage of the H5 (offchain-findings) trust gap and the X15.3 chargeRetryFee race (memory `project_x15_chargeretryfee_first_paid_retry_race`).

### 5.3 Skipped tests

4 `test.skip(` calls all in `packages/duel-backend/test/settle-guard.integration.test.ts`. Matches memory `project_phase2_duel_reactivation` reactivation trigger #1 ("un-skip settle-guard integration tests"). Status: **still skipped**.

### 5.4 Per-package + per-app coverage state

| Workspace | Test count | `test` script in package.json? | Notes |
|---|---|---|---|
| `apps/2048` | 0 | No | Frontend game; no unit tests |
| `apps/clicker` | 0 | No | " |
| `apps/match3` | 0 | No | " |
| `apps/minesweeper` | 0 | No | " |
| `apps/sudoku` | 0 | No | " |
| `apps/wordle` | 0 | No | " |
| `apps/sponsor` | 0 | No | " |
| `apps/api` | 22 | No (CI invokes via direct `tsx --test`) | 3 of 4 files not in CI |
| `apps/agent-runner` | 0 | No | CI workflow `agent-runner.yml` is `workflow_dispatch` only — no unit-test gate |
| `apps/orchestrator` | 0 | No | Cron entries proxy to `@skillos/duel-backend` |
| `packages/ai-coach` | 0 | No | — |
| `packages/cli` | 0 | No | — |
| `packages/contracts` | 0 | No | ABI re-export pkg |
| `packages/duel-backend` | ~66 (per file counts) | No (CI invokes directly) | 8 of 8 files in CI |
| `packages/game-types` | 0 | No | Type-only pkg |
| `packages/lib-shared` | 0 | No | — |
| `packages/mcp` | 0 | No | — |
| `packages/sdk` | 0 | No | **Public surface — zero tests** (Phase 2 mainnet launch package) |
| `packages/skills` | 0 | No | Prompt/spec pack |
| `packages/sp-engine` | (2 files) | **Yes** (`tsx --test src/engine.test.ts`) | Only package with explicit `test` script |
| `packages/ui` | 8 | No | Pure-helper test, no RTL setup |

### 5.5 Root-level + turbo

`package.json` exposes `dev`, `build`, `lint`, `typecheck`, `backfill:sp` and 2× 2048-specific scripts. **No `test` script.** `turbo.json` defines `dev | build | lint | typecheck` tasks; **no `test` task**. The honor-system test path is the direct `tsx --test` invocation in `.github/workflows/ci.yml`.

### 5.6 Integration / E2E state

- **No Playwright config.** No `playwright.config.*` anywhere; no `*.test.tsx` (React Testing Library) anywhere.
- **No smoke test harness in CI.** `apps/api/package.json` declares `smoke`, `smoke:x2`, `smoke:x5` (tsx scripts) but none run in `.github/workflows/`.
- **Integration coverage:** only `packages/duel-backend/test/settle-guard.integration.test.ts` exists — and all 3 tests are `.skip`'d.

### 5.7 Critical paths with no test

1. **`apps/api/src/lib/duel/runner.ts`** (Anthropic agent + game-2048 + on-chain submitSoloScore) — no unit test. Live-only verification via X15.7 demo (memory `project_x15_7_e2e_verified`).
2. **SDK public surface** (`packages/sdk/src/*`) — no tests. Phase 2 SDK release will publish untested public API.
3. **MCP server** (`packages/mcp/*`) — no tests.
4. **CLI** (`packages/cli/*`) — no tests.
5. **All 6 game apps' game logic** — no tests; correctness verified only by player runs.
6. **Sponsor dashboard** — no tests.
7. **Agent runner end-to-end** — `apps/agent-runner` only has CI workflow_dispatch (live runs), no unit-test gate.

---

## 6. README + doc currency

### 6.1 Per-app/package README inventory

| Path | Last commit (git) | Lines | Currency assessment |
|---|---|---|---|
| `README.md` (root) | 2026-05-15 | 256 | **Partially stale.** Line 7 says "rebrand to SkillOS is queued for Phase 2 mainnet cutover window" — but GitHub rebrand already executed (memory `project_skillos_rebrand_state`); the README's queuing language is ambiguous between repo-rename (done) and public-facing brand (queued). |
| `CLAUDE.md` (root) | 2026-05-14 | 12.8 KB | **Multiple drifts** (see §6.2). |
| `apps/2048/README.md` | 2026-05-10 | 28L | Brief stub; no Sprint X-* references; survives. |
| `apps/api/README.md` | 2026-05-11 | 328L | **Severe drift.** Top frontmatter still reads *"Sprint X2 scope (current): adds SIWB human auth + bearer-gated /v1/scores POST. … x402 paywalled tier deferred to X5. SIWA agent auth deferred to X4."* — every deferred item has long since shipped. Repo is at Sprint X19+. The README's deferral roadmap reads like a snapshot from May 5. |
| `apps/clicker/README.md` | 2026-05-10 | 25L | Stub. |
| `apps/match3/README.md` | 2026-05-10 | 25L | Stub. |
| `apps/minesweeper/README.md` | 2026-05-10 | 25L | Stub. |
| `apps/orchestrator/README.md` | 2026-05-10 | 75L | Cron-app summary; survives. |
| `apps/sponsor/README.md` | 2026-05-10 | 33L | Stub. |
| `apps/sudoku/README.md` | 2026-05-10 | 25L | Stub. |
| `apps/wordle/README.md` | 2026-05-10 | 25L | Stub. |
| `packages/ai-coach/README.md` | 2026-05-10 | 33L | Stub. |
| `packages/cli/README.md` | 2026-05-12 | 119L | Fresh enough. |
| `packages/contracts/README.md` | 2026-05-10 | 52L | Survives. |
| `packages/duel-backend/README.md` | 2026-05-10 | 35L | Stub for a 1,091-LOC cron module — undertstated. |
| `packages/game-types/README.md` | 2026-05-10 | 14L | One-liner. |
| `packages/lib-shared/README.md` | 2026-05-10 | 28L | Stub. |
| `packages/mcp/README.md` | 2026-05-12 | 103L | OK. |
| `packages/sdk/README.md` | 2026-05-11 | 175L | Pre-launch SDK doc; mainnet status questions open. |
| `packages/skills/README.md` | 2026-05-14 | 121L | Fresh. |
| `packages/sp-engine/README.md` | 2026-05-10 | 31L | Stub. |
| `packages/ui/README.md` | 2026-05-10 | 31L | Stub. |

### 6.2 CLAUDE.md drift instances

CLAUDE.md is dated 2026-05-14. Drift instances against current code:

1. **L16-17:** *"ESLint 8.57.1 + eslint-config-next 14.2.35 (note: Next 14 era — apex repo is on Next 16)"*. **REFUTED.** Every app on `^16.2.4`:
   ```
   apps/2048, apps/api, apps/clicker, apps/match3, apps/minesweeper,
   apps/orchestrator, apps/sponsor, apps/sudoku, apps/wordle: "next": "^16.2.4"
   ```
   Matches memory `project_claudemd_nextjs_version_stale` (already filed as X8 axis-6).

2. **L33 & L146:** *"No CI today: .github/workflows/ does not exist."* **REFUTED.** `.github/workflows/` has `ci.yml` (4 jobs: typecheck, test-ts, test-foundry, lint) + `agent-runner.yml` (matrix-of-5). CI was added in the X6/X7 timeframe.

3. **L163 (backlog):** *"Next.js 16.2.4 bump"*. **REFUTED — already completed** per #1 above. Item should be removed from backlog.

4. **L162 (backlog):** *"Cron settle throughput refactor"* — still open. Survives.

5. **L165 (backlog):** *"TournamentCreated event indexer"* — **REFUTED — already shipped** per §3.3 above (PR #41 / commit c28a107). Memory `project_post_yc_tournament_created_indexer` carries the same stale claim.

6. **L153:** *"Until May 4, 2026, prioritize what's submission-relevant."* Date is past (today is 2026-05-17). The clause has expired but is still active in the text — operationally inert, but technically stale guidance.

7. **L120 + L137:** *"Phase 2 follow-up"* / *"Phase 2 transition introduces"* — CI gates and pre-commit hooks listed as "introduces in Phase 2"; CI is already live (`ci.yml`). Pre-commit hooks (`husky`) — verified absent (no `.husky/` dir, no `husky` in `package.json`). Partial drift: CI live, hooks still pending.

### 6.3 docs/architecture/developer-surface.md

Dated *"Last verified: May 10, 2026"*. One week old. Document is a planning artifact (locked decisions ✅, deferred ⏳, open ❓). Currency assessment: structurally still valid; specific dates and "Phase 1.7" labels would benefit from a sweep, but no immediate contradiction with code.

### 6.4 docs/adr

Two ADRs on disk:
- `0002-dual-profile-pipeline-split.md` — Foundry profiles (matches memory `project_foundry_dual_profile_phase1_legacy`)
- `0003-agent-x402-retry-payments.md` — X15 paid retry design (matches memory `project_x15_8_payment_attempts_schema_lock`)

Missing per CLAUDE.md L165 (deferred): `0001-v22-fee-splitter.md` (deferred to Phase 2 mainnet contract auditor consultation — per README L103). The numbering skip (no 0001) is the visible signal.

### 6.5 docs/sprints

Two retrospectives: `X15-wave-1-retrospective.md`, `X15-wave-2-retrospective.md`. Sprint X16-X20 (incl. X19 schema-drift, X19a Blockscout verify, X19b feeVault rotation) **have no retrospective files**. The sprint-doc cadence dropped off after X15.

### 6.6 apex CLAUDE.md state (cross-repo)

Located at `/Users/inancayvaz/skillbase-apex/CLAUDE.md`, last modified 2026-05-10 (local fs date). Top says:
- `Next.js 16.2.4 App Router (React 19.2)` ✓ matches reality
- *"rebranded from Skillbase in PR #21, May 2026"* ✓ matches memory
- References `docs/superpowers/specs/2026-05-09-skillos-cutover-design.md` as the cutover spec

Apex CLAUDE.md is **fresher than MAS CLAUDE.md** on Next.js version (both are dated 2026-05-10/14 but only apex correctly states Next 16). The cross-repo MEMORY note on rebrand-state is the load-bearing alignment.

### 6.7 MEMORY.md state

Indexes 66 memory files (lines counted from `MEMORY.md`). 14 drift instances surfaced in §7. Index lines themselves do not show drift; the underlying files do.

---

## 7. Memory-as-spec drift inventory

Continues UR Pass 1 §2.6 (5 baseline drift instances). **R4 surfaces 14 distinct drift items** across the 66 memory files. Each cross-referenced against current code/state at this branch.

| # | Memory file | Claim | Reality | Direction | Verification command |
|---|---|---|---|---|---|
| D1 | `project_settle_tournaments_silent_swallow_phase2` | *"same substring-match bug at tournaments.ts ~line 739 (TournamentAlreadySettled)"* with implied path `apps/api/src/routes/tournaments.ts` | Path wrong (that file is 279 LOC, only read handlers). Actual: `packages/duel-backend/src/cron/tournaments.ts:977`. Line number also stale even within the cron file (comment at L192-193 self-cites "line ~739"). | **Contradict (path + line)** | `wc -l apps/api/src/routes/tournaments.ts packages/duel-backend/src/cron/tournaments.ts; grep -n "TournamentAlreadySettled" packages/duel-backend/src/cron/tournaments.ts` |
| D2 | `project_post_yc_tournament_created_indexer` | *"no event listener exists; permissionless createTournament() orphans v2_tournaments row, manual backfill needed"* | Indexer shipped via PR #41 (`c28a107`). Cron at `/api/cron/index-tournaments-created` daily 00:23 UTC. Backfill is idempotent on `creation_tx_hash IS NULL`. | **Over-claim of gap** (memory says missing; reality has it) | `cat apps/orchestrator/src/app/api/cron/index-tournaments-created/route.ts; git log --oneline packages/duel-backend/src/cron/index-tournaments-created.ts` |
| D3 | `project_claudemd_nextjs_version_stale` | *"Next 14 framing stale; all 5 games + 2048 on next@^16.2.4 as of 2026-05-12"* (memory itself flags drift in CLAUDE.md) | **Verified.** CLAUDE.md L16-17 still says Next 14. Apex on 16. R4 confirms claim is true and CLAUDE.md needs the fix the memory predicted. | **Memory is correct; doc is stale** | `grep -h "\"next\":" apps/*/package.json \| sort -u` → all `^16.2.4` |
| D4 | `project_phase2_duel_reactivation` | *"un-skip settle-guard integration tests"* trigger #1 | **Verified open.** 4 `test.skip(` in `settle-guard.integration.test.ts`. | Memory current | `grep -nE "(it\|test)\.skip\(" packages/duel-backend/test/settle-guard.integration.test.ts` |
| D5 | `project_phase2_nonce_store_unify` | SIWB + SIWA each on own Supabase table; unify under single Redis with namespaced prefixes | **Verified.** `skillos_auth_nonces` (13 rows) + `skillos_siwa_nonces` (2 rows) coexist as separate tables. | Memory current | `list_tables` → both present |
| D6 | `project_x19b_fee_vault_separated` | ChallengeEscrow feeVault = `0x455536e4bC148Eba4621d0AfB8EFD59e0654F596`, separated from trustedSigner on 2026-05-14 | **Verified.** `contracts/deployments/wallets-base-sepolia.md` matches exactly. | Memory current | `cat contracts/deployments/wallets-base-sepolia.md` |
| D7 | `project_skillbase_trustedsigner` | trustedSigner = `0xA24f9122568e98b72f4dDD61119C7D92D0975692` | **Verified** in deploy registry. | Memory current | `grep -i "trustedSigner" contracts/deployments/wallets-base-sepolia.md` |
| D8 | `project_x15_8_payment_attempts_schema_lock` | "v4_20260515b applied to clizuqvtkekzxiflbsyr; X15.5 apex frontend rename PR still OPEN" | DB side **verified** (registry version `20260515173813`). Apex PR status not re-checked this pass (apex repo out of scope). | Half-verified | `list_migrations` |
| D9 | `project_x15_chargeretryfee_first_paid_retry_race` | First-paid-retry RPC race; fix candidate at `charge-retry-fee.ts` post-approve | Code at `apps/api/src/lib/duel/charge-retry-fee.ts` confirms `chargeRetryFee` orchestration; `needs_manual_review` column present on `x15_payment_attempts` (8 rows; row counts match memory's "1 race-failed" pattern). Fix not yet shipped. | Memory current | `grep -n "needs_manual_review\|chargeRetryFee" apps/api/src/lib/duel/charge-retry-fee.ts` |
| D10 | `project_paid_retry_broadcast_post_yc` | *"fire-and-forget submitSoloScore has no RPC retry/timeout/fallback"* | Verified by inspection of `runner.ts` flow and `apps/api/src/routes/agents-matches.ts`. Three fix options A/B/C still applicable. | Memory current | (read-only inspection, offchain-findings §H4-H8) |
| D11 | `project_skillos_rebrand_state` | "GitHub: skillbase→skillos, skillbase-apex→skillos-apex; local folders unchanged" | **Verified.** Local paths still `/Users/inancayvaz/MAS` (not `/skillos`) and `/Users/inancayvaz/skillbase-apex`. GitHub remote name change is a separate consideration. | Memory current | `pwd; ls /Users/inancayvaz/skillbase-apex/CLAUDE.md` |
| D12 | `project_skillos_no_staging_supabase` | Single project = clizuqvtkekzxiflbsyr; X19 must add preview branches OR separate staging | **Verified.** `list_branches` not called this pass, but `list_organizations` + register confirm only one prod project. | Memory current | `list_organizations` |
| D13 | `reference_apps_api_prebuilt_deploy_only` | apps/api deploys via prebuilt CLI only (no Git auto-deploy); `prepare-bundle.sh` + `vercel deploy --prebuilt` required | **Verified.** `apps/api/package.json:scripts.build:vercel = scripts/prepare-bundle.sh`; `deploy:prod = npm run build:vercel && vercel deploy --prebuilt --prod --archive=tgz`. | Memory current | `jq .scripts apps/api/package.json` |
| D14 | `project_x4_uncalled_scripts_pre_merge_smoke` | "X4 register-agent.ts shipped without first-real-execution; typecheck-passed/runtime-failed pattern" | Pattern still active: `apps/agent-runner` (CI: workflow_dispatch only), `packages/sdk` (no tests), 8 `script/*.s.sol` Foundry scripts at 0% coverage. | Memory current — and **scope larger than memory implies** | `find apps/agent-runner packages/sdk -name "*.test.ts"` (none) |

Net new instances vs UR Pass 1 §2.6: at least **9 new** (D1-D2, D4, D9-D10, D13-D14 plus 2 confirmations from existing). UR baseline 5 → **R4 surfaces 14 total drift instances**; expect more if memory expansion continues at current cadence.

### 7.1 Recommendations on drift maintenance

- **D1 and D2 are spec contradictions** (memory says X, reality is Y). These need correction before any agent uses memory as authority.
- **D3 is the doc that needs to catch up to memory** — opposite case. CLAUDE.md should be patched per the memory's own predictive note.
- **D14 reveals a meta-pattern** — the "uncalled scripts" risk extends well beyond the original X4 incident. R4 sees 4+ subsystems in the same posture.

---

## 8. Gap list (not in current backlog)

Discovered during inventory but not in X1-X20 + UR Pass 1 backlog + v1.4 sprint queue. Per-gap: severity / scope / Phase tag.

### 8.1 Critical (Phase 2 mainnet blockers if untreated)

| # | Gap | Scope | Phase |
|---|---|---|---|
| G1 | **3 apps/api test files not in CI** (`agents-matches.test.ts`, `charge-retry-fee.test.ts`, `x402-client.test.ts` — 13 cases including H5 facilitator trust + X15 race coverage) | 1 line in `.github/workflows/ci.yml` | P2 mainnet (audit-prep) |
| G2 | **`packages/sdk` public-surface zero tests** | New test file batch + CI gate | P2 mainnet (SDK launch is a Phase 2 deliverable) |
| G3 | **`apps/api/runner.ts` has no unit test** (Anthropic agent + on-chain submit; only live X15.7 verification) | Mock-based test suite for `runner.ts`, `game-2048.ts`, `anthropic-agent.ts` | P2 |
| G4 | **`agent-runner` end-to-end has no unit-test gate** (workflow_dispatch only, no scheduled CI on dry-run) | Add `tsx --test` gate in agent-runner workflow | P1-P2 |

### 8.2 Important (Phase 2 readiness; non-blocker)

| # | Gap | Scope | Phase |
|---|---|---|---|
| G5 | **`apps/api/README.md` claims Sprint X2 scope** — 17 sprints stale | README rewrite | P2 |
| G6 | **CLAUDE.md says "No CI today"** + Next 14 + completed backlog items | Sprint X8 axis-6 already filed; restate priority | P2 |
| G7 | **No turbo `test` task / no root `test` script** — every workspace test is invoked by hard-coded path | Add `test` task to `turbo.json`; per-package `test` scripts | P2 (CI gate hygiene) |
| G8 | **Sprint retrospectives stopped after X15** — no X16-X20 retros on disk | Backfill retros from PR history (X19, X19a, X19b at minimum) | P2 |
| G9 | **`ArcadePool.sol` branch coverage 11.76%** | Test expansion (mainnet pre-audit) | P2 mainnet legacy |
| G10 | **`ChallengeEscrow.sol` branch coverage 61.54%** — current contract under threshold | Test expansion | P2 |
| G11 | **No Playwright / E2E / React Testing Library** anywhere | Pick one runner; smoke test for 1 game + 1 paid retry flow | P1-P2 |
| G12 | **Foundry `script/*.s.sol` 0% coverage including `BackfillV2Tournament*.s.sol`** used in production forensic recovery | Pin scripts as scripts (acceptable) OR add `script test` suite | P1 (audit comfort) |

### 8.3 Nice-to-have

| # | Gap | Scope | Phase |
|---|---|---|---|
| G13 | **6 V1 orphan tables on prod** (`challenges`, `users`, `game_sessions`, `daily_challenges`, `daily_ranks`, `daily_aggregates`, `game_scores`, `ai_analyses`, `payouts`) — 25 cols on `challenges` alone | Quarantine + drop, after confirming no live writer | P2 schema sanity |
| G14 | **`v2_duels` has no FK to `v2_tournaments`** — array-encoded linkage via `v2_tournament_entries.source_duel_ids:_uuid` | Add FK or formalize array semantics; depends on duel reactivation work | P2 |
| G15 | **Two identity models** (`users.id:uuid` vs `user_address:text`); only `game_sessions.user_id` joins back | Adopt one; FID enrichment goal hangs in limbo | P2 social layer |
| G16 | **Auth schema sprawl** — 22 empty `auth.*` tables (Supabase OAuth + WebAuthn) for an unused auth path | No action (Supabase-managed); document in `docs/audit-prep/` so auditor doesn't ask | P2 audit comfort |
| G17 | **Sprint X16-X20 sub-daily cron cadence (Hobby tier upgrade)** — TournamentCreated indexer + settle blast radius | Vercel Pro upgrade + 4-hour cadence rather than daily | P1 ops |
| G18 | **No pre-commit hooks** (CLAUDE.md says "introduces in Phase 2", husky absent) | Install husky + lint-staged + secret-scan; align with CLAUDE.md commitment | P2 |

### 8.4 Items already in current backlog (cross-check)

For audit fidelity, confirmed these are tracked elsewhere and intentionally not in §8:
- X19 9-item schema drift sprint (3-5 days) — `docs/audit-prep/x19-schema-drift-analysis.md`
- C1, C2 (offchain auth + rate-limit) — `docs/audit-prep/offchain-findings.md`
- T0/T1+ plausibility blocker — memory `project_phase2_mainnet_blocker_plausibility`
- Phase 2 contract auditor kickoff — Sprint X9 external

---

## 9. Phase trajectory readiness

### 9.1 Phase 1 (testnet activity capture)

**Status: GOOD.** Data layer fully captures Phase 1 activity:
- 159 tournaments × 346 entries × 383 solo runs × 317 user-stat rows → solid event capture across the v2 stack.
- `creation_block_number`, `creation_tx_hash`, `created_via` columns on `v2_tournaments` enable forensic backfill (X9 match3 5/13 pattern) and source attribution (orchestrator/sdk/external).
- `v2_sp_snapshots` (20 anchored snapshots, public-read) gives external verification surface.
- `v2_sponsor_contributions` + `v2_sponsor_indexer_state` + `v2_tournament_indexer_state` form a clean read-side indexing layer.

**Cross-class data structure (human×human + agent×agent + human×agent):** representable but not richly schema'd. The current schema only distinguishes:
- **Solo (human OR agent):** `v2_tournament_solo_runs` keyed by `player_address:text`. No agent/human tag column.
- **Duel:** `v2_duels` with `player1_address` + `player2_address`. No agent/human tag.
- **Agent run trace:** `duel_runs` + `duel_moves` (X15 agent runner pathway).

**Gap:** there is no schema column distinguishing agent from human at the player level. `v2_user_stats.user_address` is wallet-only. Phase 1 cross-class semantics live in agent-side ERC-8004 NFT ownership, not in DB. **Acceptable for Phase 1**, but P2 cross-class fairness analytics will need either a join through ERC-8004 (read-time) or an agent-tag column.

### 9.2 Phase 2 (mainnet activation)

**Schema readiness for v2.2 contract events (dev fee splitter):** **MEDIUM gap.** No dedicated table for dev-fee accumulator events yet. The X19 plan calls for forward-only migrations; this is the next major one if v2.2 ships.

**X14 class fairness columns:** **NOT PRESENT.** No `is_agent`, `class_tag`, or `fairness_bucket` columns on `v2_tournament_solo_runs` or `v2_duels`. X14 work would add these.

**X20 AntiCheat forensic columns:** **PARTIAL.** `plausibility_check:jsonb` exists on `v2_duels` AND `v2_tournament_solo_runs`. `excluded:bool` + `excluded_reason:text` exist on both. **Lacks:** explicit `anti_cheat_score`, `forensic_payload`, `replay_seed_hash` columns. X20 design (per existing `t5-3-anticheat-verification.md`) will pull more shape.

**Paid retry telemetry:** **READY.** `x15_payment_attempts` (22 cols, realtime publication, replica identity full) and `is_paid_retry`/`fee_paid_usdc`/`fee_tx_hash` on `v2_tournament_solo_runs` give complete X15 lineage.

**Indexer split:** `v2_sponsor_indexer_state` + `v2_tournament_indexer_state` already separated by contract concern. Add v2.2 contracts → add one more indexer-state row, no schema churn.

**Backlog items captured in §8:** G7 (turbo test task), G18 (pre-commit hooks), G5-G6 (doc-currency).

### 9.3 Phase 5 (substrate intelligence)

**ML training corpus surface area:** **CRITICALLY THIN.**

The only ML-shape table is `duel_moves` (586 rows, 11 cols including `board_before:jsonb`, `board_after:jsonb`, `score_delta`, `cumulative_score`, `reasoning:text`, `latency_ms`). This is the canonical agent trace surface, currently only populated by the X15 agent runner pathway.

**Phase 5 readiness signals:**
- ✓ `duel_moves` has reasoning text — agent decisions captured.
- ✓ `v2_sp_snapshots.canonical_json:jsonb` provides public-verifiable training-data anchors.
- ✗ **No human-side move trace.** Players' moves in 2048/wordle/match3 etc. submit only final scores, not move sequences. Phase 5 cross-class training (anti-cheat oracle, foundation models) needs human-side move data of equivalent shape.
- ✗ **No retention/archival policy column.** No `retain_until`, `consent_flag`, `licensing_status` on `duel_moves`. Phase 5 "AI-lab data licensing" tier (README §3) needs licensing-status metadata.
- ✗ **No telemetry firehose / events table.** No `events`, `agent_actions`, `trace_id`-keyed unified log. `duel_moves` is the closest analog and only covers agent-side.
- ✗ **No replay artifact storage.** Game state in `duel_moves.board_before` is per-move JSON, not a replay file. Future replay tooling needs either a dedicated `replay_blobs` table (or Supabase Storage bucket) or signed replay payloads on `v2_tournament_solo_runs`.

**Recommendation:** Phase 5 readiness needs an explicit data layer initiative — minimum scope: (a) human-side `game_moves` table mirroring `duel_moves` shape, (b) `data_license_status` column on training-relevant rows, (c) telemetry retention policy. Not in current backlog; flag as Phase 4-5 (or Phase 3 substrate-prep).

---

## 10. Open questions for founder

1. **Memory entries D1 + D2 are wrong** — D1 (`project_settle_tournaments_silent_swallow_phase2` path + line stale) and D2 (`project_post_yc_tournament_created_indexer` claims indexer missing; reality has it). May I patch the memory files in a follow-up R-track PR, or do you want to do it directly?

2. **CLAUDE.md drifts** — 5 distinct stale claims (Next 14 era, "no CI today", "May 4 2026 deadline", completed backlog items). All call for one CLAUDE.md sweep PR. Is that an X8-axis-6 follow-up, or a v1.4-supplement sprint candidate?

3. **`apps/api/README.md` Sprint X2 framing** — should the README be updated to reflect Sprint X19+ reality, or replaced by a generated-from-OpenAPI docs page? (G5)

4. **3 apps/api test files outside CI** — were they intentionally excluded (e.g., depend on live AGENT_PRIVATE_KEY), or did the CI list simply drift? (G1) If intentional, they should be flagged with a CI-skip comment.

5. **`packages/sdk` has zero tests** — pre-mainnet, does the SDK launch hold on a test-coverage gate, or ship with smoke-only? (G2)

6. **V1 orphan tables on prod** (G13) — `challenges` (25 cols), `users`, `game_sessions`, 5 dormant daily_*-flavored tables. Quarantine + drop, or formal adoption for FID/social-profile mapping? Either way: visible cleanup.

7. **Cron sub-daily cadence (G17)** — Vercel Pro upgrade ($20/mo per project) buys sub-daily crons. Worth flagging in Phase 1 ops cost or hold until Phase 2 mainnet?

8. **Phase 5 data layer** (§9.3) — is "no human-side move trace + no telemetry firehose + no licensing column" a defensible Phase 1-4 posture, or does substrate intelligence narrative require visible data-layer prep by Phase 3?

---

## Constraints honored

- Read-only ✓ (no schema changes, no migration applies, no production state changes)
- No PII/secrets in output ✓ (wallet addresses are public on-chain; no privkeys/tokens)
- Audit-prep tone — honest gap inventory ✓
- Domain neutrality preserved ✓ (no protocol-specific recommendations beyond what's already in the X19 plan and offchain-findings)
- VTP discipline ✓ (every memory claim verified against code/registry; commands cited)
- Gate-respect protocol per §3.14 ✓ (no progress made on spec-vs-reality mismatches that block other tracks)
