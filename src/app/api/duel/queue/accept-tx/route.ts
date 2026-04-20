// ───────────────────────────────────────────────────────────────────────────
// POST /api/duel/queue/accept-tx
//
// Body:  { matchId, acceptTxHash }
// Auth:  caller is expected to be player2, but V2 trusts whoever posts
//        (tx hash itself is public chain data). A follow-up would verify
//        the tx receipt's `from` matches player2_address on Base Sepolia.
//
// Semantics: idempotent. Accepts only when status is one of {matched,
// player1_submitted, player2_submitted} (i.e., after match + before
// settlement). Subsequent calls with the same hash are no-ops.
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { isTxHash, isUuid, jsonError, jsonOk } from "@/lib/http";
import { getSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

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
  return jsonOk({ ok: true, matchId: data.id, acceptTxHash: data.accept_tx_hash });
}
