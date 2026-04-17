import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createJsClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-side Supabase client scoped to the current request's cookies.
 * Uses the anon key — subject to RLS. Read session state, call SELECTs
 * safely from server components, route handlers, or server actions.
 */
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component write — safe to ignore; middleware will refresh.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Server Component write — safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Admin client — bypasses RLS. NEVER expose to the browser.
 * Use inside route handlers that have already verified the caller's identity
 * (e.g. via a Farcaster Quick Auth JWT or a signed SIWE message).
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — server only.");
  }
  return createJsClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
