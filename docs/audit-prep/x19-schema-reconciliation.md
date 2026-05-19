# X19 Schema Reconciliation — Sprint Deliverable

**Status:** Implementation complete · pending founder-gated production apply
**Branch:** `feat/x19-schema-reconciliation` (based on `origin/main` @ `f666e6c`)
**Prod project:** Supabase `clizuqvtkekzxiflbsyr`
**Date:** 2026-05-19
**Driver doc:** [`x19-schema-drift-analysis.md`](./x19-schema-drift-analysis.md) (PR #110 — investigation)

---

## What this PR delivers

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Class A2 backfill migrations (4 files) | ✅ Written, **pending pre-apply MCP verification** |
| 1 | Class C committed (`v4_20260515b` x15_payment_attempts canonical lock) | ✅ Committed |
| 2 | Class B registry catch-up (`v2_20260510_auth_nonces`) | ⏸ **Founder-gated MCP apply** — see Phase 7 below |
| 3 | CI drift-check workflow (`.github/workflows/schema-drift-check.yml`) | ✅ Written; gated on secret presence |
| 4 | `CODEOWNERS` (founder-pinned for migrations / contracts / hooks) | ✅ Created |
| 5 | Husky pre-push hook (stale-main detector, v1.6 §3.19 Pattern 4) | ✅ Written; activates on `npm install` |
| 6 | Integration test (file presence + idempotency markers + sh-syntax) | ✅ Written |
| 7 | Production migration apply | ⏸ **Founder-gated** — see runbook below |

PR #110's recommended sequential PR order (C → A1 → B → A2) is **bundled** here per the X19 sprint scoping. A1 (3 items: `ai_layer`, `leaderboard`, `aggregates_nulls_not_distinct`) is **deliberately out of scope** per the sprint brief — task framing was 4 A2 + B + C + D (pattern). A1 remains queued as a follow-up.

---

## Class A2 migrations — pre-apply verification gate

The 4 A2 backfill migrations are written as **idempotent restorations** of the pre-rebrand SQL recovered from `git show 0dba6bf^:supabase/migrations/…`. They are designed to be:

- A **no-op on prod** (where the tables + constraints already exist in final state).
- A **full rebuild on fresh local DBs** (where `supabase db reset` produces the same shape as prod).

### Founder must verify BEFORE running `apply_migration` on prod

Each file has a "Pre-apply verification REQUIRED" block in its header. Concrete steps per migration:

#### `v1_20260419_payouts_instant_scope.sql`
```sql
-- Via Supabase MCP execute_sql:
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.payouts'::regclass AND conname = 'payouts_scope_check';
-- Expected: scope IN ('game','category','overall','instant','challenge')
-- If 'instant' present → migration no-ops the constraint widen.
```

#### `v1_20260419_challenges.sql`
```sql
SELECT count(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='challenges';
-- Expected: 25 (per PR #110 inventory).

SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.payouts'::regclass AND conname = 'payouts_scope_check';
-- Expected: must include 'challenge' already (from off-track prod state).
```

#### `v1_20260419_challenges_preplay_duel.sql`
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.challenges'::regclass AND conname = 'challenges_status_check';
-- Expected: 11-value set (pending_creator_stake, open, accepted,
--   creator_played, challenger_played, both_played, settled,
--   expired_refunded, walkover_creator, walkover_challenger, cancelled).

SELECT is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='challenges' AND column_name='creator_score';
-- Expected: YES (relaxed).
```

#### `v1_20260419_challenges_onchain_escrow.sql`
```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='challenges'
   AND column_name IN ('onchain_id','onchain_create_tx_hash',
     'onchain_accept_tx_hash','onchain_settle_tx_hash',
     'contract_address','settle_signature');
-- Expected: 6 rows.
```

### After verification: apply order

```
1. mcp apply_migration version=20260419000000 name="v1_20260419_payouts_instant_scope"   ← scope widen
2. mcp apply_migration version=20260419120000 name="v1_20260419_challenges"              ← table + scope widen for 'challenge'
3. mcp apply_migration version=20260419180000 name="v1_20260419_challenges_preplay_duel" ← 11-state status + creator_score nullable
4. mcp apply_migration version=20260419200000 name="v1_20260419_challenges_onchain_escrow" ← 6 on-chain columns + indexes
```

Each application registers a row in `supabase_migrations.schema_migrations`, closing the A2 audit-trail gap.

### Class B apply (after A2)

```
5. mcp apply_migration version=20260510000000 name="v2_20260510_auth_nonces"
   (uses the existing supabase/migrations/v2_20260510_auth_nonces.sql verbatim)
```

The file is fully idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`); re-apply on prod is a no-op but populates the registry.

---

## CI drift-check workflow — required secrets

Before the workflow becomes an active gate (currently soft-skips), founder must provision:

```
gh secret set SUPABASE_PROJECT_REF      --body 'clizuqvtkekzxiflbsyr'
gh secret set SUPABASE_SERVICE_ROLE_KEY --body '<jwt with SELECT on supabase_migrations.schema_migrations>'
```

Per memory `reference_secret_handling_split`: service-role keys are agent-acceptable to set when length-verified.

---

## Pre-push hook — activation

The hook ships as a file in `.husky/pre-push`. It activates on every developer's machine the next time `npm install` runs — the `prepare: git config core.hooksPath .husky` script in `package.json` points git at the in-repo hook directory. No external `husky` dep is added (keeps `package-lock.json` untouched in this PR; the activation mechanism is one git config line). Existing worktrees won't pick the hook up until they re-install — providing a natural grandfather window for the 30+ in-flight worktrees.

**Bypass (rare):** `git push --no-verify` skips the hook. Use only when intentionally pushing without an `origin/main` refresh (typically only when offline).

---

## Migration creation policy (X19 §4 — referenced)

PR #110 §4 codifies four rules:

1. **No dashboard SQL editor for schema changes.** Use `supabase db push` or MCP `apply_migration` only.
2. **Every applied migration MUST land in git in the same PR.** Reviewers reject PRs that show MCP apply receipts without a corresponding committed file.
3. **Filename convention:** `v{phase}_{YYYYMMDD}[suffix]_{snake_slug}.sql`.
4. **Forward-only.** No `DROP COLUMN` / `DROP TABLE` on prod-shared tables without a 2-PR sequence.

This sprint does not codify those into a `docs/contributing/migrations.md` (out of scope per the X19 task framing) but enforces them via:
- **CODEOWNERS** (rule 1 + 2 — founder review catches off-track applies)
- **CI drift check** (rule 1 + 2 — symmetric diff fails when an apply happens without a file)
- **Pre-push hook** (rule 2 — stale-main guard prevents the diff-against-wrong-baseline class of errors)

---

## Test plan

- [ ] Founder runs `npm install` + `npx tsx --test packages/duel-backend/test/x19-schema-integrity.test.ts` → all assertions pass.
- [ ] Founder verifies each A2 migration's pre-apply gate per "Class A2 migrations" section above.
- [ ] Founder runs the 5-step apply sequence via Supabase MCP, in order.
- [ ] Post-apply: `mcp list_migrations` shows 26 rows (21 pre-X19 + 5 new).
- [ ] Founder provisions the two GitHub secrets so the CI gate becomes active.
- [ ] Founder runs `npm install` in any existing worktree to verify the pre-push hook activates without breaking the push flow on an up-to-date branch.

---

## Out of scope (queued)

- **Class A1 (3 files):** `ai_layer`, `leaderboard`, `aggregates_nulls_not_distinct` — these have registry rows but no file. PR #110 recommends `git show` + commit; queued as a separate PR per the task's explicit scope.
- **`docs/contributing/migrations.md`** — full policy doc with §1–§5 from PR #110; cross-team contributor onboarding lands separately.
- **`docs/runbooks/schema-drift-detected.md`** — incident runbook for §5; can land with the first real drift firing.
- **`v2_sp_snapshots` RLS state** — Appendix B item from PR #110; separate ticket.

---

## Memory updates queued (post-merge)

- New memory `project_x19_schema_reconciliation_complete.md`: 9-item resolution, lock-policy infrastructure shipped, A1 deferred.
- Update `project_x15_8_payment_attempts_schema_lock.md`: Class C file finally committed in this PR.
- Update `feedback_claudemd_ci_state_stale.md`: CI now includes schema-drift gate on migration paths.
