import type { SupabaseClient } from "@supabase/supabase-js";
import type { Challenge } from "./types";

/**
 * Open challenges feed. Show most recent `open` challenges for a game slug
 * (or all games if none provided).
 */
export async function listOpenChallenges(
  supabase: SupabaseClient,
  opts: { gameSlug?: string; limit?: number } = {},
): Promise<Challenge[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let q = supabase
    .from("challenges")
    .select("*")
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.gameSlug) q = q.eq("game_slug", opts.gameSlug);
  const { data, error } = await q;
  if (error) throw new Error(`listOpenChallenges: ${error.message}`);
  return (data as Challenge[] | null) ?? [];
}

export async function listChallengesForUser(
  supabase: SupabaseClient,
  userAddress: string,
  limit = 50,
): Promise<Challenge[]> {
  const addr = userAddress.toLowerCase();
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .or(`creator_address.eq.${addr},challenger_address.eq.${addr}`)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error(`listChallengesForUser: ${error.message}`);
  return (data as Challenge[] | null) ?? [];
}
