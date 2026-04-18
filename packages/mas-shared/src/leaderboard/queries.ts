import { createAdminSupabase } from "../supabase/server";
import type { CategoryKey } from "./config";
import { CATEGORIES, rankToPoints } from "./config";
import type {
  AggregateLeaderboardEntry,
  GameLeaderboardEntry,
  UserDayStats,
} from "./types";

const todayStr = () => new Date().toISOString().split("T")[0];

/**
 * Per-game leaderboard for a specific day.
 *
 * For "today" (the live day), we read raw scores via the RPC and rank live —
 * `daily_ranks` lags behind real-time submissions until the cron runs. For
 * historical days we read the `daily_ranks` snapshot directly.
 */
export async function getGameLeaderboard(
  gameSlug: string,
  day: string = todayStr(),
  limit = 100,
): Promise<GameLeaderboardEntry[]> {
  const admin = createAdminSupabase();
  const today = todayStr();

  if (day === today) {
    const { data, error } = await admin.rpc("get_best_scores_for_day", {
      p_game: gameSlug,
      p_day: day,
    });
    if (error) throw new Error(`get_best_scores_for_day: ${error.message}`);
    if (!data) return [];
    return data.slice(0, limit).map((row, idx) => {
      const rank = idx + 1;
      return {
        user_address: row.user_address,
        game_slug: gameSlug,
        rank,
        best_score: Number(row.best_score),
        rank_points: rankToPoints(rank),
      };
    });
  }

  const { data, error } = await admin
    .from("daily_ranks")
    .select("user_address, game_slug, rank, best_score, rank_points")
    .eq("game_slug", gameSlug)
    .eq("day", day)
    .order("rank", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`daily_ranks read: ${error.message}`);
  return (data ?? []).map((r) => ({
    user_address: r.user_address,
    game_slug: r.game_slug,
    rank: r.rank,
    best_score: Number(r.best_score),
    rank_points: r.rank_points,
  }));
}

/** Category leaderboard — uses the precomputed daily_aggregates table. */
export async function getCategoryLeaderboard(
  category: CategoryKey,
  day: string = todayStr(),
  limit = 50,
): Promise<AggregateLeaderboardEntry[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("daily_aggregates")
    .select(
      "user_address, scope, category, rank, total_points, games_played, multi_game_bonus_applied",
    )
    .eq("scope", "category")
    .eq("category", category)
    .eq("day", day)
    .order("rank", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`getCategoryLeaderboard: ${error.message}`);
  return (data ?? []).map(toAggregateEntry);
}

/** Overall leaderboard — across all 20 games, with multi-game bonus applied. */
export async function getOverallLeaderboard(
  day: string = todayStr(),
  limit = 50,
): Promise<AggregateLeaderboardEntry[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("daily_aggregates")
    .select(
      "user_address, scope, category, rank, total_points, games_played, multi_game_bonus_applied",
    )
    .eq("scope", "overall")
    .is("category", null)
    .eq("day", day)
    .order("rank", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`getOverallLeaderboard: ${error.message}`);
  return (data ?? []).map(toAggregateEntry);
}

/** Single-user dashboard: their rank across every scope today. */
export async function getUserStats(
  userAddress: string,
  day: string = todayStr(),
): Promise<UserDayStats> {
  const admin = createAdminSupabase();
  const lower = userAddress.toLowerCase();

  const [{ data: ranks }, { data: aggregates }] = await Promise.all([
    admin
      .from("daily_ranks")
      .select("game_slug, rank, best_score, rank_points")
      .eq("user_address", lower)
      .eq("day", day),
    admin
      .from("daily_aggregates")
      .select("scope, category, rank, total_points, games_played")
      .eq("user_address", lower)
      .eq("day", day),
  ]);

  const overall = aggregates?.find(
    (a) => a.scope === "overall" && a.category === null,
  );
  const categoryRanks: Partial<Record<CategoryKey, number>> = {};
  for (const a of aggregates ?? []) {
    if (a.scope === "category" && a.category && a.rank) {
      categoryRanks[a.category as CategoryKey] = a.rank;
    }
  }

  const gameRanks: UserDayStats["gameRanks"] = {};
  for (const r of ranks ?? []) {
    gameRanks[r.game_slug] = {
      rank: r.rank,
      bestScore: Number(r.best_score),
      rankPoints: r.rank_points,
    };
  }

  return {
    day,
    totalPoints: overall?.total_points ?? 0,
    gamesPlayed: overall?.games_played ?? Object.keys(gameRanks).length,
    overallRank: overall?.rank ?? null,
    categoryRanks,
    gameRanks,
  };
}

function toAggregateEntry(row: {
  user_address: string;
  scope: string;
  category: string | null;
  rank: number | null;
  total_points: number;
  games_played: number;
  multi_game_bonus_applied: boolean;
}): AggregateLeaderboardEntry {
  return {
    user_address: row.user_address,
    scope: row.scope as "category" | "overall",
    category: row.category as CategoryKey | null,
    rank: row.rank ?? 0,
    total_points: row.total_points,
    games_played: row.games_played,
    multi_game_bonus_applied: row.multi_game_bonus_applied,
  };
}

/** Lightweight category metadata for UI rendering. */
export function listCategories(): Array<{
  key: CategoryKey;
  label: string;
  games: readonly string[];
}> {
  return Object.entries(CATEGORIES).map(([key, def]) => ({
    key: key as CategoryKey,
    label: def.label,
    games: def.games as readonly string[],
  }));
}
