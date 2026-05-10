// ───────────────────────────────────────────────────────────────────────────
// Next.js route handler FACTORY for tournament score submission.
//
//   POST /api/tournaments/[id]/submit
//   body: { playerAddress: "0x…", duelId: "uuid", score: 1844 }
//
// Per-app wire-up (apps/<game>/src/app/api/tournaments/[id]/submit/route.ts):
//   import { createTournamentSubmitHandler } from "@skillos/duel-backend";
//   export const runtime = "nodejs";
//   export const POST = createTournamentSubmitHandler({ game: "2048" });
//
// Validation order (short-circuits at first failure):
//   1. params.id is a uuid → else 400 invalid_tournament_id
//   2. body JSON parseable + correct shape → else 400
//   3. tournament row exists → else 404
//   4. tournament.game === config.game (handler-config invariant,
//      NOT request body) → else 400 game_mismatch
//   5. now() in [starts_at, ends_at) → else 400 tournament_not_active /
//      tournament_expired
//   6. tournament not settled → else 409 tournament_settled
//   7. duel row exists + status='settled' + winner=player → else 400
//   8. duel's plausibility_check.verdict !== 'implausible' → else 400
//      duel_implausible
//
// Side effects on success:
//   - sign EIP-191 attestation (STUDIO_PRIVATE_KEY)
//   - broadcast submitScore() on-chain, wait for receipt (matches settle
//     pattern in settle.ts — backend pays gas, free-entry)
//   - idempotent upsert into v2_tournament_entries (array-contains check
//     on source_duel_ids prevents double-counting if the same duelId is
//     POSTed twice)
//   - return { submitted, rank, signature, txHash }
//
// If broadcast succeeds but DB write fails, on-chain state is the source
// of truth — reconciler (future) or a follow-up settle cron read would
// re-discover the entry. Logged as a warning; endpoint still returns
// submitted:true with the txHash so the UI can link out to Basescan.
// ───────────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { type Hex, getAddress } from "viem";
import {
  MATCH_COUNT_CAP,
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V2_ADDRESS,
} from "@skillos/contracts";
import type { Duel } from "@skillos/game-types";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
  isUuid,
  jsonError,
  jsonOk,
  parseAddress,
  signTournamentSubmitAttestation,
} from "@skillos/lib-shared";

import type { TournamentGame } from "../../cron/tournaments";

export interface TournamentSubmitHandlerConfig {
  /** Per-app canonical game name. Baked in at route wire-up, not request-body. */
  game: TournamentGame;
}

/** Row shape for the v2_tournaments table. */
interface TournamentRow {
  id: string;
  on_chain_id: string;
  game: string;
  cycle_type: "daily" | "weekly";
  starts_at: string;
  ends_at: string;
  prize_pool_usdc: string;
  participation_bonus: number;
  sponsor_address: string;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  settled_at: string | null;
  settle_tx_hash: string | null;
  created_at: string;
}

/** Row shape for v2_tournament_entries (what we read/write here). */
interface EntryRow {
  id: string;
  tournament_id: string;
  player_address: string;
  best_score: number;
  match_count: number;
  effective_rank_score: string;
  excluded: boolean;
  source_duel_ids: string[];
}

type DuelWithPlausibility = Duel & {
  plausibility_check: { verdict?: string } | null;
};

/**
 * Stored effective rank score — mirrors v2 contract's _computeEffectiveScore:
 *   best * 85 + min(match_count, MATCH_COUNT_CAP) * bonus * 15
 * Cap was added in v2 to keep paid retries from dominating skill signal. For
 * duel-path entries that never paid retries, this has no observable effect
 * (players rarely win 10+ duels in a single tournament cycle) but keeps DB
 * ranking in lockstep with on-chain ranking for settle verification.
 */
function computeEffectiveRankScore(
  bestScore: number,
  matchCount: number,
  bonus: number,
): number {
  const capped = Math.min(matchCount, Number(MATCH_COUNT_CAP));
  return bestScore * 85 + capped * bonus * 15;
}

/** Generate a 32-byte random nonce hex, unique per submission attempt. */
function generateNonce(): Hex {
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}

export function createTournamentSubmitHandler(
  config: TournamentSubmitHandlerConfig,
) {
  return async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id: tournamentId } = await ctx.params;
    if (!isUuid(tournamentId)) {
      return jsonError(
        "invalid_tournament_id",
        "tournament id must be a uuid v4",
        400,
      );
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
    const payload = body as Record<string, unknown>;

    const player = parseAddress(payload.playerAddress);
    if (!player) {
      return jsonError(
        "invalid_address",
        "playerAddress must be a 0x-prefixed hex address",
        400,
      );
    }
    const duelId = payload.duelId;
    if (!isUuid(duelId)) {
      return jsonError(
        "invalid_duel_id",
        "duelId must be a uuid v4",
        400,
      );
    }
    const rawScore = payload.score;
    if (
      typeof rawScore !== "number" ||
      !Number.isFinite(rawScore) ||
      !Number.isInteger(rawScore) ||
      rawScore < 0
    ) {
      return jsonError(
        "invalid_score",
        "score must be a non-negative integer",
        400,
      );
    }
    const score = rawScore;

    // ─── tournament lookup + gating ─────────────────────────────────────
    const supabase = getSupabaseService();
    const { data: tournamentRow, error: tReadErr } = await supabase
      .from("v2_tournaments")
      .select("*")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tReadErr) return jsonError("db_error", tReadErr.message, 500);
    if (!tournamentRow) {
      return jsonError(
        "tournament_not_found",
        `tournament ${tournamentId} not found`,
        404,
      );
    }
    const tournament = tournamentRow as TournamentRow;

    // Handler-config invariant. Request body has no "game" field — the
    // handler's config.game (hardcoded per-app route) is the authority.
    if (tournament.game !== config.game) {
      return jsonError(
        "game_mismatch",
        `tournament is for '${tournament.game}', endpoint serves '${config.game}'`,
        400,
      );
    }

    if (tournament.settled_at) {
      return jsonError(
        "tournament_settled",
        "tournament already settled; no new submissions accepted",
        409,
      );
    }

    const now = Date.now();
    const startsMs = new Date(tournament.starts_at).getTime();
    const endsMs = new Date(tournament.ends_at).getTime();
    if (now < startsMs) {
      return jsonError(
        "tournament_not_active",
        `tournament starts at ${tournament.starts_at}`,
        400,
      );
    }
    if (now >= endsMs) {
      return jsonError(
        "tournament_expired",
        `tournament closed at ${tournament.ends_at}`,
        400,
      );
    }

    // ─── duel lookup + eligibility ──────────────────────────────────────
    const { data: duelRow, error: dReadErr } = await supabase
      .from("v2_duels")
      .select("*")
      .eq("id", duelId)
      .maybeSingle();
    if (dReadErr) return jsonError("db_error", dReadErr.message, 500);
    if (!duelRow) {
      return jsonError("duel_not_found", `duel ${duelId} not found`, 404);
    }
    const duel = duelRow as DuelWithPlausibility;

    if (duel.status !== "settled") {
      return jsonError(
        "duel_not_settled",
        `duel must be settled (got '${duel.status}')`,
        400,
      );
    }
    if (!duel.winner_address) {
      return jsonError("duel_no_winner", "duel has no recorded winner", 400);
    }
    if (getAddress(duel.winner_address) !== player) {
      return jsonError(
        "not_duel_winner",
        "only the winning player may submit this duel's score",
        403,
      );
    }

    const verdict = duel.plausibility_check?.verdict;
    if (verdict === "implausible") {
      return jsonError(
        "duel_implausible",
        "duel was flagged as implausible by anti-cheat and cannot be submitted",
        400,
      );
    }

    // Sanity-check the submitted score matches what the winner actually
    // posted on the duel (prevents trivial score-inflation via the body).
    const winnerIsP1 =
      getAddress(duel.player1_address) === player;
    const duelScore = winnerIsP1 ? duel.player1_score : duel.player2_score;
    if (duelScore == null || duelScore !== score) {
      return jsonError(
        "score_mismatch",
        `score ${score} does not match the recorded duel score ${duelScore ?? "null"}`,
        400,
      );
    }

    // ─── sign + broadcast ───────────────────────────────────────────────
    const onChainTournamentId = tournament.on_chain_id as Hex;
    const nonce = generateNonce();
    const matchCountDelta = 1n;

    const signature = await signTournamentSubmitAttestation({
      tournamentId: onChainTournamentId,
      player,
      score: BigInt(score),
      matchCountDelta,
      nonce,
    });

    let txHash: Hex;
    try {
      const walletClient = getWalletClient();
      txHash = await walletClient.writeContract({
        address: TOURNAMENT_POOL_V2_ADDRESS,
        abi: TOURNAMENT_POOL_ABI,
        functionName: "submitScore",
        args: [
          onChainTournamentId,
          player,
          BigInt(score),
          matchCountDelta,
          nonce,
          signature,
        ],
        account: walletClient.account ?? null,
        chain: walletClient.chain,
      });

      await getPublicClient().waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
    } catch (err) {
      console.error("[tournament-submit] on-chain write failed", {
        tournamentId,
        duelId,
        player,
        err,
      });
      const message = err instanceof Error ? err.message : "unknown";
      return jsonError("onchain_write_failed", message, 502);
    }

    // ─── idempotent upsert + rank compute ───────────────────────────────
    const bonus = tournament.participation_bonus;

    // Read existing entry (if any) for correct GREATEST + array-contains logic.
    const { data: existingRow } = await supabase
      .from("v2_tournament_entries")
      .select("*")
      .eq("tournament_id", tournament.id)
      .eq("player_address", player)
      .maybeSingle();
    const existing = existingRow as EntryRow | null;

    let nextBest: number;
    let nextMatchCount: number;
    let nextSourceDuelIds: string[];
    if (existing) {
      const alreadyCounted = existing.source_duel_ids.includes(duelId);
      nextBest = Math.max(existing.best_score, score);
      nextMatchCount = alreadyCounted
        ? existing.match_count
        : existing.match_count + 1;
      nextSourceDuelIds = alreadyCounted
        ? existing.source_duel_ids
        : [...existing.source_duel_ids, duelId];
    } else {
      nextBest = score;
      nextMatchCount = 1;
      nextSourceDuelIds = [duelId];
    }
    const nextEffective = computeEffectiveRankScore(
      nextBest,
      nextMatchCount,
      bonus,
    );

    const upsertPayload = {
      tournament_id: tournament.id,
      player_address: player,
      best_score: nextBest,
      match_count: nextMatchCount,
      effective_rank_score: nextEffective,
      source_duel_ids: nextSourceDuelIds,
      // v2: tag the duel path explicitly + zero the fee tracking.
      // `source` reflects the most recent submission's origin; a player with
      // prior solo retries still gets their entry flipped to 'duel' here on
      // their next duel win (subjective but consistent — see solo.ts).
      // `paid_retries_count` + `total_fee_paid_usdc` carry over unchanged
      // (duel never increments them). We omit them from the upsert rather
      // than reading+writing-same, since UPSERT INSERT path starts at 0
      // (DB defaults) and UPDATE path preserves existing values when the
      // column isn't in the payload.
      source: "duel" as const,
    };

    const { error: upsertErr } = await supabase
      .from("v2_tournament_entries")
      .upsert(upsertPayload, { onConflict: "tournament_id,player_address" });

    if (upsertErr) {
      // On-chain state is the source of truth; DB is a cache. Log loudly
      // and still return success so the UI can link out to Basescan.
      console.error("[tournament-submit] db upsert failed", {
        tournamentId,
        duelId,
        player,
        err: upsertErr.message,
      });
    }

    // ─── rank compute ───────────────────────────────────────────────────
    // Rank = 1 + count of non-excluded entries with strictly higher score.
    const { count: higher, error: rankErr } = await supabase
      .from("v2_tournament_entries")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournament.id)
      .eq("excluded", false)
      .gt("effective_rank_score", nextEffective);
    if (rankErr) {
      console.warn("[tournament-submit] rank query failed", rankErr.message);
    }
    const rank = (higher ?? 0) + 1;

    const response = jsonOk({
      submitted: true,
      rank,
      signature,
      txHash,
      bestScore: nextBest,
      matchCount: nextMatchCount,
      effectiveRankScore: nextEffective,
      source: "duel" as const,
    });
    // Telemetry header so downstream logs / proxies can distinguish duel vs
    // solo paths at the edge without parsing the body.
    response.headers.set("X-Tournament-Submit-Source", "duel");
    return response;
  };
}
