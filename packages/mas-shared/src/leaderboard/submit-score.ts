import { createAdminSupabase } from "../supabase/server";
import type { SubmitScoreInput } from "./types";

const RATE_LIMIT_PER_DAY = 50;

/**
 * Insert a score submission into game_scores. Anti-spam: rejects more than
 * RATE_LIMIT_PER_DAY submissions per (user, game, day). Returns the new row's
 * id on success.
 *
 * Demo-grade trust model: client supplies its own wallet address. Production
 * should sign a SIWE message and verify before insert.
 */
export async function submitScore(
  input: SubmitScoreInput,
): Promise<{ id: string }> {
  const userAddress = input.userAddress.toLowerCase();
  const today = new Date().toISOString().split("T")[0];

  const admin = createAdminSupabase();

  const { count, error: countErr } = await admin
    .from("game_scores")
    .select("id", { count: "exact", head: true })
    .eq("user_address", userAddress)
    .eq("game_slug", input.gameSlug)
    .gte("submitted_at", `${today}T00:00:00Z`);
  if (countErr) throw new Error(`rate_check: ${countErr.message}`);
  if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
    throw Object.assign(new Error("rate_limit"), { status: 429 });
  }

  const { data, error } = await admin
    .from("game_scores")
    .insert({
      user_address: userAddress,
      game_slug: input.gameSlug,
      tournament_id: input.tournamentId ?? null,
      score: input.score,
      // Supabase Json type doesn't accept arbitrary records; cast through any.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      game_data: (input.gameData ?? null) as any,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`submitScore insert: ${error?.message}`);

  return { id: data.id };
}
