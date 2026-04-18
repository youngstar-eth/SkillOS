import { createAdminSupabase } from "../supabase/server";
import { rankToPoints } from "./config";

/**
 * Recompute per-game daily_ranks for a given day. For each game that saw any
 * submission, fetch each player's best score, sort desc, and upsert one row
 * per (user, game, day) with their rank + rank_points.
 *
 * Idempotent — re-running with the same day overwrites the previous snapshot.
 * Safe to call mid-day (gives an interim leaderboard) or as the end-of-day
 * cron snapshot.
 */
export async function computeDailyRanks(day: string): Promise<{
  gamesProcessed: number;
  ranksWritten: number;
}> {
  const admin = createAdminSupabase();

  const { data: games, error: gErr } = await admin.rpc(
    "get_unique_games_for_day",
    { p_day: day },
  );
  if (gErr) throw new Error(`get_unique_games_for_day: ${gErr.message}`);
  if (!games || games.length === 0) {
    return { gamesProcessed: 0, ranksWritten: 0 };
  }

  let ranksWritten = 0;

  for (const g of games) {
    const { data: bestScores, error: bErr } = await admin.rpc(
      "get_best_scores_for_day",
      { p_game: g.game_slug, p_day: day },
    );
    if (bErr) throw new Error(`get_best_scores_for_day: ${bErr.message}`);
    if (!bestScores) continue;

    // RPC already orders by best_score desc — index = rank - 1.
    const rows = bestScores.map((row, idx) => {
      const rank = idx + 1;
      return {
        user_address: row.user_address,
        game_slug: g.game_slug,
        day,
        rank,
        best_score: Number(row.best_score),
        rank_points: rankToPoints(rank),
      };
    });

    if (rows.length === 0) continue;

    const { error: uErr } = await admin
      .from("daily_ranks")
      .upsert(rows, { onConflict: "user_address,game_slug,day" });
    if (uErr) throw new Error(`daily_ranks upsert: ${uErr.message}`);

    ranksWritten += rows.length;
  }

  return { gamesProcessed: games.length, ranksWritten };
}
