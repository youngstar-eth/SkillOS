# Sprint UR Pass 1 / Track D — Infrastructure Findings

**Branch:** `ur/track-d-infra`
**Worktree:** `/Users/inancayvaz/MAS/.claude/worktrees/ur-track-d-infra`
**Date:** 2026-05-17
**Auditor:** automated pass; founder review pending
**Mode:** findings-only — NO config or schema changes made by this pass
**Scope:** Supabase, Vercel, GitHub Actions, repo secrets, branch protection, CI/CD reproducibility, repo history.

> This document is the consolidated finding sheet for Track D. Companion deliverables:
> - `secrets-inventory.md` — redacted catalogue of every secret type and where it lives
> - `repo-history-scan.txt` — gitleaks raw output + triage

---

## §1 — Executive Summary

Across 9 audit axes, 350 commits of git history, 19 Supabase migrations, 12 Vercel projects, 2 GitHub workflows, 11 GH Actions secrets, and ~90 service-role usage sites, this pass identified:

| Severity | Count | Categories |
|---|---|---|
| **BLOCKER** | 0 | — |
| **HIGH** | 7 | RLS gaps (×2), service-role blast radius, no rotation runbook, env-var naming drift, GH workflow env-scope, GH security features disabled |
| **MEDIUM** | 14 | Permissive RLS policies, missing `permissions:` block in CI, no SHA-pinning, no timeouts, no concurrency, no Dependabot, etc. |
| **LOW** | 11 | search_path gaps, vestigial env-example entries, misleading comments, etc. |
| **INFO** | 11 | Correctness-preserving observations the auditor should know |
| **Total** | **43** | |

**Top-3 fixes recommended before external auditor kickoff (X9):**
1. Enable RLS + define policies on `v2_sp_snapshots` and `v2_cron_runs` (Findings F2.1, F2.2).
2. Write `docs/runbooks/secret-rotation-supabase.md` covering the 9-project rollover sequence (Finding F3.4 / Recommendation R1).
3. Re-enable Dependabot alerts + secret scanning + code scanning on the GitHub repo (Finding F6.1).

**Two structural observations the auditor must know:**
- **Service-role blast radius:** the Supabase service-role key is provisioned to **9 Vercel projects**, not the single `apps/api` project the original design memo intended. Root cause: the `@skillos/duel-backend` route-handler-as-package pattern causes every consuming app to need the key for runtime function (Finding F3.1).
- **Repo history is clean:** 350 commits, 18 MB of history, **zero true secret leaks** (175 raw gitleaks hits all triage as false-positives: vendored OpenZeppelin test fixtures, a well-known Anvil dev key, and 6 Farcaster Frame manifest public addresses).

---

## §2 — Supabase RLS + Audit Columns

**Scope:** all 19 SQL migrations in `supabase/migrations/` (18 in the worktree + 1 in main checkout not yet reachable here — `v4_20260515b_x15_payment_attempts_canonical_lock.sql`, applied to prod 2026-05-15 per memory `project_x15_8_payment_attempts_schema_lock.md`).

### §2.1 — Policy matrix (per-table)

Legend: ✅ RLS enabled with policies / 🟡 RLS enabled, no policies (default-deny) / 🔴 RLS **not** enabled.

| Table | RLS | anon SELECT | anon write | service_role | TO clause | Notes |
|---|---|---|---|---|---|---|
| `v2_duels` | ✅ | `USING (true)` | denied | bypass | `TO anon` | service-role writes; per-spec |
| `v2_tournaments` | ✅ | `USING (true)` | denied | bypass | `TO anon` | exposes `creator_address`, `prize_*` |
| `v2_tournament_entries` | ✅ | `USING (true)` | denied | bypass | `TO anon` | exposes `prize_won_usdc`, `total_fee_paid_usdc`, `prize_tx_hash` |
| `v2_tournament_solo_runs` | ✅ | `USING (true)` | denied | bypass | `TO anon` | exposes `fee_paid_usdc`, `fee_tx_hash`, `plausibility_check` |
| `v2_user_stats` | ✅ | `USING (true)` | denied | bypass | `TO anon` | leaderboard data |
| `v2_sp_snapshots` | 🔴 | **wide-open** | **wide-open** | bypass | n/a | **HIGH — Finding F2.1** |
| `v2_sponsor_contributions` | ✅ | `USING (true)` | denied | bypass | `TO anon` | on-chain mirror; no PII |
| `v2_sponsor_indexer_state` | 🟡 | denied | denied | bypass | n/a | intentional — internal watermark |
| `v2_cron_runs` | 🔴 | **wide-open** | **wide-open** | bypass | n/a | **HIGH — Finding F2.2** |
| `v2_tournament_indexer_state` | 🟡 | denied | denied | bypass | n/a | intentional — internal watermark |
| `skillos_auth_nonces` | 🟡 | denied | denied | bypass | n/a | SIWB nonce store; defense-in-depth |
| `skillos_siwa_nonces` | 🟡 | denied | denied | bypass | n/a | SIWA nonce store; defense-in-depth |
| `duel_runs` | ✅ | `USING (true)` | denied | bypass | **omitted (= `public`)** | **MEDIUM — Finding F2.4** |
| `duel_moves` | ✅ | `USING (true)` | denied | bypass | **omitted (= `public`)** | **MEDIUM — Finding F2.4** |
| `x15_payment_attempts` (canonical) | ✅ | `USING (true)` | denied | bypass | **omitted (= `public`)** | **MEDIUM — Finding F2.4** + Realtime broadcast (F2.5) |

### §2.2 — Audit-column coverage

Classification: **FULL** = `created_at` + `updated_at` + trigger; **PARTIAL** = some columns; **NONE** = no audit columns.

| Table | created_at | updated_at | trigger | Class | Notes |
|---|:-:|:-:|:-:|:-:|---|
| `v2_duels` | ✅ | ✅ | ✅ (unpinned search_path) | FULL | F2.6 |
| `v2_tournaments` | ✅ | — | — | PARTIAL | settle/creation fields mutate untraced |
| `v2_tournament_entries` | ✅ | ✅ | ✅ (unpinned) | FULL | F2.6 |
| `v2_tournament_solo_runs` | — | — | — | NONE | header says "durable audit by design" — but `excluded` mutates untraced |
| `v2_user_stats` | ✅ | — | — | PARTIAL | SP counters mutate without `updated_at` |
| `v2_sp_snapshots` | ✅ | — | — | PARTIAL | append-only by design |
| `v2_sponsor_contributions` | (uses `indexed_at`) | — | — | PARTIAL | event mirror; acceptable |
| `v2_sponsor_indexer_state` | — | ✅ | ✅ (pinned `''`) | PARTIAL | single-row watermark |
| `v2_cron_runs` | uses `started_at` | uses `completed_at` | — | PARTIAL | business-state doubles as audit |
| `v2_tournament_indexer_state` | — | ✅ | ✅ (unpinned) | PARTIAL | F2.6 |
| `skillos_auth_nonces` | uses `issued_at` | — | — | PARTIAL | nonce lifecycle |
| `skillos_siwa_nonces` | — | — | — | NONE | minimal; DELETE-on-consume — F2.8 |
| `duel_runs` | uses `started_at`/`ended_at` | — | — | PARTIAL | FSM transitions untraced |
| `duel_moves` | ✅ | — | — | PARTIAL | append-only by design |
| `x15_payment_attempts` (canonical) | ✅ | ✅ | ✅ (pinned `''`) | FULL | best-in-class |

**Aggregate:** 3 FULL · 8 PARTIAL · 2 NONE · 2 RLS-missing tables. No `deleted_at`, no `version`, no `created_by`/`updated_by` on any table.

### §2.3 — Functions / SECURITY DEFINER

The repo has exactly one `SECURITY DEFINER` function in `supabase/migrations/`:
`v2_sponsor_indexer_state_set_updated_at` (v2_20260429_sponsor_function_search_path.sql:12-22) — **search_path pinned to `''`**, uses unqualified `now()` (resolves via `pg_catalog`). Low risk as written.

### §2.4 — Findings

**F2.1 — HIGH: `v2_sp_snapshots` has NO RLS at all**
- *File:* `supabase/migrations/v2_20260428_sp_snapshots.sql:20-30`
- *Cause:* `ALTER TABLE … ENABLE ROW LEVEL SECURITY` never issued; no policies created
- *Impact:* anon (publishable) key has unrestricted INSERT/UPDATE/DELETE on the SP-snapshot anchoring table. An attacker holding the publishable key can `DELETE FROM v2_sp_snapshots` or backdate `anchor_tx_hash` to claim a hash was anchored when it wasn't, breaking the SkillbaseAnchor proof chain (DoS / confusion; not forgery — on-chain `anchorSnapshot()` hash remains authoritative)
- *Recommendation:* `ALTER TABLE v2_sp_snapshots ENABLE ROW LEVEL SECURITY;` + `CREATE POLICY v2_sp_snapshots_anon_select ON v2_sp_snapshots FOR SELECT TO anon USING (true);`

**F2.2 — HIGH: `v2_cron_runs` has NO RLS at all**
- *File:* `supabase/migrations/v2_20260507_cron_runs.sql:25-32`
- *Cause:* same as F2.1
- *Impact:* an attacker holding the publishable key can pre-INSERT rows to falsely "claim" cron windows. `run-lock.ts` uses 23505 unique-violation as the "another run in progress" signal — attacker INSERT trips this with no recourse. Permanent settlement DoS via hostile anon key
- *Severity rationale:* Phase 2 mainnet readiness is gated on reliable settle crons; this is a single-row settlement-DoS vector
- *Recommendation:* RLS on, no policies (match `v2_sponsor_indexer_state` precedent — internal-only)

**F2.3 — MEDIUM: Permissive `USING (true)` on financial / PII-adjacent SELECT policies**
- *Affected:* `v2_tournament_entries`, `v2_tournament_solo_runs`, `x15_payment_attempts`
- *Impact:* per-wallet financial outcomes world-readable. `plausibility_check.reasoning` (LLM-generated text) may include defamation surface. `x15_payment_attempts.error_message` may include sensitive infra details (RPC hostnames, internal IDs) — anon-readable in 500-char form
- *Recommendation:* auditor should bless this explicitly (consistent with Phase 1 transparency pitch) but server-side redaction of `error_message` before insert is required

**F2.4 — MEDIUM: 3 newer policies omit `TO` clause (defaults to `public`)**
- *Affected files / policies:*
  - `v3_20260514_duel_moves.sql:152-153` (`duel_runs_public_read`)
  - `v3_20260514_duel_moves.sql:156-157` (`duel_moves_public_read`)
  - `v4_20260515b_x15_payment_attempts_canonical_lock.sql:213-214` (`x15_payment_attempts_public_read`)
- *Compare:* older `v2_*` policies all use explicit `TO anon`
- *Impact:* `TO public` applies to anon AND authenticated AND any future custom Postgres role. Today no `authenticated` role is used, but the policy is silently pre-broadened
- *Recommendation:* normalize to `TO anon` everywhere unless `authenticated` is meant to have distinct rights (it isn't, today)

**F2.5 — MEDIUM: Realtime publication of `x15_payment_attempts` exposes payment events to anon subscribers**
- *File:* `v4_20260515b_x15_payment_attempts_canonical_lock.sql:195-207`
- *Impact:* every payment-attempt row streamed in full (with `tx_hash`, `agent_address`, `error_message`, `error_code`) to any websocket client holding the anon key. Intentional for X15.5 spectator UX
- *Recommendation:* auditor confirms operator runbook redacts `error_message` server-side before insert

**F2.6 — LOW: 3 trigger functions still have unpinned search_path**
- *Files:* `v2_20260421_duels.sql:75-81`, `v2_20260422_tournaments.sql:90-96`, `v2_20260508_tournament_indexer.sql:88-94`
- *Context:* `v2_20260429_sponsor_function_search_path.sql:8-9` explicitly acknowledges the gap ("separate cleanup migration if/when prioritized") — never written
- *Severity:* LOW because these functions are not `SECURITY DEFINER`. Will show as Supabase advisor 0011 in any external scan
- *Recommendation:* land the deferred cleanup migration

**F2.7 — LOW: `v2_sp_snapshots` hex-regex inconsistency**
- *File:* `v2_20260428_sp_snapshots.sql` — `hash` constraint is lowercase-hex only (line 23); `anchor_tx_hash` is case-insensitive (line 27)
- *Impact:* a hash computed via viem-checksum will be rejected on insert; an anchor tx hash with uppercase will be accepted. Data-integrity inconsistency

**F2.8 — LOW: SIWA nonce DELETE-on-consume leaves no audit trail**
- *File:* `v3_20260511_siwa_nonces.sql:24-26` (deferral comment)
- *Recommendation:* pre-mainnet, add at least a Prometheus counter or daily-aggregated `siwa_audit` table for failed-verification attempts

**F2.9 — LOW: `v2_duels` author-attribution + state-mutation untraceable**
- *File:* `v2_20260421_duels.sql:11-38`
- Status transitions (queued → matched → … → settled/refunded) mutate the row in place. Only `created_at` / `updated_at` captured. State-machine evidence gap on disputed settles

**F2.10 — LOW: `v2_tournament_solo_runs` "immutable by comment" but not by DB**
- *File:* `v2_20260423_tournament_solo.sql:22-25` (comment) vs reality
- `excluded` / `excluded_reason` cols mutate in place; no `excluded_at` timestamp; no DB-level immutability of `score`

**F2.11 — LOW: `duel_runs` lacks `updated_at` despite FSM mutations**
- *File:* `v3_20260514_duel_moves.sql:42-76`; `end_reason` added by `v4_20260515c_*`
- pending → running → … transitions are not stamped

**F2.12 — INFO: payment_attempts single-status enum LOCK confirmed**
- *File:* `v4_20260515b_x15_payment_attempts_canonical_lock.sql:103`
- Matches `project_x15_8_payment_attempts_schema_lock.md` verbatim. PASS

**F2.13 — INFO: skillos_auth_nonces retains rows indefinitely**
- *File:* `v2_20260510_auth_nonces.sql:23-24` (deferred-cleanup comment)
- Storage bloat, not security risk; pre-mainnet add scheduled DELETE

**F2.14 — INFO: FK CASCADE divergence between `duel_moves` and `x15_payment_attempts` is intentional**
- *Files:* `v3_20260514_duel_moves.sql:87` (no cascade) vs `v4_20260515b_*:74` (CASCADE)
- Documented; auditor should confirm operator expectation

**F2.15 — INFO: idempotent migration uses `DROP TABLE … CASCADE`**
- *File:* `v4_20260515b_x15_payment_attempts_canonical_lock.sql:55-65`
- Guard: `if exists … x402_status` predicate. Re-applying after a roll-forward of the legacy migration would silently drop data again

### §2.5 — Coverage gaps requiring live-DB inspection

The migration-only audit cannot answer:
1. Are there tables created out-of-band (Supabase dashboard SQL Editor, ad-hoc psql)?
2. Does `service_role` in prod actually have `BYPASSRLS`? (`SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role';`)
3. Are `supabase_realtime` publication ACLs locked down?
4. Out-of-migration grants on `public.*` to `authenticated`?
5. RPC functions added via dashboard (`SELECT proname, prosecdef, proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace`)?
6. RLS-on-no-policies tables not silently broadened by an out-of-band `GRANT … TO anon`?

---

## §3 — Service-Role Key Isolation

**Scope:** every place `SUPABASE_SERVICE_ROLE_KEY` is read, stored, transmitted, or implicitly required at deploy time.

### §3.1 — Code-side inventory

Only **5 files** in the entire repo read the env var directly:

| File:line | Role |
|---|---|
| `packages/lib-shared/src/supabase.ts:41` | `getSupabaseService()` factory (server-only barrel) |
| `apps/api/src/lib/supabase.ts:13` | apps/api Hono client |
| `apps/api/src/lib/auth-store.ts:28` | SIWB nonce store |
| `apps/api/src/lib/siwa-nonce-store.ts:27` | SIWA nonce store |
| `scripts/backfill-sp.ts:36` | one-shot ts-node ops script |

Everything else flows through `getSupabaseService()` (~92 invocations across `packages/duel-backend`, `apps/2048`, `apps/orchestrator`) or `getSupabaseClient()` (apps/api only).

**No `"use client"` file imports any service-role symbol.** All cross-package imports in client components are `import type` only.

### §3.2 — Provisioning topology (9 Vercel projects)

`.env.local.example` files documenting `SUPABASE_SERVICE_ROLE_KEY=`:

| File:line |
|---|
| `apps/api/.env.example:52` |
| `apps/2048/.env.local.example:11` |
| `apps/clicker/.env.local.example:11` |
| `apps/match3/.env.local.example:11` |
| `apps/minesweeper/.env.local.example:11` |
| `apps/wordle/.env.local.example:11` |
| `apps/sudoku/.env.local.example:11` |
| `apps/sponsor/.env.local.example:27` |
| `apps/orchestrator/.env.local.example:28` |

The service-role key must be provisioned to **9 Vercel project envs** for the current deploy topology to function at runtime. This is far broader than the original "apps/api only" intent of `reference_secret_handling_split.md`.

### §3.3 — Findings

**F3.1 — HIGH: Service-role provisioned to 9 Vercel projects → multiplied blast radius**
- *Cause:* `@skillos/duel-backend` route-handler-as-package — every game/sponsor app's `src/app/api/**/route.ts` thin wrappers import handlers that internally call `getSupabaseService()`
- *Impact:* a compromised Vercel project token (CI leak, founder credential leak, Vercel platform incident) on ANY of the 9 projects exposes the same key. Rotation requires touching 9 project envs in lockstep
- *Recommendation candidates (deferred):*
  - (a) Migrate game-app `/api/duel/*` thin wrappers to proxy `api.skillos.network` instead of running duel-backend handlers locally → eliminates service-role from 6 of 9 projects
  - (b) Consolidate sponsor/orchestrator deploys
  - (c) If neither, document a multi-project rotation runbook (F3.4)

**F3.2 — HIGH: Divergent env-var naming convention across two loader paths**
- *Loaders:*
  - `packages/lib-shared/src/supabase.ts:40-41` reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  - `apps/api/src/lib/supabase.ts:12-13` reads `SUPABASE_URL` (bare) + `SUPABASE_SERVICE_ROLE_KEY`
- *Impact:* during rotation, an operator could update `NEXT_PUBLIC_SUPABASE_URL` in mas-api thinking the URL was covered; apps/api would still fail because it reads bare `SUPABASE_URL`. Hidden footgun
- *Recommendation:* standardize on one canonical name. Recommended: rename apps/api to read `NEXT_PUBLIC_SUPABASE_URL` (since URL is not secret, the `NEXT_PUBLIC_` prefix is harmless on server)

**F3.3 — MEDIUM: Service-role used for reads that have anon-select RLS policies**
- *Affected:* `apps/api/src/routes/tournaments.ts:99`, `agents-matches.ts:180,315,328`, `apps/2048/src/app/api/sp-snapshot-status/route.ts:32`
- *Impact:* if the service-role key is compromised, these endpoints are write-capable surfaces to the attacker; with anon key, an exfiltrated key cannot write
- *Recommendation:* use a separate anon-keyed Supabase client for the read-only path

**F3.4 — HIGH: No documented rotation procedure**
- *Verified absent:* `docs/runbooks/`, `docs/security/`, `SECURITY.md` at repo root, `rotat*` keyword in any doc, any automated rotation script
- *Best-effort proxy for last rotation:* no commit on `apps/api/src/lib/supabase.ts` or `packages/lib-shared/src/supabase.ts` mentions "rotate" / "regenerate" / "new key" — almost certainly never rotated since project inception 2026-04-21
- *Recommendation (R1):* write `docs/runbooks/secret-rotation-supabase.md` covering: (a) Supabase dashboard regen, (b) 9-project rollover sequence (mas-api LAST to preserve SIWB/SIWA auth path), (c) per-project verification, (d) explicit step to invalidate the old key, (e) post-rotation smoke-test matrix

**F3.5 — LOW: Barrel export exposes `getSupabaseBrowser` from server-only package**
- *File:* `packages/lib-shared/src/index.ts:9`
- *Issue:* `export * from "./supabase";` re-exports `getSupabaseBrowser` alongside `getSupabaseService`. Header banner says "SERVER-ONLY primitives ... never ship to the browser" but ships a browser-intended factory
- *Today:* no caller of `getSupabaseBrowser` (grep confirmed) — dead code
- *Recommendation:* add `import "server-only";` to top of `packages/lib-shared/src/supabase.ts`, OR split into `supabase-browser.ts` / `supabase-service.ts` and remove the browser path from the barrel

**F3.6 — LOW: Misleading comment in sponsor env.example**
- *File:* `apps/sponsor/.env.local.example:23-24`
- Says "cron writes sponsor_events" but `apps/sponsor` runs NO cron (no `vercel.json` cron entries, no `/api/cron/*` routes). Sponsor needs service-role because the imported `@skillos/duel-backend` handlers use it for reads
- *Recommendation:* fix the comment

### §3.4 — Rotation story

| Aspect | State |
|---|---|
| Documented rotation procedure | **MISSING** |
| Rotation script | **NONE** |
| Last reference touched (proxy for rotation thought) | apps/api/src/lib/supabase.ts: PR #63 (2026-05-10, `f30f761`, refactor only); packages/lib-shared/src/supabase.ts: PR #60 (2026-05-10, `51bb3a7`, rebrand only) |
| Inferred last rotation date | **Never** since 2026-04-21 |

---

## §4 — Vercel Env-Var Topology

**Scope:** 9 in-monorepo Vercel projects + the `node_modules` anomaly + 2 out-of-scope external repos (skillbase-apex, simpl3).

### §4.1 — Project inventory

Enumerated via Vercel MCP `list_projects` (team `team_XyslOCNkXkP8tnjcTRs3yKSC` / scope `simpl3s-projects`):

```
mas-2048               → apps/2048
mas-wordle             → apps/wordle
mas-sudoku             → apps/sudoku
mas-match3             → apps/match3
mas-minesweeper        → apps/minesweeper
mas-clicker            → apps/clicker
skillbase-orchestrator → apps/orchestrator
skillbase-sponsor      → apps/sponsor
api                    → apps/api (prebuilt CLI deploy)
skillbase-apex         → /Users/inancayvaz/skillbase-apex (external repo, OOS)
simpl3                 → /Users/inancayvaz/simpl3 (external repo, OOS)
node_modules           → ANOMALY (see F4.3)
```

For per-project env-var requirements, see `secrets-inventory.md` §3 and §6 (founder verification matrix).

### §4.2 — Findings

**F4.1 — MEDIUM: Static-only analysis; live `vercel env ls` not pulled**
- *Cause:* the audit's auto-mode classifier denied the `vercel env ls api` shell call as "sensitive secret metadata"
- *Impact:* required-by-code matrix in `secrets-inventory.md` §6 is the spec; founder must run the verification matrix to confirm live state matches
- *Founder-pending:* run `vercel env ls <project>` for each of the 9 projects and reconcile against §6

**F4.2 — MEDIUM: `mas-*` `.env.local.example` files are over-listed copy-paste of mas-2048**
- The 6 game-app examples list `CDP_*`, `X402_*`, `ADMIN_API_TOKEN` (sometimes), `CRON_SECRET`, etc. — none of which are read in 5 of those 6 apps. Operator confusion surface during provisioning + rotation
- *Recommendation:* trim each `.env.local.example` to the actual read set OR split into a shared `common.env.example` + per-app supplements

**F4.3 — MEDIUM: Mystery Vercel project `node_modules` exists**
- *Cause hypothesis:* stray `vercel link` from inside `apps/api/.vercel/output/functions/api/index.func/node_modules/` during prebuilt-bundle work
- *Impact:* unknown — no `vercel.json`, no CI workflow, no script references this project
- *Founder remediation:* `vercel inspect node_modules` → `vercel domains ls --scope simpl3s-projects` → if clear: `printf 'y\n' | vercel projects rm node_modules` per `reference_vercel_cli_project_rm.md`

**F4.4 — LOW: `NEXT_PUBLIC_SUPABASE_URL` re-used in service path**
- *File:* `packages/lib-shared/src/supabase.ts:40` reads `NEXT_PUBLIC_SUPABASE_URL` for the SERVICE client. Not strictly a bug (URL is not secret) but complicates the Vercel-env mental model
- See also F3.2 (apps/api uses bare `SUPABASE_URL` — naming drift)

**F4.5 — LOW: `NEXT_PUBLIC_*` re-used in apps/api**
- *File:* `apps/api/src/lib/contracts-vendored/addresses.ts:23,49` reads `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_USDC_ADDRESS` in a Hono server with no browser surface. Cosmetic; normalize pre-audit

**F4.6 — LOW: Optional `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` fallback in client path**
- *File:* `packages/lib-shared/src/rpc.ts:34`; `apps/2048/src/app/api/admin/system-health/route.ts:76`
- If a paid Alchemy URL is ever set here, it ships in the client bundle
- *Recommendation:* drop the `NEXT_PUBLIC_*` RPC fallback unless an explicit client-side use case exists

### §4.3 — Mainnet drift / rotation list (Phase 2)

Per `project_phase2_mainnet_sprint_x8_ultrareview.md`, the following must rotate on cutover. Categorized; full per-app matrix in `secrets-inventory.md` §6.

**Chain ID swap:** `NEXT_PUBLIC_CHAIN_ID` 84532→8453; `X402_NETWORK` `eip155:84532`→`eip155:8453`.

**Contract address re-pointing:** all `NEXT_PUBLIC_*_ADDRESS`, `ERC8004_REGISTRY_ADDRESS`. USDC swaps from testnet `0x036CbD53...DCF7e` to mainnet `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Sanctions oracle swaps from `MockSanctionsOracle` to **Chainalysis `0x40C57923924B5c5c5455c48D93317139ADDaC8fb`** per `packages/contracts/src/addresses.ts:98-101`.

**RPC + facilitator:** `BASE_SEPOLIA_RPC_URL` → mainnet equivalent; `BASE_SEPOLIA_WRITE_RPC_URL` → Alchemy/QuickNode mainnet; `X402_FACILITATOR_URL` → CDP mainnet `https://api.cdp.coinbase.com/platform/v2/x402` (apps/api/.env.example:95-99 documents this swap).

**Wallet rotations (per role-distinct invariant `contracts/deployments/wallets-base-sepolia.md`):**
- `STUDIO_PRIVATE_KEY` — rotate; current trustedSigner `0xA24f9122…0975692`
- `AGENT_PRIVATE_KEY` — rotate
- `X402_PAY_TO` / `X402_RECEIVER_ADDRESS` — rotate
- Deployer EOAs `0x3a4F9eB7…` (TournamentPool), `0x84F4610e…` (ChallengeEscrow) — generate fresh mainnet keypairs
- `feeVault` `0x455536e4…` (post-X19b) — rotate

**Env-boundary secret rotation:** `JWT_SECRET`, `SIWA_RECEIPT_SECRET`, `CRON_SECRET`, `ADMIN_API_TOKEN`, `CDP_API_KEY_*`, `CDP_PAYMASTER_URL`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` (Supabase project decision: same project or new mainnet project?).

**Drop:** `NEXT_PUBLIC_TOURNAMENT_POOL_ADDRESS` (v1, rollback-only).

---

## §5 — GitHub Actions Workflows

**Scope:** `.github/workflows/agent-runner.yml` + `.github/workflows/ci.yml`.

### §5.1 — Per-workflow summary

| Workflow | Triggers | `permissions:` | Secrets used | Runners |
|---|---|---|---|---|
| `ci.yml` | `pull_request` to main, `push` to main | **not declared** (inherits repo default = `read`, see F6.3) | none | `ubuntu-latest`, 4 parallel jobs (typecheck, test-ts, test-foundry, lint) |
| `agent-runner.yml` | `workflow_dispatch` only (schedule commented out) | `contents: read` ✅ | 11 (5 `AGENT_PK_*` + 5 `AGENT_ID_*` + `SKILLOS_BASE_URL`) | `ubuntu-latest`, 5-way matrix, `timeout-minutes: 10` |

### §5.2 — Findings

**F5.1 — HIGH: No GitHub Environment binding for blockchain-key workflow**
- *File:* `.github/workflows/agent-runner.yml` (no `environment:` declaration)
- *Impact:* 5 blockchain PKs sit at repo-scope. A future workflow merged to main could `secrets.AGENT_PK_*` immediately, no further approval. No required-reviewer gate before a `live` run
- *Recommendation:* move `AGENT_PK_*` into a GH Environment named `agent-runner-live` with required-reviewer rule for `live` path only (dry-run can stay open)

**F5.2 — HIGH: Job-wide `env:` exposes all 5 private keys to all 5 matrix jobs**
- *File:* `agent-runner.yml:61-76`
- *Impact:* every matrix run (e.g. `wordle` job) has all 5 AGENT_PKs in process env. A compromised dep in `npm ci` or `npx tsx src/cli.ts` exfiltrates 5x more keys than necessary
- *Recommendation:* move `env:` onto the `Run agent` step only; gate via `AGENT_PK: ${{ secrets[format('AGENT_PK_{0}', matrix.game)] }}`; have `cli.ts` read a single `AGENT_PK`

**F5.3 — MEDIUM: Third-party action `foundry-rs/foundry-toolchain@v1` not SHA-pinned**
- *File:* `ci.yml:99`
- *Impact:* `@v1` is mutable; tag re-point or maintainer compromise injects malicious code into CI
- *Recommendation:* pin to 40-char SHA; refresh quarterly. First-party `actions/*@v4` (×9 references) can stay on major tags

**F5.4 — MEDIUM: No `timeout-minutes:` on `ci.yml` jobs**
- *File:* `ci.yml:43, 58, 92, 107`
- *Impact:* defaults to GitHub's 6-hour cap per job (up to 24 runner-hours per push burned on hung tests / malicious dep)
- *Recommendation:* `timeout-minutes: 15` per job. agent-runner.yml:56 already does this correctly

**F5.5 — MEDIUM: `agent-runner.yml` lacks concurrency control**
- *File:* `agent-runner.yml` (no `concurrency:` block)
- *Impact:* two simultaneous `workflow_dispatch`es race against `api.skillos.network` with the same keys. Per `project_match3_chronic_and_510_outage_post_yc.md`, sponsor wallet drain is already a real failure mode
- *Recommendation:* `concurrency: { group: agent-runner-${{ github.event.inputs.mode }}, cancel-in-progress: false }`

**F5.6 — MEDIUM: npm cache without integrity audit (general GHA cache-poisoning surface)**
- *Files:* `ci.yml:51, 65, 115`; `agent-runner.yml:86`
- *Severity:* MEDIUM — `npm ci` validates `package-lock.json` SHAs so a poisoned cache must match lockfile shasums to land. Main is locked (PR #38 baseline, 2026-05-10) → fork-PR-poison vector is closed
- *Recommendation (defer):* document in pre-mainnet hardening checklist

**F5.7 — LOW: Node pin is major-only (`'20'`)**
- *Files:* `ci.yml:50, 64, 114`; `agent-runner.yml:85`
- *Recommendation:* pin to exact patch (e.g. `'20.18.0'`) OR add `.nvmrc` / `.node-version` and use `node-version-file:`

**F5.8 — LOW: Public-ish values stored as `secrets.*`**
- *Files:* `agent-runner.yml:62, 68-72`
- `SKILLOS_BASE_URL` (public URL — `api.skillos.network`) and 5 `AGENT_ID_*` (uint256, public on-chain) stored as secrets. Functions but bloats rotation surface
- *Recommendation (optional):* migrate to `vars.*`

**F5.9 — LOW: Test file list hard-coded in `ci.yml`**
- *File:* `ci.yml:77-89` (12 explicit test paths)
- New tests added in a future PR won't run unless the workflow is edited alongside. Pairs with `project_x4_uncalled_scripts_pre_merge_smoke.md`
- *Recommendation:* switch to a glob (defer past UR)

**F5.10 — INFO: Wallet split GH ↔ Vercel is correctly scoped**
- `STUDIO_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `X402_RECEIVER_ADDRESS` live in Vercel; `AGENT_PK_*` (5 per-game wallets) live in GitHub. Different wallets, different purposes. Preserve

**F5.11 — INFO: Workflow injection hardening on `agent-runner.yml` is correctly implemented**
- `agent-runner.yml:20-26` (advisory comment) + `:73-76` (env routing) + `:79, 82, 88, 91` (`env.*` in `if:`) — `inputs.game` is never interpolated into a `run:` block. Worth preserving in future refactors

**F5.12 — INFO: No injection surface in `ci.yml`**
- Test file list is fixed string; `concurrency.group` uses GHA-internal metadata. No attacker-controlled input

**F5.13 — INFO: No OIDC (`id-token: write`)**
- Consistent with `reference_apps_api_prebuilt_deploy_only.md` (deploys are CLI-driven from founder's machine)

**F5.14 — INFO: `push` to `main` trigger on `ci.yml` is defensive-in-depth**
- Documented at `ci.yml:30-32` — re-validates after squash-merge + primes npm cache

**F5.15 — INFO (resolved by F6.3): `ci.yml` lacks `permissions:` block**
- *File:* `ci.yml` (entirely absent)
- *Why not HIGH:* repo's `default_workflow_permissions = "read"` (verified via `gh api repos/youngstar-eth/skillos/actions/permissions/workflow`), so `GITHUB_TOKEN` is read-only on every job by default. Still recommended to add the explicit `permissions: contents: read` block for defense-in-depth and to document intent

### §5.3 — Foundry CI gap

`ci.yml:99-101` uses `foundry-rs/foundry-toolchain@v1` with `version: stable` and runs `forge test` on the **default profile** only. Per `project_foundry_dual_profile_phase1_legacy.md`, the 5 phase1-legacy contracts (via_ir=false) are **not tested in CI** — CI doesn't set `FOUNDRY_PROFILE=phase1-legacy`.

*Recommendation (defer past UR):* add a second matrix entry running with `FOUNDRY_PROFILE=phase1-legacy` + pin Foundry to a specific nightly tag.

---

## §6 — GitHub Repo Settings: Security Features, Branch Protection, Secrets Hygiene

### §6.1 — Branch protection on `main`

Verified via `gh api repos/youngstar-eth/skillos/branches/main/protection`:

| Rule | State |
|---|---|
| Required status checks | ✅ 4 contexts (`typecheck`, `test-ts`, `test-foundry`, `lint`), `strict: true` |
| Required PR reviews | `required_approving_review_count: 0` |
| Required code owner reviews | ❌ disabled |
| Required last-push approval | ❌ disabled |
| Required signatures | ❌ disabled |
| `enforce_admins` | ❌ disabled |
| `required_linear_history` | ❌ disabled |
| `allow_force_pushes` | ❌ disabled (✅ — force-push blocked) |
| `allow_deletions` | ❌ disabled (✅ — main can't be deleted) |
| `block_creations` | ❌ disabled |
| `required_conversation_resolution` | ❌ disabled |

Rulesets: `gh api repos/youngstar-eth/skillos/rulesets` returns `[]` — no repository-level rulesets layered on top.

**F6.1 — INFO: Branch protection is solo-founder pragmatic**
- 4 status checks gate every merge to main (good) but `required_approving_review_count: 0` + `enforce_admins: false` means the founder can self-merge after CI passes (intentional given sole-maintainer model). Auditor should note this is conscious choice, not gap. Per `project_skillbase_sprint_push_policy.md`, main has been locked since 2026-05-10 (PR #38) — meaning the only path to main is via PR with passing checks, not direct push, but with zero required approvals

### §6.2 — GitHub security features (4 of 4 disabled)

Verified via `gh api`:

| Feature | State | API response |
|---|---|---|
| Dependabot **alerts** | ❌ disabled | `{"message":"Dependabot alerts are disabled for this repository.","status":"403"}` |
| Secret scanning | ❌ disabled | `{"message":"Secret scanning is disabled on this repository.","status":"404"}` |
| Code scanning | ❌ disabled | `{"message":"Code scanning is not enabled for this repository.","status":"403"}` |
| Vulnerability alerts | ❌ disabled | `{"message":"Vulnerability alerts are disabled.","status":"404"}` |
| Private vulnerability reporting | endpoint returns 404 | unclear |
| Dependabot updates (config file) | ❌ absent (`.github/dependabot.yml` does not exist) | — |

**F6.2 — HIGH: All GitHub-native security features disabled**
- *Impact:* the repo is blind to CVEs in dependencies, leaked secrets on push (which would have caught any future Anvil-key-vs-real-key drift), and SAST findings in code. The dependabot alerts surface is also disabled
- *Cost to enable:* free for private repos under GitHub's standard pricing
- *Recommendation (R6):* enable all four — Dependabot alerts, secret scanning, code scanning, vulnerability alerts. Plus add `.github/dependabot.yml` (sketch in §7.4)

### §6.3 — Default workflow permissions

Verified via `gh api repos/youngstar-eth/skillos/actions/permissions/workflow`:
- `default_workflow_permissions: "read"` ✅
- `can_approve_pull_request_reviews: false` ✅

And `gh api repos/youngstar-eth/skillos/actions/permissions`:
- `enabled: true`
- `allowed_actions: "all"`
- `sha_pinning_required: false`

**F6.3 — INFO: Workflow tokens are read-only by default**
- Resolves what would otherwise be a HIGH finding on `ci.yml` lacking `permissions:`. The repo policy makes the default safe even when individual workflows don't declare

**F6.4 — MEDIUM: `allowed_actions: "all"` + `sha_pinning_required: false`**
- *Impact:* any third-party action can be used without admin allowlist; no enforcement that third-party actions are SHA-pinned
- *Recommendation (defer):* set `allowed_actions: "selected"` + `actions_policy: { github_owned_allowed: true, verified_allowed: true, patterns_allowed: ["foundry-rs/foundry-toolchain@*"] }`; enable `sha_pinning_required: true` once F5.3 is fixed

### §6.4 — GitHub Environments (20)

`gh api repos/youngstar-eth/skillos/environments` lists 20 environments (Preview + Production × 9 Vercel projects + 2 unscoped). All have `protection_rules: []` and `deployment_branch_policy: null` — created by Vercel-GitHub integration, no manual hardening applied. Aligns with F5.1 recommendation to consolidate AGENT_PK_* secrets into a properly-protected environment.

### §6.5 — GH Actions secret count = 11 (verified Sprint X7)

See `secrets-inventory.md` §2 for full table. All created 2026-05-13, never rotated.

---

## §7 — CI/CD Reproducibility + Supply Chain

### §7.1 — Lockfile + installer

| Check | State |
|---|---|
| `package-lock.json` committed at repo root | ✅ (483641 bytes, `lockfileVersion: 3`) |
| Installer in CI | ✅ `npm ci` (deterministic) in all 4 invocations |
| Integrity hashes in lockfile | ✅ 907 `"integrity":` entries |
| `npm install --dry-run --package-lock-only` clean? | ✅ `up to date in 235ms` |
| Workspaces | ✅ `["apps/*", "packages/*"]` |
| Override pins | ✅ `axios: ^1.15.0` everywhere (active CVE-2024-39338 remediation), including under `@coinbase/cdp-sdk` and `axios-retry` |
| `packageManager` field | ✅ `npm@10.9.0` (Corepack-respected; CI doesn't `corepack enable` so drift possible — see F5.7) |

### §7.2 — `.npmrc`

`legacy-peer-deps=true` (documented at `.npmrc:1-11` with full rationale on the `@buildersgarden/siwa` → `@openfort/openfort-node` → `@solana/transaction-confirmation` optional-peer chain). Cross-referenced in memory `reference_pre_push_ci_parity_check.md` and `reference_buildersgarden_siwa_barrel_trap.md`. **Preserve.**

### §7.3 — npm audit

`npm audit --json` on MAS root (2026-05-17):

| Severity | Count |
|---|---|
| info | 0 |
| low | 0 |
| moderate | 6 |
| high | 0 |
| critical | 0 |

All 6 moderate vulns are in the **dev-dependency chain** (vitest → vite → vite-node, plus esbuild and postcss via Next):

| Package | Range | Title |
|---|---|---|
| `esbuild` | ≤0.24.2 | dev server CORS bypass |
| `vite` | ≤6.4.1 | path traversal in optimized deps `.map` |
| `vite-node` | ≤2.2.0-beta.2 | via vite |
| `vitest` | various pre-2.2.0-beta.2 | via vite + vite-node |
| `postcss` | <8.5.10 | XSS via unescaped `</style>` |
| `next` | 9.3.4-canary.0 – 16.3.0-canary.5 | via postcss |

None are production runtime risks. `npm audit`'s `fixAvailable` recommendation to downgrade `next` to 9.3.3 is a known false-positive shape of the tool.

### §7.4 — Dependabot (absent)

`.github/dependabot.yml` does not exist. `.github/` contains only `workflows/`.

Sketch for follow-up PR (NOT applied here):

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly", day: "monday" }
    open-pull-requests-limit: 5
    groups:
      eslint:
        patterns: ["eslint*", "@typescript-eslint/*"]
      next-stack:
        patterns: ["next", "react", "react-dom", "eslint-config-next"]
      viem-wagmi:
        patterns: ["viem", "@wagmi/*"]
    ignore:
      - dependency-name: "axios"  # pinned via overrides
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
```

### §7.5 — Findings

**F7.1 — MEDIUM: No Dependabot configuration** (cross-listed; see F5.x — workflow-side; this is the repo-side)
**F7.2 — INFO: Lockfile + npm ci hygiene is correct.** Preserve `axios` override.
**F7.3 — INFO: `npm audit` is not invoked anywhere in CI.** For a repo handling on-chain value pre-mainnet, consider adding `npm audit --audit-level=high` as a status check in `ci.yml` (would fail builds on any future high/critical CVE).

---

## §8 — Repo History Secret Scan

**Tool:** gitleaks 8.30.1 (default ruleset).
**Scope:** `/Users/inancayvaz/MAS` full history (350 commits, ~18 MB).
**Raw output + triage:** see `repo-history-scan.txt`.

### §8.1 — Summary

| Metric | Value |
|---|---|
| Commits scanned | 350 |
| Bytes scanned | 18,208,985 (18.21 MB) |
| Raw hits | 175 |
| Rules triggered | `generic-api-key` (175 / 175) |
| **True positives** | **0** |
| False positives | 175 |

### §8.2 — Triage classes

| Class | Hits | Where | Why false |
|---|---|---|---|
| Vendored OpenZeppelin test fixtures | 168 | `contracts/lib/openzeppelin-contracts/test/**` | ECDSA / EIP-2098 / ERC-2612 signature fixtures; not SkillOS code |
| Anvil/Hardhat well-known test private key #0 | 1 | `apps/api/test/smoke-x2.ts:37` | Well-known Ethereum dev key; address `0xf39Fd6...92266` is in every public tutorial |
| Farcaster Frame manifest public verifier address | 6 | `apps/{2048,clicker,match3,minesweeper,sudoku,wordle}/src/app/.well-known/farcaster.json/route.ts:20` | 20-byte address (NOT a 32-byte private key); public-by-design per Farcaster Frame spec |

### §8.3 — Coverage gaps

- Dangling commits / packed-refs / reflog: gitleaks scans reachable refs from HEAD by default. For full coverage: `gitleaks detect --source . --log-opts="--all"` plus `git fsck --lost-found`. Not run because no force-pushes have occurred since PR #38 baseline (2026-05-10) and the repo was clean before
- Trufflehog `--only-verified` would call upstream APIs to confirm key validity — not run because zero candidate true positives surfaced

### §8.4 — Finding

**F8.1 — INFO: Git history is clean of true secret leaks**
The discipline documented in `reference_secret_handling_split.md` is upheld in code and in git: wallet keys never enter the repo, service-role keys are `.gitignore`-d, and the only "key-shaped" strings in history are public-by-spec or test fixtures. **Auditor-grade evidence of secret-handling maturity.**

---

## §9 — Aggregate Findings Table

| # | Sev | Title | Cite |
|---|---|---|---|
| F2.1 | HIGH | `v2_sp_snapshots` has no RLS | `v2_20260428_sp_snapshots.sql:20-30` |
| F2.2 | HIGH | `v2_cron_runs` has no RLS | `v2_20260507_cron_runs.sql:25-32` |
| F2.3 | MEDIUM | Permissive `USING (true)` on PII-adjacent SELECT | tournament_entries, solo_runs, x15_payment_attempts |
| F2.4 | MEDIUM | 3 newer policies omit `TO` clause (= `public`, not `anon`) | duel_runs, duel_moves, x15_payment_attempts |
| F2.5 | MEDIUM | Realtime publication exposes payment events to anon | `v4_20260515b…:195-207` |
| F2.6 | LOW | 3 trigger functions have unpinned `search_path` | v2 duels, v2 tournaments, v2 tournament_indexer_state |
| F2.7 | LOW | `v2_sp_snapshots` hex-regex case inconsistency | `v2_20260428_sp_snapshots.sql:23,27` |
| F2.8 | LOW | SIWA nonce DELETE-on-consume — no audit trail | `v3_20260511_siwa_nonces.sql:24-26` |
| F2.9 | LOW | `v2_duels` state-mutation untraceable | `v2_20260421_duels.sql:11-38` |
| F2.10 | LOW | `v2_tournament_solo_runs` immutable-by-comment, not by DB | `v2_20260423_tournament_solo.sql:22-25` |
| F2.11 | LOW | `duel_runs` lacks `updated_at` despite FSM mutations | `v3_20260514_duel_moves.sql:42-76` |
| F2.12 | INFO | payment_attempts enum lock confirmed | `v4_20260515b…:103` |
| F2.13 | INFO | skillos_auth_nonces retains rows indefinitely | `v2_20260510_auth_nonces.sql:23-24` |
| F2.14 | INFO | FK CASCADE divergence intentional | duel_moves vs x15_payment_attempts |
| F2.15 | INFO | idempotent migration uses `DROP TABLE CASCADE` | `v4_20260515b…:55-65` |
| F3.1 | HIGH | Service-role provisioned to 9 Vercel projects | 9× `.env.local.example` |
| F3.2 | HIGH | Env-var naming drift `SUPABASE_URL` vs `NEXT_PUBLIC_SUPABASE_URL` | apps/api vs everything-else |
| F3.3 | MEDIUM | Service-role used for reads with anon-select RLS | tournaments.ts:99, sp-snapshot-status |
| F3.4 | HIGH | No documented rotation procedure | absent: docs/runbooks, docs/security |
| F3.5 | LOW | Barrel export of `getSupabaseBrowser` from server-only pkg | `packages/lib-shared/src/index.ts:9` |
| F3.6 | LOW | Misleading sponsor env.example comment | `apps/sponsor/.env.local.example:23-24` |
| F4.1 | MEDIUM | Live `vercel env ls` not pulled — founder verification matrix pending | classifier-denied |
| F4.2 | MEDIUM | `mas-*` env.local.example is over-listed copy-paste | 6 game apps |
| F4.3 | MEDIUM | Mystery Vercel project `node_modules` exists | `prj_L2HcorTjNPsRn6B3XhX2AXPF7MiK` |
| F4.4 | LOW | `NEXT_PUBLIC_SUPABASE_URL` re-used in service path | `packages/lib-shared/src/supabase.ts:40` |
| F4.5 | LOW | `NEXT_PUBLIC_*` re-used in apps/api | `apps/api/src/lib/contracts-vendored/addresses.ts:23,49` |
| F4.6 | LOW | Optional `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` fallback | `packages/lib-shared/src/rpc.ts:34` |
| F5.1 | HIGH | No GH Environment binding for agent-runner | `agent-runner.yml` (absent) |
| F5.2 | HIGH | Job-wide `env:` exposes all 5 PKs to all 5 matrix jobs | `agent-runner.yml:61-76` |
| F5.3 | MEDIUM | `foundry-toolchain@v1` not SHA-pinned | `ci.yml:99` |
| F5.4 | MEDIUM | No `timeout-minutes:` on `ci.yml` jobs | `ci.yml:43, 58, 92, 107` |
| F5.5 | MEDIUM | `agent-runner.yml` lacks concurrency control | `agent-runner.yml` (absent) |
| F5.6 | MEDIUM | npm cache without integrity audit | `ci.yml:51, 65, 115`; agent-runner.yml:86 |
| F5.7 | LOW | Node pin is major-only `'20'` | `ci.yml:50, 64, 114`; agent-runner.yml:85 |
| F5.8 | LOW | Public-ish values stored as `secrets.*` | `agent-runner.yml:62, 68-72` |
| F5.9 | LOW | Test file list hard-coded | `ci.yml:77-89` |
| F5.10 | INFO | Wallet split GH ↔ Vercel correctly scoped | preserve |
| F5.11 | INFO | Workflow injection hardening correctly implemented | `agent-runner.yml:20-26, 73-76` |
| F5.12 | INFO | No injection surface in `ci.yml` | `ci.yml:14-22, 77-89` |
| F5.13 | INFO | No OIDC `id-token: write` anywhere | both |
| F5.14 | INFO | `push` to `main` re-validation is intentional | `ci.yml:29-33` |
| F5.15 | INFO | `ci.yml` missing `permissions:` — but default is `read` | resolved by F6.3 |
| F6.1 | INFO | Branch protection is solo-founder pragmatic | required-reviews=0 + enforce_admins=false |
| F6.2 | HIGH | All 4 GitHub security features disabled | Dependabot alerts, secret scanning, code scanning, vuln alerts |
| F6.3 | INFO | Workflow tokens default to read-only | `default_workflow_permissions: "read"` |
| F6.4 | MEDIUM | `allowed_actions: "all"` + `sha_pinning_required: false` | repo-level Actions policy |
| F7.1 | MEDIUM | No Dependabot configuration | `.github/dependabot.yml` (absent) — cross-listed |
| F7.2 | INFO | Lockfile + npm ci hygiene correct | preserve axios override |
| F7.3 | INFO | `npm audit` not invoked in CI | consider as status check |
| F8.1 | INFO | Git history clean of true secret leaks (0 / 175) | gitleaks 8.30.1, 350 commits |

**Totals:** 0 BLOCKER · 7 HIGH · 14 MEDIUM · 11 LOW · 11 INFO · **43 findings**.

---

## §10 — Top-Priority Remediation List

Ordered by audit-readiness impact / effort ratio. None of these have been applied in this PR.

| Pri | Finding | Action | Effort |
|---|---|---|---|
| P0 | F2.1, F2.2 | Enable RLS + add policies on `v2_sp_snapshots` and `v2_cron_runs` | 1 migration file, ~20 LOC |
| P0 | F3.4 | Write `docs/runbooks/secret-rotation-supabase.md` (9-project rollover sequence) | ~100 LOC of markdown |
| P0 | F6.2 | Re-enable Dependabot alerts + secret scanning + code scanning + vuln alerts | 4 checkboxes in GitHub UI |
| P1 | F5.1 | Move `AGENT_PK_*` into a GH Environment with required-reviewer rule for `live` mode | ~10 LOC YAML |
| P1 | F5.2 | Scope job `env:` to the `Run agent` step + per-game secret selector | ~5 LOC YAML |
| P1 | F3.2 | Resolve `SUPABASE_URL` ↔ `NEXT_PUBLIC_SUPABASE_URL` naming drift | 1 var rename in apps/api |
| P1 | F4.3 | Diagnose and remove the `node_modules` Vercel project | 3 `vercel` CLI calls |
| P2 | F2.6 | Land the deferred trigger-function search_path cleanup migration | 1 migration file, ~20 LOC |
| P2 | F2.4 | Add `TO anon` to the 3 newer policies that omit it | 1 migration file, ~10 LOC |
| P2 | F5.3 | SHA-pin `foundry-rs/foundry-toolchain@v1` | 1 line in `ci.yml` |
| P2 | F5.4 | Add `timeout-minutes: 15` to each ci.yml job | 4 lines |
| P2 | F5.5 | Add `concurrency:` block to `agent-runner.yml` | 3 lines |
| P2 | F7.1 | Add `.github/dependabot.yml` | ~25 LOC YAML |
| P3 | F3.3 | Use anon-keyed client for anon-select reads in apps/api routes | 1 module + 3-4 call-site updates |
| P3 | F3.5 | Add `import "server-only";` to `packages/lib-shared/src/supabase.ts` | 1 line |
| P3 | F4.2 | Trim 6 `mas-*/.env.local.example` to actual consumption | 6 files |

Estimated total effort to clear all P0+P1: ~1-2 dev-days (mostly review-and-merge).

---

## §11 — Open Questions for External Auditor / Founder

Items requiring information outside the repo:

### §11.1 — Live state required (founder action)

1. Run `vercel env ls <project>` for each of 9 projects; reconcile against `secrets-inventory.md` §6 matrix. Specifically:
   - Is `ADMIN_API_TOKEN` set on `mas-2048`? (Required by `system-health/route.ts:92`; **not** in env.example)
   - Is `AGENT_PRIVATE_KEY` set on `api`? (Per `project_x15_6_agent_private_key_vercel_gap.md`, this was a historic deploy gap)
   - Is `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS` set on `skillbase-orchestrator`? (Anchor cron 500s if unset)
   - Are `STUDIO_PRIVATE_KEY` + `SUPABASE_SERVICE_ROLE_KEY` present on all 5 non-2048 mas-* apps?
2. `vercel inspect node_modules` — confirm `node_modules` is a dead project before `vercel projects rm`
3. Confirm `X402_TEST_WALLET_PRIVATE_KEY` is NOT set on any Vercel project's Production env
4. `VERCEL_GIT_COMMIT_SHA` injection works on all 8 projects (one-line confirmation via `/api/health`)

### §11.2 — Supabase live-DB inspection required (auditor)

1. `\dt public.*` — reconcile against the 16 tables enumerated in §2 (catch out-of-band tables)
2. `SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'` — confirm `BYPASSRLS`
3. `SELECT * FROM pg_publication WHERE pubname='supabase_realtime'` — confirm publication ACLs
4. `SELECT * FROM information_schema.role_table_grants WHERE table_schema='public'` — catch out-of-migration grants
5. `SELECT proname, prosecdef, proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace` — catch dashboard-added RPC functions
6. Confirm RLS-on-no-policies tables (`v2_sponsor_indexer_state`, `v2_tournament_indexer_state`, `skillos_auth_nonces`, `skillos_siwa_nonces`) have no `GRANT … TO anon` issued out-of-band

### §11.3 — Open design questions

1. Was `v2_sp_snapshots` RLS-absent intentional (e.g., to allow a future write path?) or an oversight?
2. Was `v2_cron_runs` RLS-absent intentional or oversight? (Harder to justify as intentional given the `v2_sponsor_indexer_state` precedent of RLS-on-no-policies)
3. Policy `TO` clause convention: was the v2→v3/v4 drift deliberate? Will `authenticated` ever have distinct rights from `anon`?
4. `plausibility_check.reasoning` text — is there review / redaction of LLM-generated text before it reaches the anon-readable path?
5. `x15_payment_attempts.error_message` — is there a documented server-side redaction filter for sensitive infra details (RPC hostnames, facilitator account IDs)?
6. GDPR / right-to-erasure posture: hard-DELETE only is the current posture, with CASCADE on `x15_payment_attempts` but not on `duel_moves`. Is this the documented compliance plan?
7. Off-branch migration `v4_20260515b` — confirm normal PR-merge path before any rebase of `main` over a branch that doesn't yet have it
8. Is the Supabase rotation cadence: rotate `service_role` + `CRON_SECRET` jointly to limit blast radius (currently single shared CRON_SECRET between api + orchestrator)?
9. Apex frontend status name rename (per `project_x15_8_payment_attempts_schema_lock.md` — X15.5 apex rename PR still OPEN). Auditor should note prod DB and apex still use different vocabulary for the `x15_payment_attempts.status` column

---

## §12 — What This Audit Did NOT Cover

- **Smart-contract security** — out of scope; covered by external Foundry audit (Sprint X9 kickoff)
- **Frontend XSS / CSRF** — out of scope (Track B/C of UR Pass 1)
- **Runtime behavior verification** — no curl-based endpoint exercise; only static analysis + repo-state APIs
- **Mainnet RPC provider DDoS resistance** — out of scope; Phase 2 mainnet readiness
- **Hosting-provider compliance (SOC2, ISO 27001)** — Vercel + Supabase + GitHub provide these; not re-validated here

---

**End of findings.** Companion deliverables: `secrets-inventory.md` (redacted), `repo-history-scan.txt` (gitleaks raw + triage).
