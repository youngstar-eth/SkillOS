-- ─────────────────────────────────────────────────────────────────────────
-- v2 SP snapshot anchoring — daily SHA-256 of canonical SP ledger JSON.
--
-- Each row records:
--   1. canonical_json — the full SP ledger state at snapshot time, public
--   2. hash           — SHA-256 of canonicalize(canonical_json), 0x-prefixed
--   3. anchor_tx_hash — Base Sepolia tx hash linking back to SkillbaseAnchor
--
-- Workflow: cron writes (snapshot_id, hash, canonical_json) BEFORE the
-- on-chain anchor tx. After the anchor tx confirms, anchor_tx_hash and
-- anchored_at are filled in. A row with NULL anchor_tx_hash means the
-- canonical JSON was saved but the on-chain anchor hasn't landed yet
-- (could be in-flight or could have failed — operator inspects).
--
-- Pairs with: contracts/src/SkillbaseAnchor.sol — the on-chain mapping
--   snapshots[timestamp_unix] = bytes32(hash) is keyed by this row's
--   timestamp_unix column.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists v2_sp_snapshots (
  snapshot_id          uuid primary key default gen_random_uuid(),
  timestamp_unix       bigint not null unique,
  hash                 text not null check (hash ~ '^0x[0-9a-f]{64}$'),
  wallet_count         integer not null check (wallet_count >= 0),
  total_sp_at_snapshot bigint not null check (total_sp_at_snapshot >= 0),
  canonical_json       jsonb not null,
  anchor_tx_hash       text check (anchor_tx_hash is null or anchor_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  anchored_at          timestamptz,
  created_at           timestamptz not null default now()
);

-- Hot path: most-recent first for the public snapshot endpoint (future).
create index if not exists v2_sp_snapshots_timestamp_idx
  on v2_sp_snapshots (timestamp_unix desc);

-- Operator query: find unanchored rows (anchor_tx_hash NULL = pending or failed).
create index if not exists v2_sp_snapshots_anchored_idx
  on v2_sp_snapshots (anchored_at desc nulls last);

comment on table v2_sp_snapshots is
  'Daily canonical SP ledger snapshots + on-chain anchor tx hashes. Public read for AI lab verification.';
comment on column v2_sp_snapshots.timestamp_unix is
  'Unix seconds. Doubles as the SkillbaseAnchor.snapshots[] mapping key on-chain. UNIQUE so a given timestamp can be anchored at most once.';
comment on column v2_sp_snapshots.hash is
  'SHA-256 of canonicalize(canonical_json), 0x-prefixed lowercase 32-byte hex. Bytes32 input to anchorSnapshot.';
comment on column v2_sp_snapshots.canonical_json is
  'Output of buildSnapshot(timestamp, rows). Public read — AI labs SHA-256 this to reproduce hash.';
comment on column v2_sp_snapshots.anchor_tx_hash is
  'Base Sepolia tx hash of the SkillbaseAnchor.anchorSnapshot() call. NULL until on-chain confirm.';
