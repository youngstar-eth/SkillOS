-- V2 Clean Schema for Async Duel MVP
-- Scaffold migration. Agent 2 will extend (RLS policies, indexes, triggers).

create table if not exists v2_duels (
  id uuid primary key default gen_random_uuid(),
  onchain_id bytea unique,
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
  seed text not null,  -- deterministic 2048 seed
  stake_amount_usdc bigint not null default 1000000,  -- 1 USDC (6 decimals)
  matched_at timestamptz,
  settled_at timestamptz,
  winner_address text,
  create_tx_hash text,
  accept_tx_hash text,
  settle_tx_hash text,
  created_at timestamptz default now()
);

create index if not exists v2_duels_status_idx on v2_duels(status);
create index if not exists v2_duels_player1_idx on v2_duels(player1_address);
create index if not exists v2_duels_player2_idx on v2_duels(player2_address);
create index if not exists v2_duels_created_at_idx on v2_duels(created_at desc);
