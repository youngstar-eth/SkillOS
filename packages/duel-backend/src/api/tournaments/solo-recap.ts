// ───────────────────────────────────────────────────────────────────────────
// Next.js route handler FACTORY for the solo AI Recap endpoint.
//
//   POST /api/tournaments/solo/[runId]/recap
//   body: ignored
//
// Error model matches duel recap: HTTP 200 with { error } on every
// failure path — the AIRecap card hides itself on parse error, so this
// keeps the happy-path branch unified. X-Cache header mirrors duel.
//
// Caching:
//   - v2_tournament_solo_runs.recap_cache is nullable jsonb.
//   - NULL → miss, generate + write, respond with X-Cache: MISS.
//   - non-NULL + well-shaped → hit, respond with X-Cache: HIT.
//   - non-NULL + malformed → log + regenerate (overwrite on MISS write).
//
// Usage (apps/<game>/src/app/api/tournaments/solo/[runId]/recap/route.ts):
//   import { createSoloRecapHandler } from "@skillbase/duel-backend";
//   export const runtime = "nodejs";
//   export const POST = createSoloRecapHandler({ gameType: "game2048" });
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import type { GameType, RecapResponse } from "@skillbase/ai-coach";
import { generateSoloRecap } from "@skillbase/ai-coach";
import { getSupabaseService, isUuid } from "@skillbase/lib-shared";

export interface SoloRecapHandlerConfig {
  gameType: GameType;
}

interface SoloRunRow {
  id: string;
  score: number;
  is_paid_retry: boolean;
  recap_cache: unknown | null;
}

function isRecapResponse(v: unknown): v is RecapResponse {
  if (typeof v !== "object" || v === null) return false;
  const { style, headline, narrative, shareText } = v as {
    style?: unknown;
    headline?: unknown;
    narrative?: unknown;
    shareText?: unknown;
  };
  return (
    typeof style === "string" &&
    typeof headline === "string" &&
    typeof narrative === "string" &&
    typeof shareText === "string"
  );
}

function softError(reason: string): Response {
  return Response.json({ error: reason });
}

function jsonWithCache(body: unknown, cache: "HIT" | "MISS"): Response {
  return Response.json(body, { headers: { "X-Cache": cache } });
}

export function createSoloRecapHandler(config: SoloRecapHandlerConfig) {
  return async function POST(
    _req: NextRequest,
    ctx: { params: { runId: string } },
  ): Promise<Response> {
    const runId = ctx.params.runId;
    if (!isUuid(runId)) return softError("invalid_run_id");

    const supabase = getSupabaseService();
    const { data: row, error: readErr } = await supabase
      .from("v2_tournament_solo_runs")
      .select("id,score,is_paid_retry,recap_cache")
      .eq("id", runId)
      .maybeSingle();
    if (readErr) {
      console.error("[solo-recap] db read failed", runId, readErr);
      return softError("db_error");
    }
    if (!row) return softError("not_found");

    const run = row as SoloRunRow;

    // ─── cache hit ─────────────────────────────────────────────────────
    if (run.recap_cache !== null && run.recap_cache !== undefined) {
      if (isRecapResponse(run.recap_cache)) {
        return jsonWithCache(run.recap_cache, "HIT");
      }
      console.warn(
        "[solo-recap] recap_cache present but malformed; regenerating",
        runId,
      );
    }

    // ─── generate ──────────────────────────────────────────────────────
    let response: RecapResponse;
    try {
      response = await generateSoloRecap({
        gameType: config.gameType,
        score: run.score,
        durationSeconds: 0,
        isPaidRetry: run.is_paid_retry,
      });
    } catch (err) {
      console.error("[solo-recap] generateSoloRecap failed", runId, err);
      return softError("recap_unavailable");
    }

    // ─── persist ───────────────────────────────────────────────────────
    const { error: writeErr } = await supabase
      .from("v2_tournament_solo_runs")
      .update({ recap_cache: response })
      .eq("id", runId);
    if (writeErr) {
      console.error("[solo-recap] cache write failed", runId, writeErr);
    }

    return jsonWithCache(response, "MISS");
  };
}
