-- ─── Feature 2: Async Challenge System ─────────────────────────────────────
-- Off-chain escrow pattern: the studio wallet custodies stakes via real
-- USDC.transfer txns (Basescan-verifiable). Pairing + state machine live
-- here. `maxPlayers=2` enforced at the application level + by a partial
-- unique constraint that prevents a second accept from landing.
--
-- Contract strategy memo: we deliberately do NOT use ArcadePool for this
-- feature. The pool contract has no maxPlayers cap, so a griefer could
-- intrude on Alice/Bob's 1v1. A dedicated Challenge1v1.sol is v2 post-demo.

-- ─── 1. Widen payouts.scope to accept 'challenge' ──────────────────────────
-- Same pattern as 20260419000000_payouts_instant_scope.sql. Inline CHECK
-- gets Postgres-default name `<table>_<col>_check`, so it's deterministic.
alter table public.payouts
  drop constraint payouts_scope_check;

alter table public.payouts
  add constraint payouts_scope_check
  check (scope in ('game', 'category', 'overall', 'instant', 'challenge'));

-- ─── 2. challenges table ────────────────────────────────────────────────────
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
  is 'Async 1v1 challenges. Stakes escrowed off-chain in the studio wallet; state machine lives here.';

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

-- ─── 3. RLS ────────────────────────────────────────────────────────────────
-- Public read (share links, "active challenges" feed). Writes via service
-- role only — route handlers own every state transition.
alter table public.challenges enable row level security;

drop policy if exists "challenges_public_read" on public.challenges;
create policy "challenges_public_read"
  on public.challenges
  for select
  using (true);
