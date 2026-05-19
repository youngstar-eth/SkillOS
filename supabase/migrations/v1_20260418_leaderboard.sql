-- 3-tier leaderboard system: per-game, category, overall.
--
-- Tables:
--   game_scores       — every score submission (raw event log)
--   daily_ranks       — derived: one row per (user, game, day) with rank + points
--   daily_aggregates  — derived: category & overall scope, points + rank
--   payouts           — audit trail for prize distributions
--
-- RPC helpers for compute-ranks / compute-aggregates pipelines:
--   get_best_scores_for_day(p_game, p_day)
--   get_users_with_activity_on_day(p_day)
--   get_unique_games_for_day(p_day)
--
-- Existing game_sessions stays as the on-chain-tournament receipt log; the new
-- game_scores table is the leaderboard event stream (works across all 20 games
-- via the game_slug column that game_sessions lacks).

create extension if not exists "pgcrypto";

-- ─── game_scores (raw event stream) ─────────────────────────────────────────
create table if not exists public.game_scores (
  id              uuid primary key default gen_random_uuid(),
  user_address    text        not null check (user_address = lower(user_address)),
  game_slug       text        not null,
  tournament_id   integer,
  score           bigint      not null check (score >= 0),
  game_data       jsonb,
  submitted_at    timestamptz not null default now(),
  -- DATE() is immutable so we can use it in a generated column. The STORED
  -- variant materialises the date so leaderboard queries hit indices instead
  -- of recomputing per-row.
  day             date generated always as (date(submitted_at at time zone 'UTC')) stored
);

create index if not exists idx_scores_user_day
  on public.game_scores (user_address, day);
create index if not exists idx_scores_game_day_score
  on public.game_scores (game_slug, day, score desc);
create index if not exists idx_scores_day
  on public.game_scores (day);

comment on table public.game_scores
  is 'Per-submission score event for the leaderboard pipeline. Independent from game_sessions (which is the on-chain-tournament receipt log).';

-- ─── daily_ranks (per-game leaderboard, computed) ───────────────────────────
create table if not exists public.daily_ranks (
  id              uuid primary key default gen_random_uuid(),
  user_address    text        not null check (user_address = lower(user_address)),
  game_slug       text        not null,
  day             date        not null,
  rank            integer     not null check (rank >= 1),
  best_score      bigint      not null check (best_score >= 0),
  rank_points     integer     not null check (rank_points >= 0 and rank_points <= 100),
  computed_at     timestamptz not null default now(),
  unique (user_address, game_slug, day)
);

create index if not exists idx_ranks_game_day_rank
  on public.daily_ranks (game_slug, day, rank);
create index if not exists idx_ranks_user_day
  on public.daily_ranks (user_address, day);

-- ─── daily_aggregates (category + overall, computed) ────────────────────────
create table if not exists public.daily_aggregates (
  id                       uuid primary key default gen_random_uuid(),
  user_address             text        not null check (user_address = lower(user_address)),
  scope                    text        not null check (scope in ('category', 'overall')),
  category                 text,
  day                      date        not null,
  total_points             integer     not null check (total_points >= 0),
  games_played             integer     not null check (games_played >= 0),
  multi_game_bonus_applied boolean     not null default false,
  rank                     integer     check (rank is null or rank >= 1),
  computed_at              timestamptz not null default now()
);

-- Postgres treats NULL != NULL in UNIQUE constraints, which would let many
-- (user, 'overall', NULL, day) rows in. A functional index with COALESCE
-- collapses NULL → '' so the (overall, day) pair stays unique per user.
create unique index if not exists uniq_agg_user_scope_cat_day
  on public.daily_aggregates (user_address, scope, coalesce(category, ''), day);

create index if not exists idx_agg_scope_cat_day_rank
  on public.daily_aggregates (scope, category, day, rank);

-- ─── payouts (audit log) ────────────────────────────────────────────────────
create table if not exists public.payouts (
  id            uuid primary key default gen_random_uuid(),
  user_address  text        not null check (user_address = lower(user_address)),
  amount_usdc   numeric(10, 6) not null check (amount_usdc > 0),
  scope         text        not null check (scope in ('game', 'category', 'overall')),
  game_slug     text,
  category      text,
  day           date        not null,
  rank          integer     check (rank is null or rank >= 1),
  tx_hash       text,
  status        text        not null default 'pending'
                check (status in ('pending', 'sent', 'failed')),
  failure_reason text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index if not exists idx_payouts_day_status
  on public.payouts (day, status);
create index if not exists idx_payouts_user
  on public.payouts (user_address);
create index if not exists idx_payouts_tx_hash
  on public.payouts (tx_hash) where tx_hash is not null;

comment on table public.payouts
  is 'Audit trail for both on-chain (per-game settle) and off-chain (category/overall studio transfer) prize distributions.';

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.game_scores      enable row level security;
alter table public.daily_ranks      enable row level security;
alter table public.daily_aggregates enable row level security;
alter table public.payouts          enable row level security;

drop policy if exists "game_scores_read_all"      on public.game_scores;
drop policy if exists "daily_ranks_read_all"      on public.daily_ranks;
drop policy if exists "daily_aggregates_read_all" on public.daily_aggregates;
drop policy if exists "payouts_read_all"          on public.payouts;

create policy "game_scores_read_all"
  on public.game_scores      for select using (true);
create policy "daily_ranks_read_all"
  on public.daily_ranks      for select using (true);
create policy "daily_aggregates_read_all"
  on public.daily_aggregates for select using (true);
create policy "payouts_read_all"
  on public.payouts          for select using (true);

-- All writes via service role (bypasses RLS) — no INSERT policies needed.

-- ─── RPC helpers ────────────────────────────────────────────────────────────
-- Returns each player's best score for a given (game, day). Ordered desc so the
-- caller can assign ranks 1..N by array index. Pure aggregation; safe to cache.
create or replace function public.get_best_scores_for_day(
  p_game text,
  p_day  date
)
returns table (user_address text, best_score bigint, submissions integer)
language sql
stable
as $$
  select
    user_address,
    max(score)::bigint as best_score,
    count(*)::int      as submissions
  from public.game_scores
  where game_slug = p_game
    and day       = p_day
  group by user_address
  order by best_score desc;
$$;

-- Distinct users who submitted any score on that day. Used to seed the
-- aggregate compute loop (one user → one (overall, day) row + N category rows).
create or replace function public.get_users_with_activity_on_day(
  p_day date
)
returns table (user_address text, games_played integer)
language sql
stable
as $$
  select user_address, count(distinct game_slug)::int as games_played
  from public.game_scores
  where day = p_day
  group by user_address;
$$;

-- Distinct game_slugs that saw any submission on that day. The compute-ranks
-- pipeline iterates this list to know which per-game leaderboards to refresh.
create or replace function public.get_unique_games_for_day(
  p_day date
)
returns table (game_slug text, submissions integer)
language sql
stable
as $$
  select game_slug, count(*)::int as submissions
  from public.game_scores
  where day = p_day
  group by game_slug;
$$;

grant execute on function public.get_best_scores_for_day(text, date)        to anon, authenticated, service_role;
grant execute on function public.get_users_with_activity_on_day(date)        to anon, authenticated, service_role;
grant execute on function public.get_unique_games_for_day(date)              to anon, authenticated, service_role;
