-- ───────────────────────────────────────────────────────────────────────────
-- X19 Class A2 — Audit-trail backfill (3 of 4)
-- Source: git show 0dba6bf^:supabase/migrations/20260419180000_challenges_preplay_duel.sql
-- Original applied: pre-rebrand (April 2026); deleted from git in commit
--   `0dba6bf chore: skillbase v2 clean scaffold` (2026-04-20).
--
-- ─── Why this file exists ─────────────────────────────────────────────────
-- See peer file v1_20260419_payouts_instant_scope.sql for full X19 context.
-- This migration broadens `challenges.status` from 6 to 11 states and
-- relaxes `creator_score NOT NULL` to allow Alice to stake before playing.
--
-- Idempotent shape:
--   - Guarded constraint widening (no-op if all 11 states already permitted).
--   - DROP NOT NULL with guard (skips if column already nullable).
--   - Dynamic constraint-name lookup for `creator_score` check (matches the
--     pg_constraint scan in the original).
--
-- ─── Pre-apply verification REQUIRED (Supabase MCP) ───────────────────────
-- 1. mcp execute_sql -- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--      WHERE conrelid='public.challenges'::regclass AND conname='challenges_status_check';
--    → expected post-X19 mig 3: status IN (11 values per CHECK below).
-- 2. mcp execute_sql -- SELECT is_nullable FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='challenges' AND column_name='creator_score';
--    → expected: 'YES' (relaxed by mig #3).
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. Widen challenges.status with 5 new states ────────────────────────
do $$
declare
  current_def text;
  has_all_11 boolean := false;
begin
  select pg_get_constraintdef(oid) into current_def
    from pg_constraint
   where conrelid = 'public.challenges'::regclass
     and conname  = 'challenges_status_check';

  if current_def is null then
    -- Constraint missing — create with the full mig #3 set directly.
    alter table public.challenges
      add constraint challenges_status_check
      check (status in (
        'pending_creator_stake', 'open', 'accepted',
        'creator_played', 'challenger_played', 'both_played',
        'settled', 'expired_refunded',
        'walkover_creator', 'walkover_challenger',
        'cancelled'
      ));
  else
    -- Probe for the 5 new states added by mig #3. If any are missing, drop
    -- + recreate with the full set.
    has_all_11 := current_def ilike '%''creator_played''%'
              and current_def ilike '%''challenger_played''%'
              and current_def ilike '%''both_played''%'
              and current_def ilike '%''walkover_creator''%'
              and current_def ilike '%''walkover_challenger''%';
    if not has_all_11 then
      alter table public.challenges drop constraint challenges_status_check;
      alter table public.challenges
        add constraint challenges_status_check
        check (status in (
          'pending_creator_stake', 'open', 'accepted',
          'creator_played', 'challenger_played', 'both_played',
          'settled', 'expired_refunded',
          'walkover_creator', 'walkover_challenger',
          'cancelled'
        ));
    end if;
  end if;
end $$;

-- ─── 2. creator_score becomes nullable ────────────────────────────────────
-- Guarded: only drop NOT NULL if currently set.
do $$
declare
  is_not_null boolean;
begin
  select (is_nullable = 'NO') into is_not_null
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'challenges'
     and column_name  = 'creator_score';

  if is_not_null then
    alter table public.challenges
      alter column creator_score drop not null;
  end if;
end $$;

-- ─── 3. Update the CHECK to allow NULL (current is `creator_score >= 0`) ─
-- Dynamic constraint-name lookup mirrors the original — Postgres-default
-- names are deterministic but defensive lookup tolerates rename.
-- Only act if a CHECK constraint referencing creator_score is currently
-- forbidding NULL (i.e., doesn't have an `IS NULL OR` branch).
do $$
declare
  cn text;
  current_def text;
begin
  select conname, pg_get_constraintdef(oid) into cn, current_def
    from pg_constraint
   where conrelid = 'public.challenges'::regclass
     and contype  = 'c'
     and pg_get_constraintdef(oid) ilike '%creator_score%'
   limit 1;

  -- If the check already allows NULL (mig #3 form), no-op.
  if cn is not null and current_def not ilike '%creator_score is null%' then
    execute format('alter table public.challenges drop constraint %I', cn);
    alter table public.challenges
      add constraint challenges_creator_score_check
      check (creator_score is null or creator_score >= 0);
  elsif cn is null then
    -- Constraint missing entirely; add mig #3 form.
    alter table public.challenges
      add constraint challenges_creator_score_check
      check (creator_score is null or creator_score >= 0);
  end if;
end $$;
