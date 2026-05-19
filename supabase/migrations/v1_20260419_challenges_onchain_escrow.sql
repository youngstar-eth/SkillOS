-- ───────────────────────────────────────────────────────────────────────────
-- X19 Class A2 — Audit-trail backfill (4 of 4)
-- Source: git show 0dba6bf^:supabase/migrations/20260419200000_challenges_onchain_escrow.sql
-- Original applied: pre-rebrand (April 2026); deleted from git in commit
--   `0dba6bf chore: skillbase v2 clean scaffold` (2026-04-20).
--
-- ─── Why this file exists ─────────────────────────────────────────────────
-- See peer file v1_20260419_payouts_instant_scope.sql for full X19 context.
-- This migration adds 6 columns to `challenges` for the on-chain
-- ChallengeEscrow integration (contract @ 0x52e5E45456DeC882048b430a968Cda6061575be0
-- in the original; the current canonical deployment is tracked in
-- contracts/deployments/wallets-base-sepolia.md per X19b memory).
--
-- Idempotent shape:
--   - ADD COLUMN IF NOT EXISTS for all 6 columns.
--   - CREATE UNIQUE INDEX IF NOT EXISTS for the onchain_id index.
--   - DROP NOT NULL guarded (skips if already nullable).
--
-- ─── Pre-apply verification REQUIRED (Supabase MCP) ───────────────────────
-- 1. mcp execute_sql -- SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='challenges'
--        AND column_name IN ('onchain_id','onchain_create_tx_hash',
--          'onchain_accept_tx_hash','onchain_settle_tx_hash',
--          'contract_address','settle_signature');
--    → expected: 6 rows on prod (all present).
-- 2. mcp execute_sql -- SELECT is_nullable FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='challenges'
--        AND column_name='creator_stake_tx_hash';
--    → expected: 'YES' (relaxed by mig #4).
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. Add 6 on-chain bridge columns ─────────────────────────────────────
-- ADD COLUMN IF NOT EXISTS is fully idempotent (Postgres 9.6+).
alter table public.challenges
  -- bytes32 id we pass into the contract (derived from the UUID at create time)
  add column if not exists onchain_id text,
  add column if not exists onchain_create_tx_hash  text,
  add column if not exists onchain_accept_tx_hash  text,
  add column if not exists onchain_settle_tx_hash  text,
  -- Every row records which contract it was staked into (lets us change
  -- deployments without orphaning past rows)
  add column if not exists contract_address text,
  -- Server-signed settle attestation. Client submits this to the contract.
  add column if not exists settle_signature text;

-- ─── 2. Unique index on onchain_id (partial — null allowed) ──────────────
create unique index if not exists uniq_challenges_onchain_id
  on public.challenges(onchain_id)
  where onchain_id is not null;

-- ─── 3. Relax creator_stake_tx_hash NOT NULL ──────────────────────────────
-- On-chain flow: tx hash unknown at create time (only learned after
-- confirm-create). Guarded so re-runs are no-ops.
do $$
declare
  is_not_null boolean;
begin
  select (is_nullable = 'NO') into is_not_null
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'challenges'
     and column_name  = 'creator_stake_tx_hash';

  if is_not_null then
    alter table public.challenges
      alter column creator_stake_tx_hash drop not null;
  end if;
end $$;

-- ─── 4. Column comments (idempotent — COMMENT replaces) ──────────────────
comment on column public.challenges.onchain_id
  is 'bytes32 derived from the UUID primary key — passed as `id` to ChallengeEscrow.createChallenge().';
comment on column public.challenges.settle_signature
  is 'ECDSA signature from trustedSigner over the settle digest. Client submits to contract.settle().';
