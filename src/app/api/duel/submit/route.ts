// ───────────────────────────────────────────────────────────────────────────
// POST /api/duel/submit
//
// Body: { matchId, address, score }
// Action:
//   1. Validate inputs and match state.
//   2. Sanity-check score (integer, 0 < score < 50000; typical 2-min 2048
//      scores are <25k — 50k is a generous bound). See spec §2.
//   3. CAS-write player{N}_score only when currently null (dup-submit guard).
//   4. Flip status to player{N}_submitted (or keep in the combined case).
//   5. If both players have now submitted, call triggerSettle(matchId)
//      in-process — no internal HTTP endpoint, no auth header.
//
// V1 trust-client: we do not replay the game server-side. V2 roadmap:
// submit a verifiable game log + seed proof.
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { getAddress } from "viem";
import { PLAY_WINDOW_MS, SUBMIT_GRACE_MS } from "@/lib/contracts";
import { isUuid, jsonError, jsonOk, parseAddress } from "@/lib/http";
import { triggerSettle } from "@/lib/settle";
import { type Duel, getSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const SCORE_MIN = 0;
const SCORE_MAX = 50_000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", "request body must be JSON", 400);
  }
  if (typeof body !== "object" || body === null) {
    return jsonError("invalid_body", "body must be an object", 400);
  }
  const { matchId, address: addressRaw, score } = body as Record<string, unknown>;

  if (!isUuid(matchId)) {
    return jsonError("invalid_match_id", "matchId must be a uuid v4", 400);
  }
  const address = parseAddress(addressRaw);
  if (!address) {
    return jsonError("invalid_address", "address must be a 0x-prefixed hex address", 400);
  }
  if (typeof score !== "number" || !Number.isInteger(score)) {
    return jsonError("invalid_score", "score must be an integer", 400);
  }
  if (score <= SCORE_MIN || score >= SCORE_MAX) {
    return jsonError(
      "implausible_score",
      `score must be an integer in (${SCORE_MIN}, ${SCORE_MAX})`,
      400,
    );
  }

  const supabase = getSupabaseService();
  const { data: duelRaw, error: readErr } = await supabase
    .from("v2_duels")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (readErr) return jsonError("db_error", readErr.message, 500);
  if (!duelRaw) return jsonError("not_found", `match ${matchId} not found`, 404);
  const duel = duelRaw as Duel;

  if (duel.status === "settled" || duel.status === "refunded") {
    return jsonError("match_closed", `match already ${duel.status}`, 409);
  }
  if (!duel.matched_at) {
    return jsonError("not_matched", "match has no opponent yet", 409);
  }

  // Enforce play window + grace. If stale, the status endpoint's walkover
  // path will award the submitted player; here we just refuse the late
  // submission to keep the settle digest consistent.
  const elapsed = Date.now() - new Date(duel.matched_at).getTime();
  if (elapsed > PLAY_WINDOW_MS + SUBMIT_GRACE_MS) {
    return jsonError(
      "play_window_elapsed",
      `submit window closed (${elapsed}ms elapsed since matched_at)`,
      409,
    );
  }

  // Identify which player slot the caller owns. Normalize with getAddress
  // so the LEAST/GREATEST unique index never sees mixed casing.
  const p1 = getAddress(duel.player1_address);
  const p2 = duel.player2_address ? getAddress(duel.player2_address) : null;
  let slot: 1 | 2 | null = null;
  if (address === p1) slot = 1;
  else if (address === p2) slot = 2;
  if (!slot) {
    return jsonError("not_a_participant", "address is not a player in this match", 403);
  }

  // Dup-submit guard via CAS: only write when playerN_score is still null.
  // Also advances status atomically; the "both submitted" state is handled
  // in a separate step after we see the updated row.
  const nowIso = new Date().toISOString();
  const scoreCol = slot === 1 ? "player1_score" : "player2_score";
  const timeCol = slot === 1 ? "player1_submitted_at" : "player2_submitted_at";
  const nextStatus = slot === 1 ? "player1_submitted" : "player2_submitted";

  const allowedFrom = [
    "matched",
    // Allow reverse-order submits: if opponent already submitted,
    // status is already playerOther_submitted and we flip to "both".
    slot === 1 ? "player2_submitted" : "player1_submitted",
  ];

  const updatePayload: Record<string, unknown> = {
    [scoreCol]: score,
    [timeCol]: nowIso,
  };
  // If the opponent already submitted, this write makes both non-null;
  // we mark status as the caller's submitted state and triggerSettle
  // will flip to 'settled' after its CAS.
  updatePayload.status = nextStatus;

  const { data: updatedRaw, error: updErr } = await supabase
    .from("v2_duels")
    .update(updatePayload)
    .eq("id", matchId)
    .is(scoreCol, null)
    .in("status", allowedFrom)
    .select("*")
    .maybeSingle();
  if (updErr) return jsonError("db_error", updErr.message, 500);
  if (!updatedRaw) {
    // Either the score is already set, the status moved on, or the match
    // was settled in a concurrent request — surface a friendly conflict.
    return jsonError(
      "already_submitted_or_closed",
      "you already submitted, or the match moved past the submit window",
      409,
    );
  }
  const updated = updatedRaw as Duel;

  const bothSubmitted =
    updated.player1_score != null && updated.player2_score != null;

  if (!bothSubmitted) {
    return jsonOk({
      submitted: true,
      settled: false,
      winner: null,
      settleTxHash: null,
    });
  }

  // Both scores in — fire the settle. Errors bubble up as 500 so the
  // client can retry via the status endpoint.
  try {
    const result = await triggerSettle(matchId);
    return jsonOk({
      submitted: true,
      settled: result.settled,
      winner: result.winner,
      settleTxHash: result.settleTxHash,
    });
  } catch (err) {
    console.error("[submit] triggerSettle failed", matchId, err);
    return jsonError(
      "settle_failed",
      err instanceof Error ? err.message : "settle_failed",
      500,
      { submitted: true, settled: false },
    );
  }
}
