-- v2_20260510_auth_nonces.sql
-- Sprint X2 Layer 1B — SIWB nonce store for skillos.network/v1/auth/siwb/*
--
-- Pattern follows existing v2_* migrations: forward-only, no DROPs of public
-- objects, additive columns only on existing tables.
--
-- Schema rationale:
--   nonce            — text PK; opaque cryptographic random (32 bytes hex)
--   wallet_address   — text indexed; lowercase 0x-prefixed for case-insensitive
--                      lookups; no FK (wallets are global, no users table)
--   issued_at        — timestamptz; UTC, default now()
--   expires_at       — timestamptz indexed; NOT NULL; cleanup queries filter
--                      WHERE expires_at < now()
--   consumed         — boolean default false; flipped to true on successful
--                      verify; never reset (single-use)
--
-- Partial unique index on (wallet_address) WHERE consumed = false enforces
-- at-most-one outstanding nonce per wallet. issueNonce() handles this with
-- a delete-then-insert (REPLACE pattern) so a user re-requesting a nonce
-- (e.g., cancelled signing modal, retry) succeeds rather than 409s.
-- See apps/api/src/lib/auth-store.ts for the consume contract.
--
-- TTL: enforced at read time via expires_at filter. Periodic cleanup is
-- deferred (DB row count is bounded by active-user concurrency × 5min TTL).

CREATE TABLE IF NOT EXISTS public.skillos_auth_nonces (
  nonce            text         PRIMARY KEY,
  wallet_address   text         NOT NULL,
  issued_at        timestamptz  NOT NULL DEFAULT now(),
  expires_at       timestamptz  NOT NULL,
  consumed         boolean      NOT NULL DEFAULT false
);

-- Lookup by wallet (for issueNonce REPLACE pattern + audit).
CREATE INDEX IF NOT EXISTS idx_skillos_auth_nonces_wallet
  ON public.skillos_auth_nonces (wallet_address);

-- Cleanup-friendly index for expires_at scans.
CREATE INDEX IF NOT EXISTS idx_skillos_auth_nonces_expires
  ON public.skillos_auth_nonces (expires_at);

-- At-most-one outstanding nonce per wallet. NULL/false fast path for inserts;
-- consumed=true rows are excluded so historical nonces don't block new ones.
CREATE UNIQUE INDEX IF NOT EXISTS uq_skillos_auth_nonces_outstanding
  ON public.skillos_auth_nonces (wallet_address)
  WHERE consumed = false;

-- RLS: server-side writes only, no client direct access. Service role bypasses
-- RLS by default; explicit policy block prevents anon-key access.
ALTER TABLE public.skillos_auth_nonces ENABLE ROW LEVEL SECURITY;
-- No policies created → no anon access. Service role still has full access.
