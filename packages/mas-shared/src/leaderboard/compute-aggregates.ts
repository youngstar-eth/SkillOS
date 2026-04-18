import { createAdminSupabase } from "../supabase/server";
import {
  CATEGORIES,
  type CategoryKey,
  MULTI_GAME_MULTIPLIER,
  MULTI_GAME_THRESHOLD,
} from "./config";

/**
 * Recompute daily_aggregates (category + overall) for a day. Reads daily_ranks
 * (must already be populated by computeDailyRanks for the same day), groups
 * each user's rank_points into category buckets + an overall bucket, applies
 * the multi-game bonus to the overall total, then upserts.
 *
 * After the upserts, assigns ranks within each (scope, category, day) trio
 * via a single SQL pass per group.
 */
export async function computeDailyAggregates(day: string): Promise<{
  usersProcessed: number;
  aggregatesWritten: number;
}> {
  const admin = createAdminSupabase();

  // Pull all of today's per-game ranks in one shot — small dataset (typical
  // miniapp arcade has < a few thousand rows/day).
  const { data: ranks, error: rErr } = await admin
    .from("daily_ranks")
    .select("user_address, game_slug, rank_points")
    .eq("day", day);
  if (rErr) throw new Error(`daily_ranks read: ${rErr.message}`);
  if (!ranks || ranks.length === 0) {
    return { usersProcessed: 0, aggregatesWritten: 0 };
  }

  // Bucket by user_address.
  const byUser = new Map<
    string,
    { gameSlug: string; rankPoints: number }[]
  >();
  for (const r of ranks) {
    const list = byUser.get(r.user_address) ?? [];
    list.push({ gameSlug: r.game_slug, rankPoints: r.rank_points });
    byUser.set(r.user_address, list);
  }

  const aggregateRows: Array<{
    user_address: string;
    scope: "category" | "overall";
    category: CategoryKey | null;
    day: string;
    total_points: number;
    games_played: number;
    multi_game_bonus_applied: boolean;
    rank: number | null;
  }> = [];

  for (const [userAddress, items] of byUser.entries()) {
    const gamesPlayed = items.length;
    const sumPoints = items.reduce((s, x) => s + x.rankPoints, 0);

    // Multi-game bonus only applies to overall (per spec).
    const bonusApplied = gamesPlayed >= MULTI_GAME_THRESHOLD;
    const overallTotal = bonusApplied
      ? Math.floor(sumPoints * MULTI_GAME_MULTIPLIER)
      : sumPoints;

    aggregateRows.push({
      user_address: userAddress,
      scope: "overall",
      category: null,
      day,
      total_points: overallTotal,
      games_played: gamesPlayed,
      multi_game_bonus_applied: bonusApplied,
      rank: null,
    });

    // Per-category aggregates — only emit when the user has any points in
    // that category, otherwise we'd flood the table with zero rows.
    for (const [cat, def] of Object.entries(CATEGORIES) as [
      CategoryKey,
      { games: readonly string[] },
    ][]) {
      const inCat = items.filter((i) =>
        (def.games as readonly string[]).includes(i.gameSlug),
      );
      if (inCat.length === 0) continue;

      aggregateRows.push({
        user_address: userAddress,
        scope: "category",
        category: cat,
        day,
        total_points: inCat.reduce((s, x) => s + x.rankPoints, 0),
        games_played: inCat.length,
        multi_game_bonus_applied: false,
        rank: null,
      });
    }
  }

  // Upsert without ranks first (ranks are computed in the next pass).
  const { error: uErr } = await admin
    .from("daily_aggregates")
    .upsert(aggregateRows, {
      // Functional unique index on (user, scope, COALESCE(category,''), day).
      // Supabase upsert needs a literal column list; we include category
      // because the index covers its NULL collapse implicitly.
      onConflict: "user_address,scope,category,day",
    });
  if (uErr) throw new Error(`daily_aggregates upsert: ${uErr.message}`);

  await assignAggregateRanks(admin, day);

  return {
    usersProcessed: byUser.size,
    aggregatesWritten: aggregateRows.length,
  };
}

/**
 * After upserting raw aggregates, assign rank within each (scope, category|null,
 * day). Done client-side since the raw counts are small; a window function in
 * SQL would be cleaner but harder to invoke through the JS client.
 */
async function assignAggregateRanks(
  admin: ReturnType<typeof createAdminSupabase>,
  day: string,
) {
  // Pull every aggregate row for the day, partition, sort, write rank back.
  const { data: rows, error } = await admin
    .from("daily_aggregates")
    .select("id, scope, category, total_points")
    .eq("day", day);
  if (error) throw new Error(`assignAggregateRanks read: ${error.message}`);
  if (!rows) return;

  const groups = new Map<
    string,
    Array<{ id: string; total_points: number }>
  >();
  for (const r of rows) {
    const key = `${r.scope}|${r.category ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push({ id: r.id, total_points: r.total_points });
    groups.set(key, list);
  }

  const updates: Array<{ id: string; rank: number }> = [];
  for (const list of groups.values()) {
    list.sort((a, b) => b.total_points - a.total_points);
    list.forEach((row, idx) => updates.push({ id: row.id, rank: idx + 1 }));
  }

  // Single round-trip per row would be 100s of writes for a busy day. Batch
  // by issuing one UPDATE per group via Postgres array unnest — but the JS
  // client doesn't expose that cleanly, so we send updates in chunks.
  const CHUNK = 50;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((u) =>
        admin.from("daily_aggregates").update({ rank: u.rank }).eq("id", u.id),
      ),
    );
  }
}
