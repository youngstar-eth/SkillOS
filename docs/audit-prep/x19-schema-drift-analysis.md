# X19 Schema Drift — Scope Confirmation

**Status:** Investigation complete · read-only
**Branch:** `investigate/x19-schema-drift` (based on `origin/main` @ `34b52eb`)
**Prod project:** Supabase `clizuqvtkekzxiflbsyr` (`db.clizuqvtkekzxiflbsyr.supabase.co`)
**Date:** 2026-05-17
**Author:** Audit-prep sprint, ahead of external X9 auditor kickoff

---

## TL;DR

**Drift is real and multi-source. Scope is larger than the single-migration framing in the X15.8 memory.**

| Class | Count | Severity | Remediation effort |
|---|---|---|---|
| A1 — Pre-rebrand registry-tracked, file deleted | 3 | Medium | Restore from git history (≤ 0.5 d) |
| A2 — Pre-rebrand orphan tables, no registry row | 4 | High | Reverse-engineer + backfill (1–2 d) |
| B — Committed file, no registry row, table applied off-track | 1 | Medium | Re-apply via MCP for registry catch-up (0.5 d) |
| C — Recent MCP apply, file uncommitted in git | 1 | Low | Cherry-commit file from parent checkout (< 0.1 d) |
| D — Branch-staleness illusion (not real drift) | 1 | — | Note in methodology doc only |
| **Total drift items** | **9** | | **3–5 d sprint** |

The 3-5 day sprint estimate in the brief **holds** if A2 reverse-engineering goes cleanly. Add 1–2 days of buffer if the orphan `challenges` / `payouts` schemas diverge from the historical SQL.

---

## Methodology

1. Pulled prod migration registry via Supabase MCP `list_migrations` against project `clizuqvtkekzxiflbsyr`.
2. Diffed registry against `git ls-tree -r origin/main supabase/migrations/`.
3. For every gap, traced root cause via `git log --all --diff-filter=AD -- supabase/migrations/<file>`.
4. For tables created without a registry entry, confirmed presence with `list_tables` + column count from `information_schema.columns`.
5. **Did NOT run `pg_dump`** — not installed locally, and the registry-vs-files diff turned out sharper than schema-text diff for answering the scope question. Schema-text diff is a remediation tool, not a discovery tool.

> **Methodology note.** The first attempt diffed against the current working branch (`docs/strategy/one-pager`), which was 3 commits behind `origin/main` — that branch lacked `v4_20260515c_duel_runs_end_reason.sql` and produced a phantom drift entry. **Always diff against `origin/main`**, never against the current working branch. See lock policy §3.

---

## Drift inventory

### Class A1 — Pre-rebrand migration, registry row exists, file deleted (3)

All three were created during Phase 1 (April 2026) and deleted as a single batch in commit `0dba6bf chore: skillbase v2 clean scaffold` during the SkillOS rebrand. Prod still holds their resulting tables and data.

| Registry version | Name | Source commit (now deleted) | Tables in prod (row count) |
|---|---|---|---|
| `20260418000000` | `ai_layer` | `2a7e7b5 feat: AI layer — daily challenges + AI coach on 3 pilot games` | `daily_challenges` (3), `ai_analyses` (14), and likely `users` (0), `game_sessions` (0) |
| `20260418120000` | `leaderboard` | `711a1fc feat: 3-tier leaderboard system + daily payout cron + landing /leaderboard page` | `game_scores` (14), `daily_ranks` (2), `daily_aggregates` (4), `payouts` (4) |
| `20260418130000` | `aggregates_nulls_not_distinct` | `711a1fc` (follow-up) | Alters `daily_aggregates` (UNIQUE NULLS NOT DISTINCT constraint) |

Statements **are intact in the registry** (`statements_len` 3232 / 8427 / 794 bytes — confirmed via direct SQL on `supabase_migrations.schema_migrations`).

**SQL excerpt (`ai_layer`, head):**
```
-- Skillbase AI layer — daily challenges + AI coach analyses.
-- Two tables:
--   daily_challenges : one row per (game, date). Cron populates; games read.
--   ai_analyses     : cached post-run AI coach narrations
```

**SQL excerpt (`aggregates_nulls_not_distinct`):**
```
-- Replace the functional COALESCE(category,'') index on daily_aggregates with
-- a `UNIQUE NULLS NOT DISTINCT` constraint (Postgres 15+) so PostgREST upsert
-- with `onConflict: "user_address,scop[e,date]"` lands deterministically.
```

**Remediation:**
1. `git show 2a7e7b5:supabase/migrations/20260418000000_ai_layer.sql` → restore under canonical name `v1_20260418_ai_layer.sql`
2. Same for the other two.
3. **Do not re-apply** — they are already in the registry; restoring files only re-establishes the truth source.
4. PR title: `chore(audit-prep): restore pre-rebrand migration files for git/prod parity`.

**Risk if not addressed:** new contributors cannot rebuild prod schema from migrations. Auditor will flag the `users` / `daily_challenges` / `payouts` table definitions as unreviewable.

---

### Class A2 — Pre-rebrand migration, NO registry row, orphan table on prod (4)

The same `0dba6bf` rebrand commit deleted four more `.sql` files that **were never tracked through the Supabase migrations registry**, yet their resulting tables exist on prod with live data and altered schemas.

| Deleted file (per `0dba6bf` diff) | Lines | Resulting prod table (cols / rows) |
|---|---|---|
| `20260419000000_payouts_instant_scope.sql` | 38 | `payouts` (13 cols, 4 rows) — alters leaderboard's `payouts` |
| `20260419120000_challenges.sql` | 99 | `challenges` (25 cols, 0 rows) — CREATE TABLE |
| `20260419180000_challenges_preplay_duel.sql` | 63 | `challenges` (alter — preplay duel state) |
| `20260419200000_challenges_onchain_escrow.sql` | 39 | `challenges` (alter — on-chain escrow) |

**These tables were applied via a non-CLI path** (Supabase dashboard SQL editor or one-off `psql`), bypassing `supabase_migrations.schema_migrations`. Same root cause pattern as the X4 SIWA migration misapply incident (see memory `project_x4_siwa_migration_target_misapply.md`).

**Forensic evidence:** `challenges` table has 25 columns. Original `challenges.sql` (99 lines, lines roughly ≈ 1 col + DDL overhead) plausibly creates 18–20 cols; the +5–7 cols match the two follow-up alter files. Strongly suggests all four were applied.

**Remediation (largest single chunk of the sprint):**
1. Pull canonical SQL from git history: `git show 0dba6bf^:supabase/migrations/20260419000000_payouts_instant_scope.sql` (and three peers).
2. Introspect prod tables (`information_schema.columns` + `pg_indexes` + `pg_policies`) to confirm the historical SQL still matches reality.
3. Compose forward-only `v1_20260419_*.sql` migrations equivalent to the four originals.
4. Insert registry rows manually via `apply_migration` with idempotent guards (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) so a re-run is a no-op on prod but fully populates a fresh local environment.
5. Verify with a fresh local `supabase db reset` → `pg_dump` → spot-check `challenges`/`payouts` against prod.

**Risk if not addressed:** any future contributor who runs `supabase db reset` locally will have a database missing `challenges` and a payouts table missing 5–7 columns. CI tests against a local Supabase will silently pass while staging blows up.

---

### Class B — File committed to git, no registry row, table applied off-track (1)

| File on `origin/main` | Table in prod | Registry row? |
|---|---|---|
| `supabase/migrations/v2_20260510_auth_nonces.sql` (committed in `3cdbbde feat(api): Layer 1B writes + SIWB human auth (Sprint X2) (#62)`) | `skillos_auth_nonces` (5 cols, 13 rows) | **None** — no `20260510*` version in registry |

The migration file exists on disk and is canonically committed, but `supabase_migrations.schema_migrations` has no `20260510` version row. The table was clearly created (13 active nonces) — applied via dashboard SQL editor, `execute_sql`, or one-off CLI invocation that bypassed `db push`.

**Same root-cause family as A2**, but caught earlier in the rebrand cycle so the file survived in git.

**Remediation:**
1. Re-run the SQL via MCP `apply_migration` with version `20260510000000`. The migration is fully idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) — re-apply is a no-op on prod but populates the registry.
2. PR title: `fix(audit-prep): backfill schema_migrations row for v2_20260510_auth_nonces`.

**Risk if not addressed:** the same `supabase db reset` problem as A2 — local devs get a fresh DB without `skillos_auth_nonces`, all `/v1/auth/siwb/*` flows break locally.

---

### Class C — Recent MCP apply, file uncommitted in git (1)

| File (parent checkout, untracked) | Registry row | Memory reference |
|---|---|---|
| `supabase/migrations/v4_20260515b_x15_payment_attempts_canonical_lock.sql` | `20260515173813` (statements_len 2864) | `project_x15_8_payment_attempts_schema_lock.md` — applied 2026-05-15 |

The file lives in the parent checkout at `/Users/inancayvaz/MAS/supabase/migrations/` but was never `git add`'d. Memory confirms it was applied via the Supabase MCP `apply_migration` directly on the canonical-schema-lock follow-up. Apply path was clean (registry has both statements and idempotency_key); only the source-of-truth file slipped through git.

**Remediation (smallest, cheapest):**
1. `git add supabase/migrations/v4_20260515b_x15_payment_attempts_canonical_lock.sql` from the parent checkout (copy into the audit-prep branch first if cross-worktree).
2. PR title: `fix(audit-prep): commit v4_20260515b canonical lock migration (applied 2026-05-15)`.
3. **NOT included in this X19 PR** — scope is read-only investigation. Queue as the first remediation PR.

**Risk if not addressed:** low — the file is in the parent checkout, so the local environment hash isn't drifting. But future contributors on a fresh clone get a different prod-vs-local picture than the founder.

---

### Class D — Branch-staleness illusion (NOT real drift)

| Apparent drift | Reality |
|---|---|
| `v4_20260515c_duel_runs_end_reason.sql` missing from working tree | Present on `origin/main` (commit `24ac566` PR #96). My initial diff was against `docs/strategy/one-pager` which is 3 commits behind. |

**Methodology fix:** always diff against `origin/main` after `git fetch origin`. Documented in lock policy §3.

---

## Sprint scope confirmation

**Original brief estimate:** 3–5 d (single drift) or larger.
**Confirmed estimate:** **3–5 d** if A2 reverse-engineering proceeds cleanly (see below); **5–7 d** if the introspect-vs-history check uncovers orphan-table column-level divergence.

**Why the wider band:**
- A1 (3 files) — flat 0.5 day of `git show` + commit
- A2 (4 files + 2 tables) — 1–2 days, dominated by introspection + idempotent rewrite + dry-run validation
- B (1 file) — 0.5 day of MCP re-apply + verify
- C (1 file) — < 0.1 day
- **Buffer for surprises:** 1 day (e.g., if `challenges` has columns NOT explained by the 3 known files, indicating a 5th lost migration)

**Suggested sprint breakdown:**
- Day 1: Class A1 + Class C remediation PRs (low-risk warmup, validates pipeline)
- Day 2–3: Class A2 introspection + canonical SQL composition
- Day 4: A2 dry-run on a Supabase preview branch + apply
- Day 5: Class B re-apply + verification + lock policy CI check shipped

---

## Lock policy proposal

> Goal: prevent any new drift entering this state. Two categories: **detect** (catch drift early) and **prevent** (block the drift-creating actions).

### §1 — Branch protection

`supabase/migrations/` is already implicitly protected by `main` branch protection (per memory `project_skillbase_sprint_push_policy.md` — branch protection enforced from PR #38 on 2026-05-10). **No change needed** — but verify scope explicitly:

- [ ] CODEOWNERS: add an entry pinning `supabase/migrations/` to founder review on every PR.
- [ ] Require linear history for `main` so migration ordering is unambiguous.

### §2 — CI check (drift detector)

Add `.github/workflows/schema-drift-check.yml`:
- Triggered on PR + nightly cron.
- Runs (against Supabase prod):
  1. `list_migrations` via service-role auth → set of `(version, name)`
  2. `ls supabase/migrations/` → expected set, derived by parsing filename prefix → `(YYYYMMDDhhmmss, slug)`
  3. Symmetric diff. **Fail** if non-empty.
- Output: a JSON report attached to the PR comment, listing each delta with provenance hints.

**Open question (founder decision):** which Supabase project does the cron auth against? Production prod, or a staging mirror that also enforces this? **Recommendation A:** prod only — staging is allowed to drift since it's a sandbox. **Recommendation B:** both, with separate budgets — drift on staging is a P2 warning, drift on prod is a P0. *Leaning A for sprint shipping; B for steady-state.*

### §3 — Local-development pre-flight check

Add `scripts/check-schema-parity.ts` (run via `npm run check:schema-parity`):
- Same diff logic as §2 but reads the registry through the developer's local Supabase token.
- Fails closed if the developer's local branch is behind `origin/main` (catches the same illusion that bit this investigation — see Class D).
- Wire into the existing pre-push hook (memory `reference_pre_push_ci_parity_check.md`) so `git push` fails fast if a migration is missing.

### §4 — Migration creation policy

Codify in `docs/contributing/migrations.md` (new file, to ship in the X19 remediation sprint, not this PR):
1. **No dashboard SQL editor for schema changes.** Period. Use `supabase db push` or MCP `apply_migration` only. (Same lesson as the X4 SIWA misapply.)
2. **Every applied migration MUST land in git in the same PR.** Reviewers reject PRs that show MCP apply receipts without a corresponding committed file.
3. **Filename convention enforced by linter:** `v{phase}_{YYYYMMDD}[suffix]_{snake_slug}.sql`. The CI check parses this; mismatched filenames fail PR check.
4. **Forward-only.** No `DROP COLUMN` / `DROP TABLE` on prod-shared tables without a 2-PR sequence (deprecate read path → drop after one sprint).

### §5 — Incident runbook (`docs/runbooks/schema-drift-detected.md`)

When the §2 CI check fires:
1. **Don't auto-remediate.** Triage owner identifies which side is canonical (prod or repo) — both have legitimate reasons to be ahead.
2. **Capture provenance:** check `supabase_migrations.schema_migrations.created_by` (populated by MCP) — tells you who/what applied it.
3. **Reconcile:**
   - Prod ahead, no file: pull the SQL from registry's `statements` column, commit as new file, do NOT re-apply.
   - File ahead, no registry row: `apply_migration` to backfill the registry, verify table state matches the SQL.
4. **Post-mortem template** stub: "What apply path bypassed git? What rule in §4 prevents the next one?"

---

## Appendix A — Raw registry vs filesystem diff

**Prod registry (`list_migrations`, 21 entries):**
```
20260418000000  ai_layer
20260418120000  leaderboard
20260418130000  aggregates_nulls_not_distinct
20260421000000  v2_20260421_duels
20260422000000  v2_20260422_coach_cache
20260422000001  v2_20260422_plausibility_check
20260422000002  v2_20260422_recap_cache
20260422000003  v2_20260422_tournaments
20260423000000  v2_20260423_tournament_solo
20260424083834  v2_20260424_solo_ai_cache
20260424100717  v2_20260424_user_stats
20260428000000  v2_20260428_sp_snapshots
20260429143805  v2_20260429_sponsor_contributions
20260429143917  v2_20260429_sponsor_function_search_path
20260507000000  v2_20260507_cron_runs
20260508034653  v2_20260508_tournament_indexer
20260511165714  v3_20260511_siwa_nonces
20260514220037  v3_20260514_duel_moves
20260515162835  v4_20260515_x15_payment_attempts
20260515173813  v4_20260515b_x15_payment_attempts_canonical_lock
20260515194637  v4_20260515c_duel_runs_end_reason
```

**`origin/main` filesystem (18 files):**
```
v2_20260421_duels.sql              ← matches 20260421000000
v2_20260422_coach_cache.sql        ← matches 20260422000000
v2_20260422_plausibility_check.sql ← matches 20260422000001
v2_20260422_recap_cache.sql        ← matches 20260422000002
v2_20260422_tournaments.sql        ← matches 20260422000003
v2_20260423_tournament_solo.sql    ← matches 20260423000000
v2_20260424_solo_ai_cache.sql      ← matches 20260424083834
v2_20260424_user_stats.sql         ← matches 20260424100717
v2_20260428_sp_snapshots.sql       ← matches 20260428000000
v2_20260429_sponsor_contributions.sql       ← matches 20260429143805
v2_20260429_sponsor_function_search_path.sql ← matches 20260429143917
v2_20260507_cron_runs.sql          ← matches 20260507000000
v2_20260508_tournament_indexer.sql ← matches 20260508034653
v2_20260510_auth_nonces.sql        ← NO MATCH (Class B)
v3_20260511_siwa_nonces.sql        ← matches 20260511165714
v3_20260514_duel_moves.sql         ← matches 20260514220037
v4_20260515_x15_payment_attempts.sql           ← matches 20260515162835
v4_20260515c_duel_runs_end_reason.sql          ← matches 20260515194637
```

**Untracked in parent checkout (1 file):**
```
v4_20260515b_x15_payment_attempts_canonical_lock.sql  ← matches 20260515173813 (Class C)
```

**Symmetric diff:**
- In registry, missing on `origin/main`: `ai_layer` (A1), `leaderboard` (A1), `aggregates_nulls_not_distinct` (A1), `v4_20260515b_x15_payment_attempts_canonical_lock` (C)
- On `origin/main`, missing in registry: `v2_20260510_auth_nonces` (B)
- **Plus orphan tables (Class A2)**: 4 tables (`payouts`, `challenges`, and column-level alters) have no registry row AND no file. Discovered via `list_tables` cross-check, not via the symmetric diff.

---

## Appendix B — Adjacent findings (not in X19 scope)

1. **`v2_sp_snapshots` RLS disabled** (Supabase critical advisory). Intentional per memory `project_skillbase_sprint_push_policy.md` rationale ("Public read for AI lab verification"), but commit `e1ad9f7 fix(supabase): enable RLS on v2_sp_snapshots + v2_cron_runs` (presumably merged) suggests there was an attempt to enable it that did not stick. Worth a separate ticket to either (a) update the commit message if intentional or (b) re-apply if the RLS-enable migration was lost.
2. **Provenance forensics suggestion:** populate `created_by` retroactively on the 3 Class A1 entries (currently NULL because they predate MCP-based applies) — would prevent future investigators from re-confirming "this was applied through what path".
3. **Schema_migrations table schema:** has `idempotency_key` and `rollback` columns that the CI check (§2) can use as a richer drift signal — e.g., flag NULL idempotency_key + non-NULL statements as "applied via raw SQL, not via apply_migration".

---

## Appendix C — Commands used (reproducible)

```bash
# Branch state
git rev-parse origin/main
git ls-tree -r origin/main supabase/migrations/

# Deletion forensics
git log --all --oneline --diff-filter=AD -- 'supabase/migrations/*ai_layer*'
git show --stat --oneline 0dba6bf -- supabase/migrations/

# Add-history forensics
git log --all --oneline --name-status -- 'supabase/migrations/v4_20260515c*'
```

**Supabase MCP (project `clizuqvtkekzxiflbsyr`):**
- `list_migrations`
- `list_tables`
- `execute_sql` (against `supabase_migrations.schema_migrations` and `information_schema.columns`)

No DDL was executed against prod during this investigation.
