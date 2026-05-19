-- ───────────────────────────────────────────────────────────────────────────
-- X19 Class A2 — Audit-trail backfill (2 of 4)
-- Source: git show 0dba6bf^:supabase/migrations/20260419120000_challenges.sql
-- Original applied: pre-rebrand (April 2026); deleted from git in commit
--   `0dba6bf chore: skillbase v2 clean scaffold` (2026-04-20).
-- Live tables on prod: `challenges` (25 cols, 0 rows as of 2026-05-17;
--   25 cols indicates migrations 2+3+4 all applied off-track).
--
-- ─── Why this file exists ─────────────────────────────────────────────────
-- See peer file v1_20260419_payouts_instant_scope.sql for full X19 context.
-- This migration is the original `CREATE TABLE challenges` plus the
-- payouts.scope widening to allow 'challenge' scope.
--
-- Idempotent shape:
--   - CREATE TABLE IF NOT EXISTS for `challenges` (no-op on prod).
--   - Guarded constraint widening for payouts.scope (no-op if 'challenge'
--     already permitted).
--   - CREATE INDEX IF NOT EXISTS for all 5 indexes.
--   - DROP POLICY IF EXISTS + CREATE POLICY for RLS (atomic replace).
--
-- ─── Pre-apply verification REQUIRED (Supabase MCP) ───────────────────────
-- 1. mcp list_tables → confirm `challenges` exists with 25 columns.
-- 2. mcp execute_sql -- SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='challenges' ORDER BY
--      ordinal_position;
--    → expected: 25 columns ending with the X19 mig-4 add-columns
--      (onchain_id, onchain_create_tx_hash, …, settle_signature).
-- 3. After applying X19 migs 2+3+4 in order, the final schema must match
--    prod's `challenges` exactly (column count + types + constraints).
--    Use `pg_dump --schema-only --table=public.challenges` to compare.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. Widen payouts.scope to include 'challenge' ────────────────────────
-- Idempotent: only widens if 'challenge' is not already permitted; preserves
-- any later additions.
do $$
declare
  current_def text;
  has_challenge boolean := false;
begin
  select pg_get_constraintdef(oid) into current_def
    from pg_constraint
   where conrelid = 'public.payouts'::regclass
     and conname  = 'payouts_scope_check';

  if current_def is null then
    -- Should not happen if mig #1 ran first; defensive recreate including
    -- the union of mig #1 + mig #2 scopes.
    alter table public.payouts
      add constraint payouts_scope_check
      check (scope in ('game', 'category', 'overall', 'instant', 'challenge'));
  else
    has_challenge := current_def ilike '%''challenge''%';
    if not has_challenge then
      alter table public.payouts drop constraint payouts_scope_check;
      alter table public.payouts
        add constraint payouts_scope_check
        check (scope in ('game', 'category', 'overall', 'instant', 'challenge'));
    end if;
  end if;
end $$;

-- ─── 2. challenges table (CREATE TABLE IF NOT EXISTS) ─────────────────────
-- This is the INITIAL 6-state challenges table. Migration #3 (preplay_duel)
-- broadens status to 11 states and relaxes creator_score NOT NULL. Migration
-- #4 (onchain_escrow) adds 6 columns + indexes. The fresh-local sequence
-- produces the prod's 25-column shape.
create table if not exists public.challenges (
  id                         uuid        primary key default gen_random_uuid(),

  -- Which game + who's playing
  game_slug                  text        not null,
  creator_address            text        not null check (creator_address = lower(creator_address)),
  creator_score              integer     not null check (creator_score >= 0),
  creator_stake_tx_hash      text        not null,

  challenger_address         text                check (challenger_address is null or challenger_address = lower(challenger_address)),
  challenger_score           integer             check (challenger_score is null or challenger_score >= 0),
  challenger_stake_tx_hash   text,

  -- The seed is Bob's puzzle — deterministic JSON generated at create time,
  -- stored verbatim. Game-specific: wordle {word}, 2048 {startingTiles},
  -- hillclimb {seed}.
  seed_data                  jsonb       not null,

  stake_usdc                 numeric(10, 2) not null
                             check (stake_usdc in (0.5, 1, 5)),

  -- State machine. See create.ts / accept.ts / settle.ts for the allowed
  -- transitions. Service layer enforces the edges; CHECK enforces the set.
  -- Mig #3 broadens this to 11 states.
  status                     text        not null
                             check (status in (
                               'pending_creator_stake',  -- DB row written, Alice hasn't sent USDC yet
                               'open',                   -- Alice paid in; waiting for Bob
                               'accepted',               -- Bob paid in; both play
                               'settled',                -- Winner determined; paid out
                               'expired_refunded',       -- Expired before accept OR before Bob submitted
                               'cancelled'               -- Alice backed out before confirm_stake
                             )),

  winner_address             text                check (winner_address is null or winner_address = lower(winner_address)),
  payout_tx_hash             text,                 -- studio → winner
  refund_tx_hash             text,                 -- studio → Alice (or → both)
  settle_failure_reason      text,

  created_at                 timestamptz not null default now(),
  expires_at                 timestamptz not null check (expires_at > created_at),
  accepted_at                timestamptz,
  settled_at                 timestamptz
);

comment on table public.challenges
  is 'Async 1v1 challenges. Stakes escrowed off-chain in the studio wallet (mig #2) → on-chain ChallengeEscrow (mig #4). State machine lives here.';

-- ─── 3. Indexes (all idempotent) ──────────────────────────────────────────
-- Browsing the public feed ("open challenges for my game today")
create index if not exists idx_challenges_open_feed
  on public.challenges (game_slug, status, created_at desc);

-- "My open challenges" (creator view)
create index if not exists idx_challenges_by_creator
  on public.challenges (creator_address, status, created_at desc);

-- "Challenges I've accepted" (challenger view)
create index if not exists idx_challenges_by_challenger
  on public.challenges (challenger_address, status, created_at desc)
  where challenger_address is not null;

-- Tx-hash lookup for verify-tx + reconciliation
create index if not exists idx_challenges_creator_tx
  on public.challenges (creator_stake_tx_hash);

create index if not exists idx_challenges_challenger_tx
  on public.challenges (challenger_stake_tx_hash)
  where challenger_stake_tx_hash is not null;

-- ─── 4. RLS ───────────────────────────────────────────────────────────────
-- Public read (share links, "active challenges" feed). Writes via service
-- role only — route handlers own every state transition.
alter table public.challenges enable row level security;

drop policy if exists "challenges_public_read" on public.challenges;
create policy "challenges_public_read"
  on public.challenges
  for select
  using (true);
