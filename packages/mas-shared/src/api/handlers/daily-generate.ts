import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "../../supabase/server";
import { generateDailyChallenge } from "../../ai/generate-challenge";
import { CHALLENGE_MODEL } from "../../ai/client";

/**
 * POST /api/daily/generate
 * GET  /api/daily/generate?game=<slug>   (Vercel cron-friendly variant)
 *
 * Protected by Bearer $CRON_SECRET (or ?secret=... on GET). Generates today's
 * challenge for the requested game via Claude, then upserts into
 * `daily_challenges` keyed on (game_slug, challenge_date).
 */
export async function dailyGenerateHandler(req: NextRequest) {
  // ─── auth ────────────────────────────────────────────────────────────
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "cron_secret_not_configured" },
      { status: 500 },
    );
  }

  const headerAuth = req.headers.get("authorization") ?? "";
  const querySecret = req.nextUrl.searchParams.get("secret") ?? "";
  const okFromHeader = headerAuth === `Bearer ${expected}`;
  const okFromQuery = querySecret === expected;
  if (!okFromHeader && !okFromQuery) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ─── resolve gameSlug (accept query or body) ─────────────────────────
  let gameSlug = req.nextUrl.searchParams.get("game") ?? "";
  if (!gameSlug && req.method === "POST") {
    try {
      const body = (await req.json()) as { gameSlug?: string };
      gameSlug = body.gameSlug ?? "";
    } catch {
      // fall through — error below
    }
  }
  if (!gameSlug) {
    return NextResponse.json({ error: "missing_game" }, { status: 400 });
  }

  // ─── generate via Claude ─────────────────────────────────────────────
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  let challenge;
  try {
    challenge = await generateDailyChallenge(gameSlug, today);
  } catch (e) {
    return NextResponse.json(
      {
        error: "ai_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  // ─── upsert ───────────────────────────────────────────────────────────
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("daily_challenges")
    .upsert(
      {
        game_slug: gameSlug,
        challenge_date: todayStr,
        theme: challenge.theme,
        // Supabase's generated `Json` type doesn't accept discriminated
        // union object types even though the runtime JSON is perfectly
        // valid — we cast via `any`.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        challenge_data: challenge.data as any,
        ai_description: challenge.description,
        model_used: CHALLENGE_MODEL,
      },
      { onConflict: "game_slug,challenge_date" },
    )
    .select(
      "id, game_slug, challenge_date, theme, challenge_data, ai_description, created_at",
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: "db_error", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, challenge: data });
}
