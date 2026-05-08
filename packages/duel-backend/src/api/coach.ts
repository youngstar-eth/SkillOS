// ───────────────────────────────────────────────────────────────────────────
// Next.js route handler FACTORY for the AI Coach endpoint.
//
//   POST /api/duel/[id]/coach
//   body: { player: "0x..." }
//
// Auth / preconditions:
//   - matchId must be a UUID and exist in v2_duels
//   - caller (body.player) must be p1 or p2 of that match
//   - match status must be 'settled' (coach is a post-match product)
//
// Caching:
//   - v2_duels.coach_cache is a jsonb { p1?: CoachResponse, p2?: CoachResponse }
//   - A second call from the same player returns the cached row — no LLM
//     spend, no drift.
//   - A call from the OTHER player generates their own view; the two
//     players can receive different (their own) feedback.
//
// Rate-limit model:
//   - Effectively 1 coach generation per player per match (the cache key
//     is the slot). Concurrent calls from the same player may each hit
//     the LLM in the rare case where they race between the check and
//     the write — we tolerate that (cost ≈ $0.005 of leakage, max).
//
// Usage (apps/<game>/src/app/api/duel/[id]/coach/route.ts):
//   import { createCoachHandler } from "@skillbase/duel-backend";
//   export const runtime = "nodejs";
//   export const POST = createCoachHandler({
//     gameSlug: GAME_SLUG,
//     gameType: "game2048",
//   });
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { getAddress } from "viem";
import type { GameType, CoachResponse } from "@skillbase/ai-coach";
import { generateCoachFeedback } from "@skillbase/ai-coach";
import type { Duel } from "@skillbase/game-types";
import {
  getSupabaseService,
  isUuid,
  jsonError,
  jsonOk,
  parseAddress,
} from "@skillbase/lib-shared";
import type { DuelHandlerConfig } from "../handlers";

/**
 * Coach handler config. Extends the shared DuelHandlerConfig (which
 * carries the on-chain gameSlug) with the gameType string the
 * @skillbase/ai-coach package dispatches on.
 */
export interface CoachHandlerConfig extends DuelHandlerConfig {
  /** One of the GameType literals from @skillbase/ai-coach. */
  gameType: GameType;
}

/** Local shape for rows read here — `coach_cache` isn't in the shared Duel. */
type DuelWithCoachCache = Duel & {
  coach_cache: Record<string, unknown> | null;
};

type Slot = "p1" | "p2";

/**
 * Derive per-player duration in seconds. Prefer the player's own
 * submitted_at (actual play time) over settled_at (includes chain
 * propagation). Falls back to settled_at when the player walked over.
 */
function computeDurationSeconds(duel: Duel, slot: Slot): number {
  if (!duel.matched_at) return 0;
  const started = new Date(duel.matched_at).getTime();
  const submittedAt =
    slot === "p1" ? duel.player1_submitted_at : duel.player2_submitted_at;
  const endedIso = submittedAt ?? duel.settled_at;
  if (!endedIso) return 0;
  const ended = new Date(endedIso).getTime();
  return Math.max(0, Math.round((ended - started) / 1000));
}

function isCoachResponse(v: unknown): v is CoachResponse {
  if (typeof v !== "object" || v === null) return false;
  const { feedback, tone } = v as { feedback?: unknown; tone?: unknown };
  return typeof feedback === "string" && typeof tone === "string";
}

export function createCoachHandler(config: CoachHandlerConfig) {
  return async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id: matchId } = await ctx.params;
    if (!isUuid(matchId)) {
      return jsonError("invalid_match_id", "matchId must be a uuid v4", 400);
    }

    // ─── body parse ─────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("invalid_json", "request body must be JSON", 400);
    }
    if (typeof body !== "object" || body === null) {
      return jsonError("invalid_body", "body must be an object", 400);
    }
    const { player } = body as Record<string, unknown>;
    const callerAddr = parseAddress(player);
    if (!callerAddr) {
      return jsonError(
        "invalid_address",
        "player must be a 0x-prefixed hex address",
        400,
      );
    }

    // ─── read duel ──────────────────────────────────────────────────────
    const supabase = getSupabaseService();
    const { data: row, error: readErr } = await supabase
      .from("v2_duels")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();
    if (readErr) return jsonError("db_error", readErr.message, 500);
    if (!row) return jsonError("not_found", `match ${matchId} not found`, 404);

    const duel = row as DuelWithCoachCache;

    // Only settled matches get coach feedback. Any other state returns 409
    // so the frontend can re-try later instead of showing a stale card.
    if (duel.status !== "settled") {
      return jsonError(
        "match_not_settled",
        "coach is available after the match is settled",
        409,
      );
    }

    // ─── identify caller's slot ────────────────────────────────────────
    const p1 = getAddress(duel.player1_address);
    const p2 = duel.player2_address ? getAddress(duel.player2_address) : null;
    let slot: Slot | null = null;
    if (callerAddr === p1) slot = "p1";
    else if (callerAddr === p2) slot = "p2";
    if (!slot) {
      return jsonError(
        "not_a_participant",
        "address is not a player in this match",
        403,
      );
    }

    // ─── cache check ───────────────────────────────────────────────────
    const cache = (duel.coach_cache ?? {}) as Record<string, unknown>;
    const cachedForSlot = cache[slot];
    if (isCoachResponse(cachedForSlot)) {
      return jsonOk(cachedForSlot);
    }

    // ─── build CoachRequest from duel row ──────────────────────────────
    const myScoreRaw = slot === "p1" ? duel.player1_score : duel.player2_score;
    const oppScoreRaw = slot === "p1" ? duel.player2_score : duel.player1_score;
    const myScore = myScoreRaw ?? 0;
    const opponentScore = oppScoreRaw ?? 0;

    // Winner comparison is case-sensitive because both sides are
    // getAddress-normalized. winner_address is written by settle/walkover
    // already normalized.
    const winner = duel.winner_address
      ? getAddress(duel.winner_address)
      : null;
    const won = winner !== null && callerAddr === winner;
    const durationSeconds = computeDurationSeconds(duel, slot);

    // ─── generate ──────────────────────────────────────────────────────
    let response: CoachResponse;
    try {
      response = await generateCoachFeedback({
        gameType: config.gameType,
        myScore,
        opponentScore,
        won,
        durationSeconds,
      });
    } catch (err) {
      // The package throws when ANTHROPIC_API_KEY is missing or Anthropic
      // returns a 4xx/5xx. Return 503 so the frontend can show a soft
      // "Coach unavailable" state instead of crashing.
      const message = err instanceof Error ? err.message : "unknown";
      console.error("[coach] generateCoachFeedback failed", matchId, err);
      return jsonError("coach_unavailable", message, 503);
    }

    // ─── persist cache ─────────────────────────────────────────────────
    // Merge into existing cache to preserve the other player's entry.
    // We don't do a strict CAS — the frontend issues a single call per
    // mount, so the concurrent-duplicate window is vanishingly small, and
    // even a "last-writer-wins" double-generation only leaks ~$0.005.
    const nextCache = { ...cache, [slot]: response };
    const { error: writeErr } = await supabase
      .from("v2_duels")
      .update({ coach_cache: nextCache })
      .eq("id", matchId)
      .eq("status", "settled");
    if (writeErr) {
      // Non-fatal: we still have the response in memory. Log + return.
      console.error("[coach] cache write failed", matchId, writeErr);
    }

    // Keep `config.gameSlug` referenced so the compiler doesn't flag
    // `config` as partially used — and it documents that the slug flows
    // through for future per-game segmentation (e.g. coach telemetry
    // keyed by slug).
    void config.gameSlug;

    return jsonOk(response);
  };
}
