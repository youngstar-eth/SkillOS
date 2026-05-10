// ───────────────────────────────────────────────────────────────────────────
// Admin flags endpoint — private, token-gated, returns the FULL
// plausibility_check row (not the user-facing masked shape).
//
//   GET /api/admin/flags?game=game2048&verdict=implausible&limit=50
//
// Auth:
//   Authorization: Bearer <ADMIN_API_TOKEN>
//   Missing, malformed, or mismatching → 401 unauthorized.
//   Compared with node:crypto timingSafeEqual to avoid timing leaks.
//
// Defaults:
//   - No game filter: all 6 games.
//   - No verdict filter: returns ("suspicious" | "implausible"), i.e. the
//     actual flag queue. Admin can pass ?verdict=plausible to inspect
//     accepted rows.
//   - limit default 50, max 200.
//
// Response (200):
//   {
//     "flagged": [
//       { duelId, game, verdict, confidence, reasoning, flags, reviewedAt }
//     ],
//     "total": number
//   }
//
// Missing/misconfigured ADMIN_API_TOKEN fails closed (401) — we do NOT
// expose the queue on a mis-deployed host.
//
// Usage (apps/<game>/src/app/api/admin/flags/route.ts):
//   export { adminFlagsHandler as GET } from "@skillos/duel-backend";
//   export const runtime = "nodejs";
// ───────────────────────────────────────────────────────────────────────────

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type {
  GameType,
  PlausibilityResponse,
  Verdict,
} from "@skillos/ai-coach";
import { getSupabaseService } from "@skillos/lib-shared";

const VALID_GAMES: readonly GameType[] = [
  "game2048",
  "wordle",
  "sudoku",
  "minesweeper",
  "clicker",
  "match3",
] as const;

const VALID_VERDICTS: readonly Verdict[] = [
  "plausible",
  "suspicious",
  "implausible",
] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface AdminFlagRow {
  duelId: string;
  game: GameType;
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  flags: string[];
  reviewedAt: string;
}

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/** Constant-time string equality — defends against timing-based token extraction. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isPlausibilityRow(v: unknown): v is PlausibilityResponse {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<PlausibilityResponse>;
  return (
    typeof r.verdict === "string" &&
    (VALID_VERDICTS as readonly string[]).includes(r.verdict) &&
    typeof r.confidence === "number" &&
    typeof r.reasoning === "string" &&
    Array.isArray(r.flags) &&
    typeof r.reviewedAt === "string" &&
    typeof r.modelVersion === "string" &&
    typeof r.gameType === "string" &&
    (VALID_GAMES as readonly string[]).includes(r.gameType)
  );
}

export async function adminFlagsHandler(
  req: NextRequest,
): Promise<Response> {
  // ─── auth ──────────────────────────────────────────────────────────
  const configToken = process.env.ADMIN_API_TOKEN;
  if (!configToken || configToken.length === 0) {
    // Fail closed on misconfig — never expose the flag queue on a host
    // that doesn't have ADMIN_API_TOKEN set (e.g. forgot to sync env).
    console.error("[admin/flags] ADMIN_API_TOKEN not set");
    return unauthorized();
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorized();
  }
  const providedToken = authHeader.slice("Bearer ".length).trim();
  if (!safeEqual(providedToken, configToken)) {
    return unauthorized();
  }

  // ─── query params ──────────────────────────────────────────────────
  const { searchParams } = req.nextUrl;
  const gameParam = searchParams.get("game");
  const verdictParam = searchParams.get("verdict");
  const limitParam = searchParams.get("limit");

  if (gameParam && !(VALID_GAMES as readonly string[]).includes(gameParam)) {
    return Response.json(
      { error: `invalid game: ${gameParam}` },
      { status: 400 },
    );
  }
  if (
    verdictParam &&
    !(VALID_VERDICTS as readonly string[]).includes(verdictParam)
  ) {
    return Response.json(
      { error: `invalid verdict: ${verdictParam}` },
      { status: 400 },
    );
  }

  const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, parsedLimit))
    : DEFAULT_LIMIT;

  // ─── fetch ─────────────────────────────────────────────────────────
  // Over-fetch 3× so the in-memory verdict/game filter below still has
  // `limit` results in the common "most recent rows are plausible"
  // case. For Phase 1 traffic (tens of rows/day) this is negligible.
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from("v2_duels")
    .select("id, plausibility_check, created_at")
    .not("plausibility_check", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(MAX_LIMIT * 3, limit * 3));

  if (error) {
    console.error("[admin/flags] db read failed", error);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    plausibility_check: unknown;
    created_at: string;
  }>;

  // Default scope: "suspicious" + "implausible" (the actual flag queue).
  // An explicit ?verdict= overrides — useful for admin to sanity-check
  // what the auditor accepted too.
  const targetVerdicts: readonly Verdict[] = verdictParam
    ? [verdictParam as Verdict]
    : ["suspicious", "implausible"];

  const flagged: AdminFlagRow[] = [];
  for (const row of rows) {
    if (!isPlausibilityRow(row.plausibility_check)) continue;
    const pc = row.plausibility_check;
    if (!targetVerdicts.includes(pc.verdict)) continue;
    if (gameParam && pc.gameType !== gameParam) continue;

    flagged.push({
      duelId: row.id,
      game: pc.gameType,
      verdict: pc.verdict,
      confidence: pc.confidence,
      reasoning: pc.reasoning,
      flags: pc.flags,
      reviewedAt: pc.reviewedAt,
    });
    if (flagged.length >= limit) break;
  }

  return Response.json({ flagged, total: flagged.length });
}
