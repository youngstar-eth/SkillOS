import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Row types ─────────────────────────────────────────────────────────────

export type DuelStatus =
  | "queued"
  | "matched"
  | "player1_submitted"
  | "player2_submitted"
  | "settled"
  | "refunded";

/** Row shape for the v2_duels table. */
export interface Duel {
  id: string;
  /** 0x-prefixed bytes32 hex matching ChallengeEscrow challenges[id]. */
  onchain_id: string | null;
  status: DuelStatus;
  player1_address: string;
  player1_score: number | null;
  player1_submitted_at: string | null;
  player2_address: string | null;
  player2_score: number | null;
  player2_submitted_at: string | null;
  /** 0x + 64 hex, shared with Agent 1 for deterministic 2048 RNG. */
  seed: string;
  stake_amount_usdc: number;
  matched_at: string | null;
  settled_at: string | null;
  winner_address: string | null;
  create_tx_hash: string | null;
  accept_tx_hash: string | null;
  settle_tx_hash: string | null;
  created_at: string;
  updated_at: string | null;
}

// ─── Clients ───────────────────────────────────────────────────────────────

// Browser / anon client — safe for client components. Reads-only under RLS.
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  browserClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return browserClient;
}

// Server-only client with service-role key — bypasses RLS. Used by API routes
// for matchmaking, score writes, and settle. NEVER import into a client
// component.
export function getSupabaseService(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
