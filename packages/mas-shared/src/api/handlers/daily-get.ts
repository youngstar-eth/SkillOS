import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "../../supabase/server";

/**
 * GET /api/daily?game=<slug>
 *
 * Public read — no auth. Returns today's row from `daily_challenges`
 * for the given slug, or 404 if the cron hasn't produced one yet.
 */
export async function dailyGetHandler(req: NextRequest) {
  const gameSlug = req.nextUrl.searchParams.get("game");
  if (!gameSlug) {
    return NextResponse.json({ error: "missing_game" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("daily_challenges")
    .select("*")
    .eq("game_slug", gameSlug)
    .eq("challenge_date", today)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json(
      { error: "db_error", detail: error.message, gameSlug, today },
      { status: 500 },
    );
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "no_challenge_today", gameSlug, today },
      { status: 404 },
    );
  }

  return NextResponse.json(data[0]);
}
