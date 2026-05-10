// Supabase-backed nonce store for SIWB auth.
//
// REPLACE pattern on issue: when a wallet requests a fresh nonce while one
// is still outstanding (e.g., user cancelled the signing modal and retried),
// we DELETE the old unconsumed row and INSERT the new one rather than 409.
// UX rationale: failing the user on a cancel-and-retry is worse than
// rotating the nonce; the old nonce is invalidated server-side either way.
//
// This means the partial unique index on (wallet_address) WHERE consumed=false
// (defined in supabase/migrations/v2_20260510_auth_nonces.sql) is enforced
// by us via DELETE-then-INSERT, not relied on as a constraint that catches
// drift — it remains a defensive backstop.
//
// Consume is atomic: a single UPDATE with WHERE clauses for nonce + wallet
// + not-consumed + not-expired + RETURNING. Either the row is updated (we
// own the consume) or it isn't (someone else, expired, or already consumed).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const TABLE = 'skillos_auth_nonces';
const TTL_MINUTES = 5;

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

export interface IssuedNonce {
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

export async function issueNonce(walletAddress: string): Promise<IssuedNonce> {
  const wallet = walletAddress.toLowerCase();
  const nonce = randomBytes(16).toString('hex'); // 32 char hex, matches Base's nonce regex `\w{32}$`
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60_000);

  // REPLACE: clear any outstanding (unconsumed) nonce for this wallet first.
  // Two-step (delete + insert) instead of an UPSERT because we want the
  // partial unique index to stay clean; UPSERT would conflict on the index.
  await client()
    .from(TABLE)
    .delete()
    .eq('wallet_address', wallet)
    .eq('consumed', false);

  const { error } = await client().from(TABLE).insert({
    nonce,
    wallet_address: wallet,
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    consumed: false,
  });
  if (error) throw new Error(`issueNonce insert failed: ${error.message}`);

  return { nonce, issuedAt: now, expiresAt };
}

export type ConsumeResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'CONSUMED' };

export async function consumeNonce(
  nonce: string,
  walletAddress: string,
): Promise<ConsumeResult> {
  const wallet = walletAddress.toLowerCase();
  const nowIso = new Date().toISOString();

  // Atomic: only updates if all conditions hold. RETURNING tells us whether
  // the row was actually flipped — the only way to distinguish "already
  // consumed" from "expired" or "not found".
  const { data: updated, error: updateErr } = await client()
    .from(TABLE)
    .update({ consumed: true })
    .eq('nonce', nonce)
    .eq('wallet_address', wallet)
    .eq('consumed', false)
    .gt('expires_at', nowIso)
    .select();
  if (updateErr) throw new Error(`consumeNonce update failed: ${updateErr.message}`);

  if (updated && updated.length > 0) return { ok: true };

  // Diagnostic read: figure out *why* the consume failed so we can return a
  // specific error code to the client.
  const { data: existing } = await client()
    .from(TABLE)
    .select('consumed, expires_at')
    .eq('nonce', nonce)
    .eq('wallet_address', wallet)
    .maybeSingle();

  if (!existing) return { ok: false, reason: 'NOT_FOUND' };
  if (existing.consumed) return { ok: false, reason: 'CONSUMED' };
  if (new Date(existing.expires_at) < new Date()) {
    return { ok: false, reason: 'EXPIRED' };
  }
  // Race: nonce was valid at the diagnostic read but expired between the
  // update attempt and the read. Treat as expired for the caller.
  return { ok: false, reason: 'EXPIRED' };
}
