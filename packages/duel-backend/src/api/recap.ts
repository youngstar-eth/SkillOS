// ───────────────────────────────────────────────────────────────────────────
// Next.js route handler FACTORY for the AI Recap endpoint.
//
//   POST /api/duel/[id]/recap
//   body: ignored (recap is match-wide, not per-player)
//
// Preconditions:
//   - matchId must be a UUID and exist in v2_duels
//   - match status must be 'settled' (recap is a post-match artifact)
//
// Caching:
//   - v2_duels.recap_cache is a nullable jsonb holding one RecapResponse
//     for the whole match (unlike coach_cache, which is keyed {p1, p2}).
//   - NULL → miss, generate + write, respond with X-Cache: MISS
//   - non-NULL and well-shaped → hit, respond with X-Cache: HIT
//   - non-NULL but malformed → fall through to regenerate (log + warn)
//
// Error model (matches the sprint doc's explicit directive):
//   - Every error path returns HTTP 200 with { error: string } body.
//   - Rationale: recap is enhancement, not critical — the client hides
//     the card on error and the result page still renders everything
//     else. Using 200+error also keeps fetch() happy path consistent.
//   - Server-side logging via console.error so we still see failures.
//
// Usage (apps/<game>/src/app/api/duel/[id]/recap/route.ts):
//   import { createRecapHandler } from "@skillbase/duel-backend";
//   export const runtime = "nodejs";
//   export const POST = createRecapHandler({
//     gameSlug: GAME_SLUG,
//     gameType: "game2048",
//   });
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { getAddress } from "viem";
import type { GameType, RecapResponse } from "@skillbase/ai-coach";
import { generateRecap } from "@skillbase/ai-coach";
import type { Duel } from "@skillbase/game-types";
import { getSupabaseService, isUuid } from "@skillbase/lib-shared";
import type { DuelHandlerConfig } from "../handlers";

export interface RecapHandlerConfig extends DuelHandlerConfig {
  /** One of the GameType literals from @skillbase/ai-coach. */
  gameType: GameType;
}

/** Local row shape — `recap_cache` isn't in the shared Duel type. */
type DuelWithRecapCache = Duel & {
  recap_cache: unknown | null;
};

/** Recap is match-wide: start at matched_at, end at settled_at. */
function computeMatchDurationSeconds(duel: Duel): number {
  if (!duel.matched_at || !duel.settled_at) return 0;
  const start = new Date(duel.matched_at).getTime();
  const end = new Date(duel.settled_at).getTime();
  return Math.max(0, Math.round((end - start) / 1000));
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

/** Soft error: HTTP 200 with { error }. Client hides the card. */
function softError(reason: string): Response {
  return Response.json({ error: reason });
}

function jsonWithCache(body: unknown, cache: "HIT" | "MISS"): Response {
  return Response.json(body, { headers: { "X-Cache": cache } });
}

export function createRecapHandler(config: RecapHandlerConfig) {
  return async function POST(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id: matchId } = await ctx.params;
    if (!isUuid(matchId)) return softError("invalid_match_id");

    // ─── read duel ──────────────────────────────────────────────────────
    const supabase = getSupabaseService();
    const { data: row, error: readErr } = await supabase
      .from("v2_duels")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();
    if (readErr) {
      console.error("[recap] db read failed", matchId, readErr);
      return softError("db_error");
    }
    if (!row) return softError("not_found");

    const duel = row as DuelWithRecapCache;

    if (duel.status !== "settled") return softError("match_not_settled");

    // ─── cache hit ──────────────────────────────────────────────────────
    if (duel.recap_cache !== null && duel.recap_cache !== undefined) {
      if (isRecapResponse(duel.recap_cache)) {
        return jsonWithCache(duel.recap_cache, "HIT");
      }
      // Non-null but shape-broken. Don't serve garbage to the UI — log
      // and regenerate. Rare; would only happen if someone hand-edited
      // the column or an older incompatible RecapResponse shape got
      // written. We overwrite on the MISS-path write below.
      console.warn(
        "[recap] recap_cache present but malformed; regenerating",
        matchId,
      );
    }

    // ─── derive winner / loser framing ──────────────────────────────────
    // Recap voice is bystander / third-person, but the underlying prompt
    // uses `myScore`/`opponentScore`/`won` as input symbols. We frame
    // "my" = winner so the prompt (and generate.ts's buildFallbackRecap)
    // resolve consistently.
    const winner = duel.winner_address
      ? getAddress(duel.winner_address)
      : null;
    if (!winner) {
      // Settled with no winner recorded is not a normal state in this
      // schema. Soft-fail rather than crash the result page.
      console.error(
        "[recap] settled duel has no winner_address",
        matchId,
      );
      return softError("no_winner");
    }
    const p1Addr = getAddress(duel.player1_address);
    const winnerIsP1 = p1Addr === winner;
    const winnerScore =
      (winnerIsP1 ? duel.player1_score : duel.player2_score) ?? 0;
    const loserScore =
      (winnerIsP1 ? duel.player2_score : duel.player1_score) ?? 0;

    const durationSeconds = computeMatchDurationSeconds(duel);

    // ─── generate ───────────────────────────────────────────────────────
    // No gameSpecificData: the current v2_duels schema doesn't store per-
    // game payloads, and the comeback evidence gate in the per-game
    // prompts relies on keys it can't see. Recap will therefore pick from
    // { standard, blowout, nailBiter, speedRun, grind } for now — the
    // comeback archetype unlocks when a `game_data` column lands.
    let response: RecapResponse;
    try {
      response = await generateRecap({
        gameType: config.gameType,
        myScore: winnerScore,
        opponentScore: loserScore,
        won: true,
        durationSeconds,
      });
    } catch (err) {
      console.error("[recap] generateRecap failed", matchId, err);
      return softError("recap_unavailable");
    }

    // ─── persist ────────────────────────────────────────────────────────
    // Single UPDATE — one recap per match, no merge needed. Bounded to
    // status='settled' so a racing settle rollback can't accidentally
    // write into a reopened row.
    const { error: writeErr } = await supabase
      .from("v2_duels")
      .update({ recap_cache: response })
      .eq("id", matchId)
      .eq("status", "settled");
    if (writeErr) {
      // Non-fatal: we still have the response in memory. Next request
      // will regenerate (tolerable: ~$0.008/call).
      console.error("[recap] cache write failed", matchId, writeErr);
    }

    // Keep gameSlug referenced so the compiler doesn't flag `config` as
    // partially used, and to signal that the slug flows through for
    // future per-game segmentation (recap telemetry keyed by slug).
    void config.gameSlug;

    return jsonWithCache(response, "MISS");
  };
}
