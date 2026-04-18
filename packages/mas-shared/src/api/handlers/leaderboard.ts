import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "../../supabase/server";
import {
  CATEGORIES,
  type CategoryKey,
  getCategoryLeaderboard,
  getGameLeaderboard,
  getOverallLeaderboard,
  getUserStats,
  submitScore,
} from "../../leaderboard";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;
const today = () => new Date().toISOString().split("T")[0];

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

/**
 * Legacy `/api/leaderboard` GET — reads the cross-game `leaderboard` view
 * built off `game_sessions`. Kept for backwards compatibility with the 20
 * existing per-game route files. New per-game leaderboards should call
 * `makeGameLeaderboardHandler(slug)` which uses the new game_scores table.
 */
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

// ─── 3-tier leaderboard handlers ──────────────────────────────────────────
// New endpoints use the game_scores → daily_ranks → daily_aggregates pipeline
// (introduced in 20260418120000_leaderboard.sql). Each game wires these up
// at app/api/{submit-score,leaderboard-tiered,my-stats}/route.ts.

type SubmitBody = {
  userAddress?: string;
  gameSlug?: string;
  score?: number;
  tournamentId?: number | null;
  gameData?: Record<string, unknown>;
};

/**
 * POST /api/submit-score — body { userAddress, gameSlug, score, tournamentId?, gameData? }
 * Inserts into game_scores. Anti-spam ceiling enforced inside submitScore().
 *
 * Demo-grade auth: trusts client-supplied userAddress.
 */
export async function submitScoreHandler(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    !body.userAddress ||
    !body.gameSlug ||
    typeof body.score !== "number" ||
    body.score < 0 ||
    !Number.isFinite(body.score)
  ) {
    return NextResponse.json(
      { error: "missing_fields", required: "userAddress, gameSlug, score (>=0)" },
      { status: 400 },
    );
  }

  try {
    const result = await submitScore({
      userAddress: body.userAddress,
      gameSlug: body.gameSlug,
      score: Math.floor(body.score),
      tournamentId: body.tournamentId ?? null,
      gameData: body.gameData,
    });
    return NextResponse.json({ ok: true, scoreId: result.id });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e
        ? (e as { status: number }).status
        : 500;
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * GET /api/leaderboard-tiered?game=<slug>&day=<YYYY-MM-DD>&limit=N
 * Per-game tiered leaderboard — best-score-per-player from game_scores.
 */
export async function gameLeaderboardHandler(req: NextRequest) {
  const url = req.nextUrl;
  const gameSlug = url.searchParams.get("game");
  if (!gameSlug) {
    return NextResponse.json({ error: "missing_game" }, { status: 400 });
  }
  const day = url.searchParams.get("day") ?? today();
  const limit = clampInt(url.searchParams.get("limit"), 100, 1, 500);

  try {
    const data = await getGameLeaderboard(gameSlug, day, limit);
    return NextResponse.json({ day, gameSlug, leaderboard: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Slug-bound game leaderboard handler — for routes that don't want to require
 * a `?game=` query on every request. Use in `apps/<game>/app/api/.../route.ts`.
 */
export function makeGameLeaderboardHandler(gameSlug: string) {
  return async (req: NextRequest) => {
    const url = req.nextUrl;
    const day = url.searchParams.get("day") ?? today();
    const limit = clampInt(url.searchParams.get("limit"), 100, 1, 500);
    try {
      const data = await getGameLeaderboard(gameSlug, day, limit);
      return NextResponse.json({ day, gameSlug, leaderboard: data });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  };
}

/** GET /api/leaderboard/category?cat=<key>&day=...&limit=N */
export async function categoryLeaderboardHandler(req: NextRequest) {
  const url = req.nextUrl;
  const cat = url.searchParams.get("cat") as CategoryKey | null;
  if (!cat || !(cat in CATEGORIES)) {
    return NextResponse.json(
      { error: "invalid_category", valid: Object.keys(CATEGORIES) },
      { status: 400 },
    );
  }
  const day = url.searchParams.get("day") ?? today();
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);

  try {
    const data = await getCategoryLeaderboard(cat, day, limit);
    return NextResponse.json({ day, category: cat, leaderboard: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** GET /api/leaderboard/overall?day=...&limit=N */
export async function overallLeaderboardHandler(req: NextRequest) {
  const url = req.nextUrl;
  const day = url.searchParams.get("day") ?? today();
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);

  try {
    const data = await getOverallLeaderboard(day, limit);
    return NextResponse.json({ day, leaderboard: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** GET /api/my-stats?address=0x..&day=YYYY-MM-DD */
export async function userStatsHandler(req: NextRequest) {
  const url = req.nextUrl;
  const address = url.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "missing_address" }, { status: 400 });
  }
  const day = url.searchParams.get("day") ?? today();

  try {
    const stats = await getUserStats(address, day);
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
