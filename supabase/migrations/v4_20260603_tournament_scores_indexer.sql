-- ───────────────────────────────────────────────────────────────────────────
-- Fix #4a — ScoreSubmitted read-model. 1:1 on-chain event mirror that backs
-- the tournament leaderboard. Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared across all Phase-1 apps).
--
-- Companion: packages/duel-backend/src/cron/index-scores-submitted.ts (Fix #4a
-- S3) writes this table from TournamentPool.ScoreSubmitted events; the
-- /v1/tournaments/{id}/leaderboard route (Fix #4a S4) reads it DB-primary,
-- retiring the fragile full-range on-chain getLogs scan (apps/api/src/lib/
-- scan.ts) that returned an opaque 500 on RPC timeout/rate-limit.
--
-- Design calls worth reading before editing:
--
--   NO foreign key to v2_tournaments(id): a ScoreSubmitted event may be indexed
--     before the TournamentCreated indexer inserts the matching v2_tournaments
--     row (the two indexers run on independent watermarks). Keying by the
--     on-chain bytes32 id (text) decouples the two and never drops an event for
--     ordering reasons. tournament_on_chain_id mirrors v2_tournaments.on_chain_id
--     and the event's indexed `id` topic.
--
--   score numeric(78,0): ScoreSubmitted.score is uint256 on-chain. numeric(78,0)
--     holds the full uint256 range (no int overflow) and orders exactly under
--     ORDER BY score DESC — strictly better than the route's prior Number()
--     coercion. match_count_delta mirrors the uint256 wire type for audit parity.
--
--   (tx_hash, log_index) unique: on-chain event identity. Makes the indexer
--     upsert idempotent on overlapping re-scans (onConflict do nothing), so two
--     overlapping cron runs both observing the same range produce a no-op batch
--     — wasteful but safe. Same idempotency posture as the TournamentCreated
--     indexer (no run-lock needed; the lock pattern is reserved for
--     non-idempotent broadcasters like settle()).
--
--   Own watermark table (v2_tournament_scores_indexer_state): one state table
--     per indexer, mirroring v2_tournament_indexer_state / v2_sponsor_indexer_
--     state. A separate table avoids colliding with the TournamentCreated
--     indexer on contract_address (both index the same TournamentPool address)
--     and keeps that indexer's onConflict:"contract_address" upsert untouched.
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── v2_tournament_scores: ScoreSubmitted event mirror ────────────────────

create table if not exists v2_tournament_scores (
  id uuid primary key default gen_random_uuid(),
  -- 0x + 64 hex (bytes32). Matches v2_tournaments.on_chain_id and the event's
  -- indexed `id` topic. NOT a FK — see header note on indexer ordering.
  tournament_on_chain_id text not null,
  -- Event `player` (indexed). Lower-case 0x-prefixed hex (42 chars).
  player_address text not null,
  -- uint256 score at full wire precision (no int overflow risk).
  score numeric(78, 0) not null,
  -- uint256 matchCountDelta — stored for audit / faithful mirror.
  match_count_delta numeric(78, 0) not null default 0,
  -- bytes32 nonce — replay / audit.
  nonce text,
  -- Block where the event fired (tie-break + audit).
  block_number bigint not null,
  -- Log index within the block (tie-break + event identity).
  log_index integer not null,
  -- Tx that emitted the event (event identity + display).
  tx_hash text not null,
  -- Block timestamp, resolved at index time so leaderboard reads are pure-DB.
  block_timestamp timestamptz not null,
  indexed_at timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

-- Event identity → idempotent re-scan. Each (tx_hash, log_index) is exactly
-- one ScoreSubmitted; the indexer upserts onConflict on this pair.
create unique index if not exists idx_tournament_scores_event_identity
  on v2_tournament_scores (tx_hash, log_index);

-- Leaderboard read path: the exact ordering the route needs —
--   WHERE tournament_on_chain_id = $1
--   ORDER BY score DESC, block_number ASC, log_index ASC
-- Composite covers the filter + full sort as a single index scan.
create index if not exists idx_tournament_scores_leaderboard
  on v2_tournament_scores (tournament_on_chain_id, score desc, block_number asc, log_index asc);

-- Player history side-lookup (parity with entries / solo_runs).
create index if not exists idx_tournament_scores_player
  on v2_tournament_scores (player_address);

-- ─── v2_tournament_scores_indexer_state ───────────────────────────────────

-- Watermark table — single-row-per-contract. Lets cron resume from
-- last_indexed_block + 1 after restart. Mirrors v2_tournament_indexer_state.
create table if not exists v2_tournament_scores_indexer_state (
  contract_address text primary key,
  last_indexed_block bigint not null,
  updated_at timestamptz not null default now()
);

create or replace function v2_tournament_scores_indexer_state_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists v2_tournament_scores_indexer_state_updated_at
  on v2_tournament_scores_indexer_state;
create trigger v2_tournament_scores_indexer_state_updated_at
  before update on v2_tournament_scores_indexer_state
  for each row
  execute function v2_tournament_scores_indexer_state_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────

-- Leaderboard is public read (mirrors v2_tournament_entries / v2_tournament_
-- solo_runs); writes service-role-only.
alter table v2_tournament_scores enable row level security;

drop policy if exists v2_tournament_scores_anon_select on v2_tournament_scores;
create policy v2_tournament_scores_anon_select on v2_tournament_scores
  for select to anon
  using (true);

-- Watermark is internal-only — no anon policy (no leak of indexer cadence).
-- Service role retains full access for the cron writer.
alter table v2_tournament_scores_indexer_state enable row level security;
