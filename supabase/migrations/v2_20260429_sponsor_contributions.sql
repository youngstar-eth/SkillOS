-- ───────────────────────────────────────────────────────────────────────────
-- Permissionless Sponsor Pool — schema.
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared with other v2_* tables).
--
-- Mirrors the SponsorshipModule.PoolSponsored event stream from Base Sepolia.
-- One row per on-chain sponsorship event (NOT per sponsor — same sponsor
-- contributing twice produces two rows + two SBT receipts).
--
-- Indexer watermark stored in v2_sponsor_indexer_state so cron picks up
-- where it left off after restart, no need to scan from genesis or query
-- MAX(block_number) on every run.
--
-- Address conventions: lower-case 0x-prefixed hex (42 chars for EOAs, 66
-- for tx hashes). Match v2_tournaments.on_chain_id and v2_duels.onchain_id
-- precedent.
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── v2_sponsor_contributions ─────────────────────────────────────────────

create table if not exists v2_sponsor_contributions (
  id uuid primary key default gen_random_uuid(),
  -- 0x + 64 hex chars; matches v2_tournaments.on_chain_id format.
  tournament_on_chain_id text not null,
  -- 0x-prefixed 42-char address (EOA or contract). Lower-case canonical.
  sponsor_address text not null,
  -- 6-decimal USDC; numeric(20, 6) preserves wire precision.
  amount_usdc numeric(20, 6) not null,
  -- ERC-721 tokenId of the soulbound receipt minted to sponsor.
  receipt_token_id bigint not null,
  -- 0x + 64 hex chars; per-event idempotency key (with log_index).
  tx_hash text not null,
  -- Position of PoolSponsored log within the tx — lets multiple sponsorships
  -- in a single tx (e.g. a multicall) each get their own row.
  log_index integer not null,
  -- For watermark advancement and time-range queries on indexed events.
  block_number bigint not null,
  -- When the indexer captured this event (vs on-chain mining time).
  indexed_at timestamptz not null default now(),
  -- (tx_hash, log_index) is the canonical event identifier on-chain;
  -- making it UNIQUE enforces idempotency for the cron's ON CONFLICT path.
  unique (tx_hash, log_index)
);

-- ─── v2_sponsor_indexer_state ─────────────────────────────────────────────

-- Watermark table — single-row-per-contract. Lets cron resume from
-- last_indexed_block + 1 after restart instead of rescanning history.
create table if not exists v2_sponsor_indexer_state (
  contract_address text primary key,
  last_indexed_block bigint not null,
  updated_at timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

-- Dashboard read path: "show me my sponsorships, newest first".
create index if not exists idx_sponsor_contributions_sponsor
  on v2_sponsor_contributions (sponsor_address, indexed_at desc);

-- Pool view read path: "list sponsors for tournament X, newest first".
create index if not exists idx_sponsor_contributions_tournament
  on v2_sponsor_contributions (tournament_on_chain_id, indexed_at desc);

-- Block-range queries (rare, but useful for re-indexing audits).
create index if not exists idx_sponsor_contributions_block
  on v2_sponsor_contributions (block_number);

-- ─── updated_at trigger on indexer_state ─────────────────────────────────

create or replace function v2_sponsor_indexer_state_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists v2_sponsor_indexer_state_updated_at on v2_sponsor_indexer_state;
create trigger v2_sponsor_indexer_state_updated_at
  before update on v2_sponsor_indexer_state
  for each row
  execute function v2_sponsor_indexer_state_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────

-- Public read for the dashboard + tournament pool view; writes service-role-only.
-- Watermark is internal-only — no anon access (no leak of indexer cadence).
alter table v2_sponsor_contributions enable row level security;
alter table v2_sponsor_indexer_state enable row level security;

drop policy if exists v2_sponsor_contributions_anon_select on v2_sponsor_contributions;
create policy v2_sponsor_contributions_anon_select on v2_sponsor_contributions
  for select to anon
  using (true);
