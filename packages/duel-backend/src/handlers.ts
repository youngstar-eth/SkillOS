// ───────────────────────────────────────────────────────────────────────────
// Next.js route handler FACTORIES for the duel API surface.
//
// Each factory returns a handler bound to a game's config (currently just
// `gameSlug`). Today the backend is already game-agnostic — ChallengeEscrow
// accepts any bytes32 slug and the v2_duels table is shared — so gameSlug
// is carried through but not yet written to the row. Threading it through
// leaves a clean seam for future per-game segmentation (add a `game_slug`
// column + filter in queue/status).
//
// Usage (apps/<game>/src/app/api/duel/<op>/route.ts):
//   import { createQueueHandler } from "@skillbase/duel-backend";
//   export const runtime = "nodejs";
//   export const POST = createQueueHandler({ gameSlug: GAME_SLUG });
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { getAddress, type Hex } from "viem";
import { PLAY_WINDOW_MS, STAKE_AMOUNT, SUBMIT_GRACE_MS } from "@skillbase/contracts";
import type { Duel } from "@skillbase/game-types";
import type { GameType } from "@skillbase/ai-coach";
import {
  bytes32FromUuid,
  generateSeed,
  getSupabaseService,
  isTxHash,
  isUuid,
  jsonError,
  jsonOk,
  parseAddress,
  sanitizeDuel,
} from "@skillbase/lib-shared";
import { checkAndTriggerWalkover, triggerSettle } from "./settle";

/**
 * Config shared by every handler factory. `gameSlug` is the bytes32 value
 * the client passes to `createChallenge` on-chain. For now the server only
 * stores it as implicit context (not persisted); future migrations can
 * write it to a `game_slug` column on v2_duels.
 */
export interface DuelHandlerConfig {
  /** bytes32 hex (keccak256 of the game name). See @skillbase/contracts. */
  gameSlug: Hex;
  /**
   * Optional game-type literal forwarded into settle/walkover hooks for
   * the fire-and-forget anti-cheat audit. Omit on handlers that don't
   * touch settle (queue, accept-tx).
   */
  gameType?: GameType;
}

// ─── queue ─────────────────────────────────────────────────────────────────

/**
 * POST /api/duel/queue
 *
 * Two branches, selected by body shape:
 *
 *   P1 enqueue (creator):
 *     body:  { address, matchId (uuid v4), createTxHash }
 *     action: insert v2_duels row with status='queued'.
 *     response: sanitizeDuel(row)
 *
 *   P2 match (challenger):
 *     body:  { address }
 *     action: atomically claim the oldest status='queued' row whose
 *             player1_address != caller via optimistic CAS. Retries a few
 *             times if another P2 won the race with the same oldest row.
 *     response: sanitizeDuel(row)
 *     404: { error:'no_queued_challenges' } if nothing to match
 */
const MAX_CLAIM_RETRIES = 3;

export function createQueueHandler(_config: DuelHandlerConfig) {
  return async function POST(req: NextRequest) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("invalid_json", "request body must be JSON", 400);
    }
    if (typeof body !== "object" || body === null) {
      return jsonError("invalid_body", "body must be an object", 400);
    }
    const payload = body as Record<string, unknown>;

    const address = parseAddress(payload.address);
    if (!address) {
      return jsonError("invalid_address", "address is required (0x… hex)", 400);
    }

    const hasCreateTx = "createTxHash" in payload;

    // ─── P1 enqueue branch ──────────────────────────────────────────────
    if (hasCreateTx) {
      const matchId = payload.matchId;
      const createTxHash = payload.createTxHash;
      if (!isUuid(matchId)) {
        return jsonError(
          "invalid_match_id",
          "matchId must be a uuid v4 (client-generated)",
          400,
        );
      }
      if (!isTxHash(createTxHash)) {
        return jsonError(
          "invalid_tx_hash",
          "createTxHash must be a 0x-prefixed 32-byte hex",
          400,
        );
      }

      const supabase = getSupabaseService();

      // Idempotent: same matchId reposted → return the existing row.
      const { data: existing } = await supabase
        .from("v2_duels")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();
      if (existing) {
        return jsonOk(sanitizeDuel(existing as Duel));
      }

      const seed = generateSeed();
      const onchainId = bytes32FromUuid(matchId);

      const { data, error } = await supabase
        .from("v2_duels")
        .insert({
          id: matchId,
          onchain_id: onchainId,
          status: "queued",
          player1_address: address,
          seed,
          stake_amount_usdc: Number(STAKE_AMOUNT),
          create_tx_hash: createTxHash,
        })
        .select("*")
        .maybeSingle();
      if (error || !data) {
        return jsonError("db_error", error?.message ?? "insert failed", 500);
      }
      return jsonOk(sanitizeDuel(data as Duel), { status: 201 });
    }

    // ─── P2 match branch ────────────────────────────────────────────────
    const supabase = getSupabaseService();

    // Optimistic CAS loop: SELECT oldest queued where p1 != me, then
    // UPDATE with compare on status='queued'. If we lose the race, the
    // UPDATE's RETURNING is empty and we try the next oldest. Caps at
    // MAX_CLAIM_RETRIES to avoid runaway loops.
    const seenIds = new Set<string>();
    for (let attempt = 0; attempt < MAX_CLAIM_RETRIES; attempt++) {
      const query = supabase
        .from("v2_duels")
        .select("id")
        .eq("status", "queued")
        .neq("player1_address", address)
        .order("created_at", { ascending: true })
        .limit(1);
      const { data: oldest, error: selectErr } = await query.maybeSingle();
      if (selectErr) {
        return jsonError("db_error", selectErr.message, 500);
      }
      if (!oldest) {
        return jsonError(
          "no_queued_challenges",
          "no opponent available yet — please wait or create a challenge",
          404,
        );
      }
      if (seenIds.has(oldest.id as string)) break;
      seenIds.add(oldest.id as string);

      const matchedAt = new Date().toISOString();
      const { data: claimed, error: updateErr } = await supabase
        .from("v2_duels")
        .update({
          status: "matched",
          player2_address: address,
          matched_at: matchedAt,
        })
        .eq("id", oldest.id)
        .eq("status", "queued")
        .select("*")
        .maybeSingle();
      if (updateErr) {
        return jsonError("db_error", updateErr.message, 500);
      }
      if (claimed) {
        return jsonOk(sanitizeDuel(claimed as Duel));
      }
      // Lost the race — someone else already claimed this row. Loop.
    }

    return jsonError(
      "claim_contention",
      "could not claim a queued match after retries; try again",
      503,
    );
  };
}

// ─── accept-tx ─────────────────────────────────────────────────────────────

/**
 * POST /api/duel/queue/accept-tx
 *
 * Body:  { matchId, acceptTxHash }
 *
 * Semantics: idempotent. Accepts only when status is one of {matched,
 * player1_submitted, player2_submitted} (i.e., after match + before
 * settlement). Subsequent calls with the same hash are no-ops.
 */
export function createAcceptTxHandler(_config: DuelHandlerConfig) {
  return async function POST(req: NextRequest) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("invalid_json", "request body must be JSON", 400);
    }
    if (typeof body !== "object" || body === null) {
      return jsonError("invalid_body", "body must be an object", 400);
    }
    const { matchId, acceptTxHash } = body as Record<string, unknown>;

    if (!isUuid(matchId)) {
      return jsonError("invalid_match_id", "matchId must be a uuid v4", 400);
    }
    if (!isTxHash(acceptTxHash)) {
      return jsonError(
        "invalid_tx_hash",
        "acceptTxHash must be a 0x-prefixed 32-byte hex",
        400,
      );
    }

    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("v2_duels")
      .update({ accept_tx_hash: acceptTxHash })
      .eq("id", matchId)
      .in("status", ["matched", "player1_submitted", "player2_submitted"])
      .select("id, accept_tx_hash, status")
      .maybeSingle();
    if (error) return jsonError("db_error", error.message, 500);
    if (!data) {
      return jsonError(
        "invalid_state",
        "match not found or not in an accept-eligible status",
        409,
      );
    }
    return jsonOk({
      ok: true,
      matchId: data.id,
      acceptTxHash: data.accept_tx_hash,
    });
  };
}

// ─── status ────────────────────────────────────────────────────────────────

/**
 * GET /api/duel/status
 *
 *   ?matchId=<uuid>   — returns the full sanitized Duel row for that match
 *   ?address=<0x..>   — returns the caller's most recent Duel row
 *
 * Side effect: if the match is in a single-submitter state and the play
 * window + grace has elapsed, this endpoint triggers walkover() on-chain
 * before returning. Polling the status is itself the trigger — no cron.
 */
export function createStatusHandler(config: DuelHandlerConfig) {
  return async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const matchId = searchParams.get("matchId");
    const addressRaw = searchParams.get("address");

    const supabase = getSupabaseService();

    // Branch 1: direct match lookup.
    if (matchId) {
      if (!isUuid(matchId)) {
        return jsonError("invalid_match_id", "matchId must be a uuid v4", 400);
      }

      // Opportunistic walkover check before we read the row so the response
      // reflects any freshly-flipped state. Errors here are non-fatal — if
      // the on-chain call is flaky, we still serve a status.
      try {
        await checkAndTriggerWalkover(matchId, { gameType: config.gameType });
      } catch (err) {
        console.error("[status] walkover check failed", matchId, err);
      }

      const { data, error } = await supabase
        .from("v2_duels")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();
      if (error) return jsonError("db_error", error.message, 500);
      if (!data) return jsonError("not_found", `match ${matchId} not found`, 404);
      return jsonOk(sanitizeDuel(data as Duel));
    }

    // Branch 2: lookup by address (useful for "am I mid-duel?" checks).
    if (addressRaw) {
      const address = parseAddress(addressRaw);
      if (!address) {
        return jsonError(
          "invalid_address",
          "address must be a 0x-prefixed hex address",
          400,
        );
      }
      // Most recent row where the caller is either player.
      const { data, error } = await supabase
        .from("v2_duels")
        .select("*")
        .or(`player1_address.eq.${address},player2_address.eq.${address}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return jsonError("db_error", error.message, 500);
      if (!data) return jsonError("not_found", `no duels for ${address}`, 404);
      return jsonOk(sanitizeDuel(data as Duel));
    }

    return jsonError(
      "missing_query",
      "provide ?matchId=<uuid> or ?address=<0x..>",
      400,
    );
  };
}

// ─── submit ────────────────────────────────────────────────────────────────

const SCORE_MIN = 0;
const SCORE_MAX = 50_000;

/**
 * POST /api/duel/submit
 *
 * Body: { matchId, address, score }
 * Action:
 *   1. Validate inputs and match state.
 *   2. Sanity-check score (integer, 0 < score < 50000).
 *   3. CAS-write player{N}_score only when currently null (dup-submit guard).
 *   4. Flip status to player{N}_submitted (or keep in the combined case).
 *   5. If both players have now submitted, call triggerSettle(matchId)
 *      in-process — no internal HTTP endpoint, no auth header.
 *
 * V1 trust-client: we do not replay the game server-side. V2 roadmap:
 * submit a verifiable game log + seed proof.
 */
export function createSubmitHandler(config: DuelHandlerConfig) {
  return async function POST(req: NextRequest) {
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
      return jsonError(
        "invalid_address",
        "address must be a 0x-prefixed hex address",
        400,
      );
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
      return jsonError(
        "not_a_participant",
        "address is not a player in this match",
        403,
      );
    }

    // Dup-submit guard via CAS: only write when playerN_score is still null.
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
      const result = await triggerSettle(matchId, { gameType: config.gameType });
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
  };
}
