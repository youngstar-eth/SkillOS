-- ───────────────────────────────────────────────────────────────────────────
-- Phase-1 Skill Points (SP) + Level user-stats table. Idempotent.
-- Target project: clizuqvtkekzxiflbsyr (shared across all 6 Phase-1 apps).
--
-- Written at submission time; ledger backfill for v2_* migrations is a
-- post-submission backlog item.
--
-- Canonical source for per-wallet totals (SP, level, duel/tournament counters).
-- Populated by:
--   1. scripts/backfill-sp.ts (one-shot recompute from v2_duels +
--      v2_tournament_entries + v2_tournament_solo_runs)
--   2. Runtime hooks in packages/duel-backend — duel settle, tournament
--      settle cron, solo submit (post-plausibility). See @skillos/sp-engine
--      for the pure award formula.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists v2_user_stats (
  user_address text primary key,
  total_sp integer not null default 0,
  current_level integer not null default 1,
  duels_won integer not null default 0,
  duels_lost integer not null default 0,
  tournaments_participated integer not null default 0,
  tournaments_won integer not null default 0,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Leaderboards read by (level desc, sp desc). Two single-column indexes let
-- either order be served cheaply without composite-key gymnastics; the
-- table is bounded by distinct wallet addresses which stays small relative
-- to total runs.
create index if not exists idx_user_stats_level on v2_user_stats(current_level desc);
create index if not exists idx_user_stats_sp on v2_user_stats(total_sp desc);

-- RLS — mirrors v2_tournament_entries / solo_runs: anon reads the
-- leaderboard column; writes service-role only.
alter table v2_user_stats enable row level security;

drop policy if exists v2_user_stats_anon_select on v2_user_stats;
create policy v2_user_stats_anon_select on v2_user_stats
  for select to anon
  using (true);
