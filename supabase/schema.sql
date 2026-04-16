-- 2048 Base Mini App schema
-- Identity: wallet_address (lowercase) as primary identity, Farcaster fid as enrichment

create extension if not exists "pgcrypto";

-- Users
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null check (wallet_address = lower(wallet_address)),
  fid integer unique,
  username text,
  display_name text,
  pfp_url text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_users_fid on public.users(fid) where fid is not null;

-- Game sessions / scores
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  max_tile integer not null default 0 check (max_tile >= 0),
  moves integer not null default 0 check (moves >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  won boolean not null default false,
  grid jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_score on public.game_sessions(user_id, score desc);
create index if not exists idx_sessions_leaderboard on public.game_sessions(score desc, created_at desc);

-- Row Level Security
alter table public.users enable row level security;
alter table public.game_sessions enable row level security;

-- Public read for leaderboard (anyone can read users and sessions)
drop policy if exists "users_read_all" on public.users;
create policy "users_read_all" on public.users
  for select using (true);

drop policy if exists "sessions_read_all" on public.game_sessions;
create policy "sessions_read_all" on public.game_sessions
  for select using (true);

-- Writes via service_role only (from server route that validates wallet signature / FC auth)
-- No insert/update/delete policies for anon — they are blocked by default under RLS.

-- Helper: upsert_user(wallet, fid, username, display_name, pfp_url) → user_id
create or replace function public.upsert_user(
  p_wallet text,
  p_fid integer default null,
  p_username text default null,
  p_display_name text default null,
  p_pfp_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.users(wallet_address, fid, username, display_name, pfp_url)
  values (lower(p_wallet), p_fid, p_username, p_display_name, p_pfp_url)
  on conflict (wallet_address) do update
    set fid = coalesce(excluded.fid, public.users.fid),
        username = coalesce(excluded.username, public.users.username),
        display_name = coalesce(excluded.display_name, public.users.display_name),
        pfp_url = coalesce(excluded.pfp_url, public.users.pfp_url),
        last_seen_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Leaderboard view: top score per user
create or replace view public.leaderboard as
select
  u.id as user_id,
  u.wallet_address,
  u.fid,
  u.username,
  u.display_name,
  u.pfp_url,
  max(s.score) as best_score,
  max(s.max_tile) as best_tile,
  count(s.id) as games_played,
  bool_or(s.won) as ever_won,
  max(s.created_at) as last_played_at
from public.users u
left join public.game_sessions s on s.user_id = u.id
group by u.id;
