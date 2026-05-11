-- v3_20260511_siwa_nonces.sql
-- Sprint X4 Layer 1C — SIWA (Sign In With Agent) nonce store for
-- skillos.network/v1/auth/siwa/*.
--
-- Why a separate table from skillos_auth_nonces (SIWB):
--   - SIWA nonces are wallet-address-agnostic at issue time. The address
--     only appears inside the SIWA message at verify time. The SIWA library's
--     `SIWANonceStore` interface (packages/siwa/src/nonce-store.ts) has just
--     two methods: `issue(nonce, ttlMs)` and `consume(nonce)`. No wallet
--     binding at the storage layer.
--   - SIWB's schema couples wallet_address + nonce so the REPLACE pattern
--     can clear stale rows on retry. SIWA's library doesn't need (or want)
--     that coupling.
--   - "Single store, two consumers" (founder Q2 lock) = single Supabase
--     project + namespaced tables. Future Upstash migration unifies under
--     key prefixes (`siwb:nonce:0x...` vs `siwa:nonce:...`).
--
-- Schema:
--   nonce       — text PK; raw SIWA nonce (≥8 alphanumeric, default 16 chars
--                 hex per @buildersgarden/siwa generateNonce(16))
--   expires_at  — timestamptz NOT NULL; consume() checks > now()
--
-- No `consumed` column — consume is implemented as DELETE...RETURNING. The
-- atomic delete acts as the check-and-flip: row exists + unexpired = first
-- consumer wins. Audit trail for replay attempts deferred (low-value until
-- mainnet abuse signal).
--
-- TTL: 5 minutes (matches SIWB, founder Q2 recommendation). Cleanup at
-- read time via expires_at filter. Periodic vacuum/cleanup deferred.

CREATE TABLE IF NOT EXISTS public.skillos_siwa_nonces (
  nonce        text         PRIMARY KEY,
  expires_at   timestamptz  NOT NULL
);

-- Cleanup-friendly index for expires_at scans.
CREATE INDEX IF NOT EXISTS idx_skillos_siwa_nonces_expires
  ON public.skillos_siwa_nonces (expires_at);

-- RLS: server-side writes only, no client direct access. Service role
-- bypasses RLS by default; absence of policies blocks anon-key access.
ALTER TABLE public.skillos_siwa_nonces ENABLE ROW LEVEL SECURITY;
