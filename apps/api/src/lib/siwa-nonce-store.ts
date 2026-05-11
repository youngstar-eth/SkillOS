// Supabase-backed SIWANonceStore for SIWA sign-in replay protection.
//
// Implements the @buildersgarden/siwa SIWANonceStore interface (2 methods):
//   - issue(nonce, ttlMs): true on success, false if nonce already exists
//   - consume(nonce):       true if existed AND not expired (atomic), false else
//
// Backed by the `skillos_siwa_nonces` table (Supabase). Separate from SIWB's
// `skillos_auth_nonces` because SIWA nonces are wallet-address-agnostic at
// issue time — the address only appears in the SIWA message at verify time.
// See supabase/migrations/v3_20260511_siwa_nonces.sql.
//
// Atomic semantics:
//   - issue: INSERT with PK conflict → unique constraint catches replays.
//   - consume: DELETE...RETURNING → row exists + first deleter wins.
// Both ops are single-statement and rely on Postgres atomicity. No row
// locking required.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SIWANonceStore } from '@buildersgarden/siwa/nonce-store';

const TABLE = 'skillos_siwa_nonces';

let cachedClient: SupabaseClient | undefined;
function client(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export function createSupabaseSIWANonceStore(): SIWANonceStore {
  return {
    async issue(nonce: string, ttlMs: number): Promise<boolean> {
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      const { error } = await client()
        .from(TABLE)
        .insert({ nonce, expires_at: expiresAt });
      if (!error) return true;
      // Conflict on PK = duplicate nonce (replay attempt).
      if (error.code === '23505') return false;
      throw new Error(`SIWA nonce issue failed: ${error.message}`);
    },

    async consume(nonce: string): Promise<boolean> {
      const nowIso = new Date().toISOString();
      const { data, error } = await client()
        .from(TABLE)
        .delete()
        .eq('nonce', nonce)
        .gt('expires_at', nowIso)
        .select('nonce');
      if (error) throw new Error(`SIWA nonce consume failed: ${error.message}`);
      return Array.isArray(data) && data.length > 0;
    },
  };
}
