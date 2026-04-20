// ───────────────────────────────────────────────────────────────────────────
// GET /api/duel/status
//
//   ?matchId=<uuid>   — returns the full sanitized Duel row for that match
//   ?address=<0x..>   — returns the caller's most recent Duel row
//                        (any status; client decides what to render)
//
// Side effect: if the match is in a single-submitter state and the play
// window + grace has elapsed, this endpoint triggers walkover() on-chain
// before returning. Polling the status is itself the trigger — no cron.
//
// Read path uses the service role client so RLS never surprises us; the
// anon browser client could be used too, but using service-role keeps
// the schema's `select` policy flexible for future tightening.
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { isUuid, jsonError, jsonOk, parseAddress, sanitizeDuel } from "@/lib/http";
import { checkAndTriggerWalkover } from "@/lib/settle";
import { type Duel, getSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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
      await checkAndTriggerWalkover(matchId);
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
      return jsonError("invalid_address", "address must be a 0x-prefixed hex address", 400);
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
}
