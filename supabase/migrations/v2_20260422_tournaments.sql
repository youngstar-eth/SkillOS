-- ───────────────────────────────────────────────────────────────────────────
-- Phase-1 F4 Sponsored Tournaments — schema.
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP-IF-EXISTS patterns).
-- Target project: clizuqvtkekzxiflbsyr (shared across all 6 Phase-1 apps).
--
-- Mirrors TournamentPool.sol storage on Base Sepolia. Notable deviations
-- from the original sprint spec:
--
--   on_chain_id: text (NOT bigint). Contract uses bytes32 tournament ids
--                so the DB column is "0x" + 64 hex chars, matching the
--                convention already established on v2_duels.onchain_id.
--
--   source_duel_ids: uuid[] added on v2_tournament_entries. Needed for the
--                    anti-cheat cross-check in settleTournaments cron:
--                    "any entry whose duelId traces to plausibility_check.
--                    verdict = 'implausible' is marked excluded". Storing
--                    the contributing duel ids directly is simpler and
--                    more precise than inferring via time windows.
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── v2_tournaments ────────────────────────────────────────────────────────

create table if not exists v2_tournaments (
  id uuid primary key default gen_random_uuid(),
  -- 0x + 64 hex chars matching TournamentPool's bytes32 id.
  on_chain_id text not null unique,
  -- Short game name ("2048", "wordle", ...). Contract stores keccak256(utf8(name));
  -- DB stores the human-readable name for easy filtering + UI.
  game text not null,
  cycle_type text not null check (cycle_type in ('daily', 'weekly')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- 6-decimal USDC pool; numeric(20,6) keeps wire precision.
  prize_pool_usdc numeric(20, 6) not null,
  -- Per-game constant used in effective rank score. Integer to match contract math.
  participation_bonus integer not null default 0,
  -- Sponsor wallet address (0x-prefixed, 42 chars). Team-controlled in Phase 1.
  sponsor_address text not null,
  sponsor_name text,
  sponsor_logo_url text,
  settled_at timestamptz,
  settle_tx_hash text,
  created_at timestamptz not null default now()
);

-- ─── v2_tournament_entries ────────────────────────────────────────────────

create table if not exists v2_tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references v2_tournaments(id) on delete cascade,
  player_address text not null,
  best_score integer not null,
  match_count integer not null default 0,
  -- Precomputed on every upsert: best_score*0.85 + match_count*bonus*0.15.
  -- Stored so the ranking index is useful and UI reads are cheap.
  effective_rank_score numeric(20, 4) not null,
  excluded boolean not null default false,
  excluded_reason text,
  prize_won_usdc numeric(20, 6),
  prize_tx_hash text,
  -- Duel ids that contributed score/matches — drives settle-time anti-cheat.
  source_duel_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, player_address)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

-- Ranking read path. "excluded" in the prefix so the common "WHERE excluded
-- = false ORDER BY effective_rank_score DESC" query is a straight index
-- scan with no filter work after the prefix narrow.
create index if not exists idx_tournament_entries_ranking
  on v2_tournament_entries (tournament_id, excluded, effective_rank_score desc);

-- Active tournaments lookup: "which tournaments are still open for game X?"
-- Partial filter keeps settled rows out — after Phase 1 we expect hundreds
-- of settled historical tournaments per game vs. 2 active (daily + weekly).
create index if not exists idx_tournaments_active
  on v2_tournaments (game, ends_at) where settled_at is null;

-- Foreign-key side lookup: "list a player's tournament history".
create index if not exists idx_tournament_entries_player
  on v2_tournament_entries (player_address);

-- ─── updated_at trigger on entries ───────────────────────────────────────

create or replace function v2_tournament_entries_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists v2_tournament_entries_updated_at on v2_tournament_entries;
create trigger v2_tournament_entries_updated_at
  before update on v2_tournament_entries
  for each row
  execute function v2_tournament_entries_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────

-- Mirrors v2_duels: public read of leaderboard data, writes service-role-only.
alter table v2_tournaments enable row level security;
alter table v2_tournament_entries enable row level security;

drop policy if exists v2_tournaments_anon_select on v2_tournaments;
create policy v2_tournaments_anon_select on v2_tournaments
  for select to anon
  using (true);

drop policy if exists v2_tournament_entries_anon_select on v2_tournament_entries;
create policy v2_tournament_entries_anon_select on v2_tournament_entries
  for select to anon
  using (true);
