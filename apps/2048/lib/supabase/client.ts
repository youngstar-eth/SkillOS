import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/supabase";

/**
 * Browser-side Supabase client.
 * Uses the anon key — subject to RLS policies.
 * Safe to call from "use client" components.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
