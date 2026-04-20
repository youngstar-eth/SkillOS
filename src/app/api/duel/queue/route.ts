// ───────────────────────────────────────────────────────────────────────────
// POST /api/duel/queue
//
// Two branches, selected by body shape:
//
//   P1 enqueue (creator):
//     body:  { address, matchId (uuid v4), createTxHash }
//     action: insert v2_duels row with status='queued'.
//     response: { matchId, challengeId, seed, status:'queued', stakeAmount }
//
//   P2 match (challenger):
//     body:  { address }
//     action: atomically claim the oldest status='queued' row whose
//             player1_address != caller via optimistic CAS. Retries a few
//             times if another P2 won the race with the same oldest row.
//     response: { matchId, challengeId, seed, status:'matched',
//                 opponent, stakeAmount }
//     404: { error:'no_queued_challenges' } if nothing to match
//
// createTxHash validation is trust-client for V2 (client says they called
// createChallenge; we record the hash). A deeper validation would RPC
// Base Sepolia for the receipt and decode logs — deferred as out-of-scope
// for the 7-day demo but tracked in the spec's open items.
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import {
  isTxHash,
  isUuid,
  jsonError,
  jsonOk,
  parseAddress,
  sanitizeDuel,
} from "@/lib/http";
import { STAKE_AMOUNT } from "@/lib/contracts";
import { bytes32FromUuid, generateSeed } from "@/lib/seed";
import { type Duel, getSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const MAX_CLAIM_RETRIES = 3;

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
  const payload = body as Record<string, unknown>;

  const address = parseAddress(payload.address);
  if (!address) {
    return jsonError("invalid_address", "address is required (0x… hex)", 400);
  }

  const hasCreateTx = "createTxHash" in payload;

  // ─── P1 enqueue branch ──────────────────────────────────────────────────
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

    // If the same matchId is posted twice (e.g. the client retries after a
    // network blip), surface the existing row rather than 409-ing.
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

  // ─── P2 match branch ────────────────────────────────────────────────────
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
}
