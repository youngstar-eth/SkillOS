-- X23.1: Glicko-2 per-(wallet, game, class) rating storage.
-- Per X23.0 spec freeze docs/sprints/x23-glicko-2/SPEC.md §C.
-- CLAUDE.md invariant #5 (off-chain only; substrate stays class-agnostic).

-- ─── Canonical current rating per (wallet, game, class) ────────────────────

create table public.v2_player_ratings (
  wallet text not null,
  game text not null,
  -- Inherits X14.0 enum (v4_20260518_x14_class.sql): class in ('human','agent').
  -- Same check constraint kept verbatim to surface schema drift in CI if X14
  -- ever broadens its domain (SPEC §C.2 intentional coupling).
  class text not null check (class in ('human', 'agent')),
  rating numeric not null default 1000,
  rd numeric not null default 350,
  volatility numeric not null default 0.06,
  -- Provenance: which tournament_id last touched this row. Full audit lives
  -- in v2_player_rating_history; this is a debug breadcrumb.
  last_period_anchor text,
  -- Stat counter — total rating periods applied. Powers profile UX
  -- ("3 tournaments played") and RD-trajectory sanity checks.
  updates_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (wallet, game, class)
);

-- Leaderboard hot path: top-N by rating within (game, class).
create index idx_v2_player_ratings_game_class_rating
  on public.v2_player_ratings (game, class, rating desc);

-- Profile hot path: all ratings for a wallet.
create index idx_v2_player_ratings_wallet
  on public.v2_player_ratings (wallet);

-- ─── Append-only audit log (drift-detection per Tier 2 §3) ─────────────────

create table public.v2_player_rating_history (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  game text not null,
  class text not null check (class in ('human', 'agent')),
  rating_before numeric not null,
  rating_after numeric not null,
  rd_before numeric not null,
  rd_after numeric not null,
  volatility_before numeric not null,
  volatility_after numeric not null,
  tournament_id uuid references public.v2_tournaments(id) on delete set null,
  matches_count integer not null,
  recorded_at timestamp with time zone not null default now()
);

create index idx_v2_player_rating_history_wallet_recorded
  on public.v2_player_rating_history (wallet, recorded_at desc);

create index idx_v2_player_rating_history_tournament
  on public.v2_player_rating_history (tournament_id);

-- ─── Per-tournament idempotency flag ───────────────────────────────────────
-- X23.2 cron polls v2_tournaments where settled_at IS NOT NULL AND
-- ratings_updated_at IS NULL; stamps the column on completion. Re-running
-- the cron after restart is a no-op for already-rated tournaments
-- (matches X9 settle-cron idempotency posture).
alter table public.v2_tournaments
  add column if not exists ratings_updated_at timestamp with time zone;

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.v2_player_ratings enable row level security;
alter table public.v2_player_rating_history enable row level security;

-- Anon SELECT: public leaderboard + profile pages need to read.
-- Tightening to bearer-auth is a future RLS swap, not a schema change.
create policy v2_player_ratings_anon_select
  on public.v2_player_ratings for select to anon using (true);
create policy v2_player_rating_history_anon_select
  on public.v2_player_rating_history for select to anon using (true);

-- service_role writes only — cron uses service-role JWT.
create policy v2_player_ratings_service_write
  on public.v2_player_ratings for all to service_role
  using (true) with check (true);
create policy v2_player_rating_history_service_write
  on public.v2_player_rating_history for all to service_role
  using (true) with check (true);

-- ─── Updated_at trigger ────────────────────────────────────────────────────
-- search_path pinned to '' per canonical pattern from
-- v2_20260429_sponsor_function_search_path.sql — prevents search_path
-- hijacking on now() resolution. The function uses default security
-- invoker (not definer), so the attack surface is small either way;
-- pinning makes the linter happy and matches the audit-friendly pattern.

create or replace function public.set_v2_player_ratings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger trg_v2_player_ratings_updated_at
  before update on public.v2_player_ratings
  for each row execute function public.set_v2_player_ratings_updated_at();
