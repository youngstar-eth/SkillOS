-- ───────────────────────────────────────────────────────────────────────────
-- v4_20260519_alert_history.sql
-- Alerting-infra sprint — dedup table for cron-failure Discord notifications.
--
-- Problem: PR #144 RCA surfaced 3 days of silent cron 500s in production.
-- Mainnet cutover requires baseline notification. New @skillos/duel-backend
-- alert utility POSTs to a Discord webhook on cron failure and uses this
-- table to suppress repeats within a 1h window per cron name (avoid spam
-- when a cron schedules every few minutes and fails repeatedly).
--
-- Writers: service-role only (packages/duel-backend/src/lib/alert.ts via
-- getSupabaseService()). No anon reads — operational table, not public.
-- Same RLS posture as v2_sp_snapshots / v2_cron_runs after the v4_20260517
-- enable-rls hardening pass.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists v2_alert_history (
  id uuid primary key default gen_random_uuid(),
  cron text not null,
  sent_at timestamp with time zone not null default now()
);

create index if not exists idx_v2_alert_history_cron_sent
  on v2_alert_history (cron, sent_at desc);

alter table v2_alert_history enable row level security;
-- No permissive policies: service_role keeps bypass access; anon + authenticated
-- get nothing. Matches v2_sp_snapshots / v2_cron_runs precedent.
