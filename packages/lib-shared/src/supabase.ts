import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Re-export the canonical Duel + DuelStatus types so consumers can
// `import { Duel } from "@skillos/lib-shared"` without reaching
// into @skillos/game-types directly.
export type { Duel, DuelStatus } from "@skillos/game-types";

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
//
// `cache: "no-store"` on the fetch override is load-bearing: without it,
// Next.js's App Router fetch cache treats PostgREST GETs (i.e. every
// supabase-js `.select()`) as cacheable, and a stale empty response
// persists across requests. That silently breaks dedupe SELECTs in the
// cron (we observed this while wiring runCreateTournaments). All Supabase
// reads are DB-backed; caching them at the framework layer is never what
// we want.
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
    global: {
      fetch: (input, init) =>
        fetch(input as RequestInfo, { ...init, cache: "no-store" }),
    },
  });
}
