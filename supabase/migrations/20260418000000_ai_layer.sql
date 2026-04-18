-- Skillbase AI layer — daily challenges + AI coach analyses.
--
-- Two tables:
--   daily_challenges : one row per (game, date). Cron populates; games read.
--   ai_analyses     : cached post-run AI narrations. Deduped by
--                     (user_address, game_slug, stats_hash) so replaying the
--                     same run returns the cached narration without a fresh
--                     Claude call.

create extension if not exists "pgcrypto";

-- ─── daily_challenges ───────────────────────────────────────────────────────
create table if not exists public.daily_challenges (
  id              uuid primary key default gen_random_uuid(),
  game_slug       text        not null,
  challenge_date  date        not null,
  theme           text        not null,
  challenge_data  jsonb       not null,
  ai_description  text        not null,
  model_used      text        not null default 'claude-haiku-4-5',
  created_at      timestamptz not null default now(),
  unique (game_slug, challenge_date)
);

create index if not exists idx_daily_challenges_game_date
  on public.daily_challenges (game_slug, challenge_date desc);

comment on table  public.daily_challenges is 'One AI-curated challenge per (game, date).';
comment on column public.daily_challenges.challenge_data
  is 'Game-specific payload: Wordle {word,hint}, 2048 {startingTiles}, etc.';

-- ─── ai_analyses ────────────────────────────────────────────────────────────
create table if not exists public.ai_analyses (
  id              uuid primary key default gen_random_uuid(),
  user_address    text        not null check (user_address = lower(user_address)),
  game_slug       text        not null,
  tournament_id   integer,
  score           integer     not null check (score >= 0),
  stats_hash      text        not null,           -- sha256 of stats JSON
  narration       text        not null,
  model_used      text        not null default 'claude-haiku-4-5',
  created_at      timestamptz not null default now(),
  unique (user_address, game_slug, stats_hash)
);

create index if not exists idx_ai_analyses_user_game
  on public.ai_analyses (user_address, game_slug, created_at desc);

comment on table public.ai_analyses
  is 'AI coach narrations, cached per (user, game, stats_hash) to avoid re-calling Claude for identical runs.';

-- ─── row-level security ─────────────────────────────────────────────────────
-- Both tables are written only via service-role keys (server-side handlers).
-- Reads are public so clients can fetch today's challenge without auth.

alter table public.daily_challenges enable row level security;
alter table public.ai_analyses     enable row level security;

drop policy if exists "daily_challenges_read_all" on public.daily_challenges;
create policy "daily_challenges_read_all"
  on public.daily_challenges
  for select
  using (true);

-- AI analyses are scoped reads: a user can read their own, nobody else's.
drop policy if exists "ai_analyses_read_own" on public.ai_analyses;
create policy "ai_analyses_read_own"
  on public.ai_analyses
  for select
  using (true);  -- keep open for v1; tighten when wallet-JWT wired

-- Inserts/updates only via service role (bypasses RLS automatically).
