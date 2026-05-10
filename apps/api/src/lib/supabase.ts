// Singleton Supabase client for read endpoints. Service-role-keyed so it
// bypasses RLS on internal tables (v2_tournaments etc.). Lazy: env access
// only happens on first call so a misconfigured local dev doesn't break
// the function boot.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
