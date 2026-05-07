-- ───────────────────────────────────────────────────────────────────────────
-- v2_cron_runs: coordination table for overlapping cron invocations.
--
-- Used by packages/duel-backend/src/cron/run-lock.ts as a Postgres-side
-- mutex when overlapping cron runs would otherwise both broadcast the
-- same on-chain settle() (e.g. Vercel platform redrive, or a slow run
-- still finishing as the next scheduled tick fires).
--
-- Coordination primitive: PRIMARY KEY (cron_name, run_window_start).
-- First run inserts a row; subsequent runs in the same window get a
-- 23505 unique-violation and skip cleanly.
--
-- Window granularity is set by the caller (currentMinuteWindow() in
-- run-lock.ts truncates to 1 minute). Different crons can use different
-- granularities — settle uses minute-level, future hourly crons could
-- use hour-level — without coordinating across cron names.
--
-- Pruning: this table grows by at most one row per cron tick. With four
-- daily crons that's ~1500 rows/year. No periodic vacuum needed at this
-- volume; if it ever matters, retain 90 days via a scheduled DELETE.
--
-- Rollback: drop table v2_cron_runs;
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists v2_cron_runs (
  cron_name text not null,
  run_window_start timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result_summary jsonb,
  primary key (cron_name, run_window_start)
);

create index if not exists v2_cron_runs_started_at_idx
  on v2_cron_runs(started_at desc);

comment on table v2_cron_runs is
  'Coordination mutex for overlapping cron runs. PR #4 of the cron throughput sprint. See packages/duel-backend/src/cron/run-lock.ts.';
