import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createAdminSupabase } from "../../supabase/server";
import { analyzeRun } from "../../ai/analyze-run";
import { COACH_MODEL } from "../../ai/client";

type Body = {
  gameSlug?: string;
  userAddress?: string;
  score?: number;
  stats?: Record<string, unknown>;
  tournamentId?: number;
};

/**
 * POST /api/analyze
 *
 * Body: { gameSlug, userAddress, score, stats, tournamentId? }
 *
 * Looks up a cached narration in `ai_analyses` keyed on
 * (user_address, game_slug, stats_hash). Cache miss → Claude → insert.
 * Auth is intentionally light for v1 (trusts the client to pass its own
 * wallet address) — tighten when wallet-JWT signing is wired.
 */
export async function analyzeHandler(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const gameSlug = body.gameSlug;
  const rawAddress = body.userAddress;
  const score = body.score;
  const stats = body.stats;
  const tournamentId = body.tournamentId;

  if (!gameSlug || !rawAddress || typeof score !== "number" || !stats) {
    return NextResponse.json(
      { error: "missing_fields", required: "gameSlug, userAddress, score, stats" },
      { status: 400 },
    );
  }
  const userAddress = rawAddress.toLowerCase();

  // Hash stats to a stable dedup key — key order matters here since we stringify,
  // but repeat runs generally produce stable structures.
  const statsHash = createHash("sha256")
    .update(JSON.stringify(stats))
    .digest("hex");

  const admin = createAdminSupabase();

  // ─── cache lookup ─────────────────────────────────────────────────────
  const { data: cached } = await admin
    .from("ai_analyses")
    .select("narration, created_at")
    .eq("user_address", userAddress)
    .eq("game_slug", gameSlug)
    .eq("stats_hash", statsHash)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      narration: cached.narration,
      cached: true,
      created_at: cached.created_at,
    });
  }

  // ─── generate ─────────────────────────────────────────────────────────
  let analysis;
  try {
    analysis = await analyzeRun(gameSlug, stats as never);
  } catch (e) {
    return NextResponse.json(
      {
        error: "ai_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  // ─── persist (best-effort; failure still returns the narration) ───────
  const { error: insErr } = await admin.from("ai_analyses").insert({
    user_address: userAddress,
    game_slug: gameSlug,
    tournament_id: tournamentId ?? null,
    score,
    stats_hash: statsHash,
    narration: analysis.narration,
    model_used: COACH_MODEL,
  });

  return NextResponse.json({
    narration: analysis.narration,
    cached: false,
    persisted: !insErr,
  });
}
