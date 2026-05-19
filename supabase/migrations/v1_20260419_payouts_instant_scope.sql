-- ───────────────────────────────────────────────────────────────────────────
-- X19 Class A2 — Audit-trail backfill (1 of 4)
-- Source: git show 0dba6bf^:supabase/migrations/20260419000000_payouts_instant_scope.sql
-- Original applied: pre-rebrand (April 2026); deleted from git in commit
--   `0dba6bf chore: skillbase v2 clean scaffold` (2026-04-20).
-- Live table on prod: `payouts` (13 cols, 4 rows as of 2026-05-17).
--
-- ─── Why this file exists ─────────────────────────────────────────────────
-- The original migration was applied via the Supabase dashboard SQL editor
-- (off-track of `supabase_migrations.schema_migrations`), bypassed git in
-- the rebrand cleanup, and is now invisible to both `supabase db reset` and
-- the registry. PR #110 (investigate/x19-schema-drift) flagged it as
-- Class A2 — orphan table, no registry row, no file.
--
-- This restoration is IDEMPOTENT and forward-only:
--   - re-applying on prod is a no-op (constraint already includes 'instant');
--   - applying to a fresh local DB reproduces the pre-rebrand state, which
--     subsequent migrations then mutate as designed.
--
-- ─── Pre-apply verification REQUIRED (Supabase MCP) ───────────────────────
-- Before founder runs `apply_migration` on prod:
--   1. mcp list_tables --schemas=public → confirm `payouts` exists with
--      a `scope` column.
--   2. mcp execute_sql -- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--      WHERE conrelid = 'public.payouts'::regclass AND conname =
--      'payouts_scope_check';
--      → expected (post-X19 mig 1+2): scope IN ('game','category',
--        'overall','instant','challenge')
--   3. If current constraint already includes 'instant', the DO block below
--      no-ops. If it does NOT include 'instant', the block widens it (and
--      preserves any later additions like 'challenge').
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. Widen the scope CHECK constraint to include 'instant' ─────────────
-- Original migration (pre-rebrand) did unconditional DROP+ADD; the
-- idempotent rewrite below preserves the live constraint shape if 'instant'
-- is already permitted. This also tolerates the follow-up migration #2
-- (v1_20260419_challenges.sql) having already added 'challenge' to the set.
do $$
declare
  current_def text;
  has_instant boolean := false;
begin
  select pg_get_constraintdef(oid) into current_def
    from pg_constraint
   where conrelid = 'public.payouts'::regclass
     and conname  = 'payouts_scope_check';

  if current_def is null then
    -- Pre-rebrand `payouts` exists but constraint missing entirely (unusual
    -- but defensible — e.g., manual constraint drop). Recreate with the
    -- migration #1 final set.
    alter table public.payouts
      add constraint payouts_scope_check
      check (scope in ('game', 'category', 'overall', 'instant'));
  else
    has_instant := current_def ilike '%''instant''%';
    if not has_instant then
      alter table public.payouts drop constraint payouts_scope_check;
      alter table public.payouts
        add constraint payouts_scope_check
        check (scope in ('game', 'category', 'overall', 'instant'));
    end if;
    -- if 'instant' already present: NO-OP (don't narrow any future widening).
  end if;
end $$;

-- ─── 2. Race guard: at most one active payout per slot ────────────────────
-- Original was already `CREATE UNIQUE INDEX IF NOT EXISTS`. No change.
create unique index if not exists uniq_payouts_active_slot
  on public.payouts (
    user_address,
    scope,
    day,
    coalesce(game_slug, ''),
    coalesce(category, ''),
    coalesce(rank, 0)
  )
  where status in ('pending', 'sent');

comment on index public.uniq_payouts_active_slot
  is 'Race guard: at most one active (pending/sent) payout per (user,scope,day,game,category,rank) slot. Stale-pending rows are reclaimed after 10 min by the shared transfer helper.';
