-- ───────────────────────────────────────────────────────────────────────────
-- Tournaments v2 — solo submit + paid retry schema.
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared across all 6 Phase-1 apps).
--
-- Mirrors v2 contract at 0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1.
--
-- Design calls worth reading before editing:
--
--   source default: column is NOT NULL with temporary DEFAULT 'duel' so any
--     pre-existing rows (all v1 duel-gated entries) backfill as 'duel'. Default
--     is then dropped so future inserts MUST set source explicitly — prevents
--     a forgotten-to-set insert from silently mislabeling the row. Backend code
--     (packages/duel-backend) will always set source explicitly in Tasks 4-5.
--
--   fee_tx_hash uniqueness: partial unique index (WHERE NOT NULL) — free retries
--     have NULL here, paid retries must have a distinct on-chain tx hash. Stops
--     fee-tx replay across multiple retries.
--
--   solo_runs immutability: no updated_at trigger; each submission is a durable
--     audit entry. Post-submit corrections (exclude via anti-cheat) mutate the
--     `excluded` + `excluded_reason` columns in place but we accept that — the
--     primary "what happened at time T" record is submitted_at + score + fee_*.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── v2_tournament_entries: extend with source + fee tracking ─────────────

alter table v2_tournament_entries
  add column if not exists source text not null default 'duel'
    check (source in ('solo', 'duel'));

-- Drop the default so future inserts must set source explicitly. The 'duel'
-- default only existed for correct backfill of pre-v2 rows.
alter table v2_tournament_entries
  alter column source drop default;

alter table v2_tournament_entries
  add column if not exists paid_retries_count integer not null default 0;

alter table v2_tournament_entries
  add column if not exists total_fee_paid_usdc numeric(20, 6) not null default 0;

-- ─── v2_tournament_solo_runs: per-submission audit trail ─────────────────

create table if not exists v2_tournament_solo_runs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references v2_tournaments(id) on delete cascade,
  player_address text not null,
  score integer not null,
  -- true for paid retries (2nd+ submission), false for the free first solo.
  is_paid_retry boolean not null default false,
  -- 1.00 USDC for paid, 0 for free. Stored at wire precision.
  fee_paid_usdc numeric(20, 6) not null default 0,
  -- On-chain chargeRetryFee() tx hash. NULL for free submissions. Uniquely
  -- constrained below (partial index) to prevent fee-tx replay.
  fee_tx_hash text,
  -- Client-computed hash of the final game state — reserved for v3 replay
  -- verification. Stored now to avoid a later ALTER + backfill.
  game_state_hash text,
  submitted_at timestamptz not null default now(),
  -- Full anti-cheat verdict blob from @skillos/ai-coach/anticheat.
  plausibility_check jsonb,
  -- Post-submit moderation: set when anti-cheat marks implausible. Settle cron
  -- reads this to decide which runs contribute to best_score on-chain.
  excluded boolean not null default false,
  excluded_reason text
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

-- Hot path: rate-limit check ("last solo run for this player in this
-- tournament < 60s ago?") and retry-fee decision ("does this player have
-- ANY prior solo run?"). Descending submitted_at puts most recent first so
-- LIMIT 1 reads are a single index seek.
create index if not exists idx_solo_runs_tournament_player
  on v2_tournament_solo_runs (tournament_id, player_address, submitted_at desc);

-- Settle-time scan: "give me non-excluded solo runs for tournament T".
-- Partial filter on excluded = false because excluded rows are a minority
-- (only implausible ones) and we want the index to be smaller + hot.
create index if not exists idx_solo_runs_excluded
  on v2_tournament_solo_runs (tournament_id, excluded) where excluded = false;

-- Fee-tx replay prevention: each on-chain chargeRetryFee tx can back at
-- most one solo run. NULL fee_tx_hash (free runs) is not constrained.
create unique index if not exists idx_solo_runs_fee_tx_hash_unique
  on v2_tournament_solo_runs (fee_tx_hash) where fee_tx_hash is not null;

-- ─── RLS ─────────────────────────────────────────────────────────────────

-- Matches v2_tournaments + v2_tournament_entries pattern: anon can read
-- (public audit trail for the "3-layer defense" YC pitch — users can
-- verify fee transparency), writes service-role-only.
alter table v2_tournament_solo_runs enable row level security;

drop policy if exists v2_tournament_solo_runs_anon_select on v2_tournament_solo_runs;
create policy v2_tournament_solo_runs_anon_select on v2_tournament_solo_runs
  for select to anon
  using (true);
