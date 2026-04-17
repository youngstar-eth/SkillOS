import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "../../supabase/server";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Shared `/api/leaderboard` GET handler. Reads the public leaderboard view. */
export async function leaderboardHandler(req: NextRequest) {
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100_000);

  const supabase = createServerSupabase();
  const { data, count, error } = await supabase
    .from("leaderboard")
    .select("*", { count: "exact" })
    .order("best_score", { ascending: false, nullsFirst: false })
    .order("last_played_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "db_error", detail: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
