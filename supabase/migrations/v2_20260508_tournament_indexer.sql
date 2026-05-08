-- ───────────────────────────────────────────────────────────────────────────
-- TournamentCreated event indexer — schema extension.
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared with other v2_* tables).
--
-- Companion to packages/duel-backend/src/cron/index-tournaments-created.ts.
-- Mirrors the v2_sponsor_indexer_state pattern: extend an existing primary
-- table with creator metadata + add a small watermark table so cron picks up
-- where it left off after restart.
--
-- Three tournament-creation pathways flow into the same row set after this
-- migration:
--   - 'orchestrator' — runCreateTournaments cron (current sole writer).
--     Backfilled below for all pre-existing rows.
--   - 'sdk'          — third-party tournament SDK (future). Detected by
--                       indexer when it observes a TournamentCreated event
--                       with no matching v2_tournaments row.
--   - 'external'     — reserved for off-platform creation flows (manual
--                       broadcast, governance vote, etc.). Not written by
--                       any current cron path.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── Extend v2_tournaments ────────────────────────────────────────────────

-- creator_address: msg.sender at createTournament() time. Lower-case
-- 0x-prefixed hex (42 chars). NULL on legacy rows, backfilled to 'orchestrator'
-- semantically via created_via below; address itself stays NULL until the
-- indexer observes the event for that on-chain id.
alter table v2_tournaments
  add column if not exists creator_address text;

-- created_via: discriminator for which write path produced this row.
-- See header comment for taxonomy. CHECK constraint enforces enum at write.
alter table v2_tournaments
  add column if not exists created_via text
    check (created_via in ('orchestrator', 'sdk', 'external'));

-- creation_tx_hash: tx that emitted TournamentCreated. 0x + 64 hex chars.
-- Backfilled by indexer when it observes the matching event.
alter table v2_tournaments
  add column if not exists creation_tx_hash text;

-- creation_block_number: block where TournamentCreated fired. Used for
-- audit + range-query joins. bigint matches block_number in
-- v2_sponsor_contributions.
alter table v2_tournaments
  add column if not exists creation_block_number bigint;

-- ─── Backfill ─────────────────────────────────────────────────────────────

-- All pre-existing rows were created by runCreateTournaments. Mark them
-- 'orchestrator' so the discriminator is non-NULL across the table from
-- the start. creator_address / creation_tx_hash / creation_block_number
-- stay NULL — a separate Q6 follow-up PR will teach runCreateTournaments
-- to persist creation_tx_hash directly, and the indexer will fill the
-- gap for any pre-Q6 rows that emit a re-observable TournamentCreated.
update v2_tournaments
  set created_via = 'orchestrator'
  where created_via is null;

-- ─── Indexes ──────────────────────────────────────────────────────────────

-- Future read path: "list tournaments created by sponsor X" (SDK dashboards,
-- jury attribution). Partial filter keeps pre-backfill NULLs out of the
-- index size.
create index if not exists idx_tournaments_creator
  on v2_tournaments (creator_address)
  where creator_address is not null;

-- Future read path: "filter by SDK vs orchestrator-created". Small cardinality
-- (3 values) so no partial filter — full bitmap scan is fine.
create index if not exists idx_tournaments_created_via
  on v2_tournaments (created_via);

-- ─── v2_tournament_indexer_state ──────────────────────────────────────────

-- Watermark table — single-row-per-contract. Lets cron resume from
-- last_indexed_block + 1 after restart. Mirrors v2_sponsor_indexer_state
-- pattern from v2_20260429_sponsor_contributions.sql.
create table if not exists v2_tournament_indexer_state (
  contract_address text primary key,
  last_indexed_block bigint not null,
  updated_at timestamptz not null default now()
);

-- ─── updated_at trigger on indexer_state ─────────────────────────────────

create or replace function v2_tournament_indexer_state_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists v2_tournament_indexer_state_updated_at
  on v2_tournament_indexer_state;
create trigger v2_tournament_indexer_state_updated_at
  before update on v2_tournament_indexer_state
  for each row
  execute function v2_tournament_indexer_state_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────

-- Watermark is internal-only — no anon access (no leak of indexer cadence).
-- Service role retains full access for the cron writer.
alter table v2_tournament_indexer_state enable row level security;
