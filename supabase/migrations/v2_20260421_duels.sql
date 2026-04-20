-- ───────────────────────────────────────────────────────────────────────────
-- Skillbase V2 — async 2048 duel schema.
-- Idempotent: safe to re-run (uses IF NOT EXISTS / DROP-IF-EXISTS patterns).
-- Target project: clizuqvtkekzxiflbsyr
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── Table ─────────────────────────────────────────────────────────────────

create table if not exists v2_duels (
  id uuid primary key default gen_random_uuid(),
  -- 0x-prefixed bytes32 hex matching ChallengeEscrow challenges[id].
  -- Derived deterministically from `id` via keccak256 in src/lib/seed.ts —
  -- stored for debugging / cross-reference.
  onchain_id text unique,
  status text not null default 'queued' check (status in (
    'queued', 'matched', 'player1_submitted',
    'player2_submitted', 'settled', 'refunded'
  )),
  player1_address text not null,
  player1_score int,
  player1_submitted_at timestamptz,
  player2_address text,
  player2_score int,
  player2_submitted_at timestamptz,
  -- 0x + 64 hex chars, shared with Agent 1 for deterministic 2048 RNG.
  seed text not null,
  stake_amount_usdc bigint not null default 1000000,  -- 1 USDC (6 decimals)
  matched_at timestamptz,
  settled_at timestamptz,
  winner_address text,
  create_tx_hash text,
  accept_tx_hash text,
  settle_tx_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- If the scaffold had onchain_id as bytea, migrate it to text (idempotent).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'v2_duels' and column_name = 'onchain_id'
      and data_type = 'bytea'
  ) then
    alter table v2_duels alter column onchain_id type text
      using '0x' || encode(onchain_id, 'hex');
  end if;
end $$;

-- Backfill updated_at column if running against an older scaffold.
alter table v2_duels add column if not exists updated_at timestamptz default now();

-- ─── Indexes ───────────────────────────────────────────────────────────────

create index if not exists v2_duels_status_idx on v2_duels(status);
create index if not exists v2_duels_player1_idx on v2_duels(player1_address);
create index if not exists v2_duels_player2_idx on v2_duels(player2_address);
create index if not exists v2_duels_created_at_idx on v2_duels(created_at desc);
create index if not exists v2_duels_onchain_id_idx on v2_duels(onchain_id);

-- Role-swap-proof unique index: prevents two concurrent active matches
-- between the same pair regardless of who was P1 / P2. Filter drops
-- 'settled' and 'refunded' so a rematch after completion is allowed.
drop index if exists v2_duels_matched_pair_unique;
create unique index v2_duels_matched_pair_unique on v2_duels (
  least(player1_address, player2_address),
  greatest(player1_address, player2_address)
) where status in ('matched', 'player1_submitted', 'player2_submitted');

-- ─── updated_at trigger ────────────────────────────────────────────────────

create or replace function v2_duels_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists v2_duels_updated_at on v2_duels;
create trigger v2_duels_updated_at
  before update on v2_duels
  for each row
  execute function v2_duels_set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table v2_duels enable row level security;

-- Public read: no PII beyond wallet addresses, and the seed is intentionally
-- shared so either player can reconstruct the game. The service-role client
-- in src/lib/supabase.ts handles all writes.
drop policy if exists v2_duels_anon_select on v2_duels;
create policy v2_duels_anon_select on v2_duels
  for select to anon
  using (true);

-- No insert/update/delete policies for anon → writes require service role.
