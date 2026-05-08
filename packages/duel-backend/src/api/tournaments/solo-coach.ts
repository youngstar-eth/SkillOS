// ───────────────────────────────────────────────────────────────────────────
// Next.js route handler FACTORY for the solo AI Coach endpoint.
//
//   POST /api/tournaments/solo/[runId]/coach
//   body: ignored (solo has one player per run — the run's owner;
//         the runId alone identifies the cacheable coach slot)
//
// Response shape is IDENTICAL to duel's coach endpoint:
//   200 { feedback, tone }                 — CoachResponse from @skillbase/ai-coach
//   400 invalid_run_id / invalid_json
//   404 not_found
//   503 coach_unavailable                   — Haiku 4xx/5xx or missing API key
//
// Caching:
//   - v2_tournament_solo_runs.coach_cache is jsonb NOT NULL default '{}'.
//   - Empty object → miss, generate + write, respond.
//   - Non-empty + valid shape → hit, respond from cache.
//   - Non-empty + malformed → log + regenerate.
//
//   Unlike duel's per-slot {p1, p2} shape, solo has exactly one player,
//   so the CoachResponse is stored at root — the jsonb-object-vs-empty
//   distinction alone is the hit/miss predicate.
//
// Usage (apps/<game>/src/app/api/tournaments/solo/[runId]/coach/route.ts):
//   import { createSoloCoachHandler } from "@skillbase/duel-backend";
//   export const runtime = "nodejs";
//   export const POST = createSoloCoachHandler({ gameType: "game2048" });
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import type { CoachResponse, GameType } from "@skillbase/ai-coach";
import { generateSoloCoachFeedback } from "@skillbase/ai-coach";
import {
  getSupabaseService,
  isUuid,
  jsonError,
} from "@skillbase/lib-shared";

/**
 * Coach response with an X-Cache header parallel to recap. Lets smoke tests
 * and observability distinguish generated vs cached serves without guessing
 * from latency alone (cold TLS dominates over cache read).
 */
function jsonCoach(body: CoachResponse, cache: "HIT" | "MISS"): Response {
  return Response.json(body, { headers: { "X-Cache": cache } });
}

export interface SoloCoachHandlerConfig {
  /** One of the GameType literals from @skillbase/ai-coach. */
  gameType: GameType;
}

/** Local shape for the solo_runs row subset we read here. */
interface SoloRunRow {
  id: string;
  score: number;
  is_paid_retry: boolean;
  coach_cache: Record<string, unknown> | null;
}

function isCoachResponse(v: unknown): v is CoachResponse {
  if (typeof v !== "object" || v === null) return false;
  const { feedback, tone } = v as { feedback?: unknown; tone?: unknown };
  return typeof feedback === "string" && typeof tone === "string";
}

export function createSoloCoachHandler(config: SoloCoachHandlerConfig) {
  return async function POST(
    _req: NextRequest,
    ctx: { params: Promise<{ runId: string }> },
  ): Promise<Response> {
    const { runId } = await ctx.params;
    if (!isUuid(runId)) {
      return jsonError("invalid_run_id", "runId must be a uuid v4", 400);
    }

    const supabase = getSupabaseService();
    const { data: row, error: readErr } = await supabase
      .from("v2_tournament_solo_runs")
      .select("id,score,is_paid_retry,coach_cache")
      .eq("id", runId)
      .maybeSingle();
    if (readErr) return jsonError("db_error", readErr.message, 500);
    if (!row) {
      return jsonError("not_found", `solo run ${runId} not found`, 404);
    }

    const run = row as SoloRunRow;

    // ─── cache hit ─────────────────────────────────────────────────────
    // coach_cache is stored at root (solo has one player per run, so no
    // per-slot wrapper). Empty object means "no call yet".
    const cache = run.coach_cache ?? {};
    if (Object.keys(cache).length > 0) {
      if (isCoachResponse(cache)) return jsonCoach(cache, "HIT");
      // Non-empty but malformed — log and regenerate. Same defensive
      // path as duel recap.
      console.warn(
        "[solo-coach] coach_cache present but malformed; regenerating",
        runId,
      );
    }

    // ─── generate ──────────────────────────────────────────────────────
    // durationSeconds is not currently captured on solo_runs (no matched_at
    // equivalent; client doesn't submit play duration). Pass 0; the solo
    // prompt handles a 0-duration gracefully. When v3 replay verify lands
    // and the client submits duration, wire it in here.
    let response: CoachResponse;
    try {
      response = await generateSoloCoachFeedback({
        gameType: config.gameType,
        score: run.score,
        durationSeconds: 0,
        isPaidRetry: run.is_paid_retry,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error("[solo-coach] generateSoloCoachFeedback failed", runId, err);
      return jsonError("coach_unavailable", message, 503);
    }

    // ─── persist cache ─────────────────────────────────────────────────
    // Root-level write. No CAS — concurrent duplicate generation is
    // bounded (~$0.01) and rare; last-writer-wins is acceptable.
    const { error: writeErr } = await supabase
      .from("v2_tournament_solo_runs")
      .update({ coach_cache: response })
      .eq("id", runId);
    if (writeErr) {
      console.error("[solo-coach] cache write failed", runId, writeErr);
    }

    return jsonCoach(response, "MISS");
  };
}
