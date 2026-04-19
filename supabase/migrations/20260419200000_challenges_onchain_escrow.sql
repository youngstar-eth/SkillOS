-- ─── Feature 2b: On-chain ChallengeEscrow integration ─────────────────────
-- Adds columns to bridge the DB row with the on-chain contract at
-- 0x52e5E45456DeC882048b430a968Cda6061575be0. The off-chain studio escrow
-- path (stake → studio wallet USDC.transfer) is deprecated; stakes now go
-- directly into the contract via createChallenge() / acceptChallenge().
--
-- Existing DB status granularity (creator_played, challenger_played,
-- both_played, walkover_*) is preserved — the contract's coarser 6-state
-- enum (None/Open/Accepted/Settled/Expired/Walkover) is represented
-- implicitly via the onchain event logs we verify + the DB status.

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

-- onchain_id must be unique when set.
create unique index if not exists uniq_challenges_onchain_id
  on public.challenges(onchain_id)
  where onchain_id is not null;

-- Old `creator_stake_tx_hash` column was NOT NULL with default empty string.
-- In the on-chain flow we don't write to it on create (tx hash is only known
-- after confirm-create). Relax the NOT NULL so new rows can be
-- pending_creator_stake with no tx hash yet.
alter table public.challenges
  alter column creator_stake_tx_hash drop not null;

comment on column public.challenges.onchain_id
  is 'bytes32 derived from the UUID primary key — passed as `id` to ChallengeEscrow.createChallenge().';
comment on column public.challenges.settle_signature
  is 'ECDSA signature from trustedSigner over the settle digest. Client submits to contract.settle().';
