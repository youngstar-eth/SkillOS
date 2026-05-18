// ───────────────────────────────────────────────────────────────────────────
// Next.js route handler FACTORY for tournaments-v2 solo score submission.
//
//   POST /api/tournaments/[id]/solo
//   body: {
//     playerAddress: "0x…",
//     score: 1844,
//     gameStateHash?: "0x…",   // client-computed, reserved for v3 replay verify
//     feeTxHash?:    "0x…"     // required when this is a paid retry (2nd+ submission)
//   }
//
// Per-app wire-up (apps/<game>/src/app/api/tournaments/[id]/solo/route.ts):
//   import { createTournamentSoloHandler } from "@skillos/duel-backend";
//   export const runtime = "nodejs";
//   export const POST = createTournamentSoloHandler({ game: "2048" });
//
// Free-vs-paid decision (the load-bearing bit of the YC "sweepstakes-safe"
// pitch — every player's first solo submission is free; retries are paid and
// go to platform revenue, not prize pool):
//
//   priorSoloRuns = count(v2_tournament_solo_runs where tournament+player)
//
//   if priorSoloRuns == 0  → free path
//                            - no fee required
//                            - sign + broadcast submitSoloScore (1st)
//                            - feePaidUsdc = 0, feeTxHash = NULL
//
//   if priorSoloRuns >= 1  → paid path
//                            - body must include feeTxHash
//                            - verify on-chain: receipt exists + status=success
//                              + a RetryFeePaid event logged for this
//                              (tournament, player) with amount >= RETRY_FEE
//                            - DB partial-unique index on fee_tx_hash blocks
//                              replay of the same tx across multiple runs
//
// Response codes:
//   200 { submitted: true, rank, txHash, soloRunId, ... }
//   400 invalid body / game mismatch / tournament not active
//   402 payment_required — when priorSoloRuns >= 1 and feeTxHash missing
//   404 tournament not found
//   409 tournament settled / feeTxHash already used
//
// Spam protection note: the 60s rate limit was retired with pay-then-play
// (Tournaments v2). Every submission past the first requires a
// chargeRetryFee on-chain settlement (1 USDC), so spam is gated by
// economics — the throughput ceiling is "as fast as you can pay".
//
// On-chain broadcast is fire-and-forget (plan decision — retry UX needs
// snappy response). writeContract returns after RPC broadcast accepts the
// tx, BEFORE block inclusion. The tx hash is recorded on v2_tournament_solo_runs
// so the existing reconcile cron can catch tx failures after the fact.
//
// DB write ordering matters:
//   1. insert v2_tournament_solo_runs FIRST (fee_tx_hash unique constraint
//      is the authority on "is this fee tx already consumed?")
//   2. then broadcast submitSoloScore (fire-and-forget)
//   3. then upsert v2_tournament_entries (derived view; on-chain + solo_runs
//      are source of truth)
//   4. then compute rank + return
//
// If step 3 fails, on-chain state + solo_runs still reflect the submit;
// reconcile cron will re-derive the entry. Logged as a warning.
// ───────────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  type Address,
  type Hex,
  getAddress,
  isHex,
  parseEventLogs,
} from "viem";
import {
  type BuilderCodeGame,
  dataSuffixForGame,
  MATCH_COUNT_CAP,
  RETRY_FEE,
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V2_ADDRESS,
} from "@skillos/contracts";
import { checkPlausibility, type GameType } from "@skillos/ai-coach";
import type { Verdict } from "@skillos/sp-engine";
import { waitUntil } from "@vercel/functions";
import { applySPAward } from "../../sp/award";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
  isUuid,
  jsonError,
  jsonOk,
  parseAddress,
  signTournamentSoloSubmitAttestation,
} from "@skillos/lib-shared";

import type { TournamentGame } from "../../cron/tournaments";

export interface TournamentSoloHandlerConfig {
  /** Per-app canonical game name. Baked in at route wire-up, not request-body. */
  game: TournamentGame;
}

/** Row shape for v2_tournaments — matches submit.ts shape. */
interface TournamentRow {
  id: string;
  on_chain_id: string;
  game: string;
  cycle_type: "daily" | "weekly";
  starts_at: string;
  ends_at: string;
  participation_bonus: number;
  settled_at: string | null;
  tournament_class: "human-only" | "agent-only" | "mixed-declared";
}

/** Row shape for v2_tournament_entries — v2 columns only. */
interface EntryRow {
  best_score: number;
  match_count: number;
  paid_retries_count: number;
  total_fee_paid_usdc: string;
  source_duel_ids: string[];
}

/**
 * Effective rank score matching the on-chain formula:
 *   best * 85 + min(match_count, MATCH_COUNT_CAP) * bonus * 15
 * Cap mirrors TournamentPool._computeEffectiveScore so DB ranking ≡ contract ranking.
 */
function computeEffectiveRankScore(
  bestScore: number,
  matchCount: number,
  bonus: number,
): number {
  const capped = Math.min(matchCount, Number(MATCH_COUNT_CAP));
  return bestScore * 85 + capped * bonus * 15;
}

function randomBytes32(): Hex {
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}

/** Strict 0x-prefixed 32-byte hex (66 chars incl. 0x). */
function isBytes32Hex(value: unknown): value is Hex {
  return typeof value === "string" && isHex(value) && value.length === 66;
}

/**
 * X20.0a — parse the optional `moves` field from a solo submit body.
 *
 * Pure, exported for unit tests. Returns:
 *   - { ok: true, value: number } when a valid integer was supplied
 *   - { ok: true, value: null }   when absent (legacy clients during rollout)
 *   - { ok: false, code, message } on type / range violations
 *
 * Upper bound (1_000_000) is a sanity ceiling — same shape as the
 * durationSeconds 86_400 ceiling. Fraud-detection thresholds belong to
 * the F0 formula in X20.0b, not to this validator.
 */
export function parseMovesField(
  value: unknown,
):
  | { ok: true; value: number | null }
  | { ok: false; code: string; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 1_000_000
  ) {
    return {
      ok: false,
      code: "invalid_moves",
      message: "moves must be a non-negative integer ≤ 1000000",
    };
  }
  return { ok: true, value };
}

// ─── anti-cheat fire-and-forget hook ──────────────────────────────────────

const PLAUSIBILITY_TIMEOUT_MS = 10_000;

/** TournamentGame slug → GameType enum. Mismatch is localized to "2048". */
function toGameType(game: TournamentGame): GameType {
  return game === "2048" ? "game2048" : game;
}

/**
 * Fire-and-forget plausibility audit for a solo submission. Mirrors the duel
 * settle hook in settle.ts — must never affect the response path:
 *   - caller does not await (return type void)
 *   - no thrown error escapes; all failures logged and swallowed
 *   - 10s timeout ensures a hung Haiku call doesn't hang the event loop
 *   - registered with Vercel `waitUntil` so the serverless container is kept
 *     alive past the response until this work completes — without it, fast
 *     solo submits (~500ms response) may be cut short by container freeze
 *     before the 3-5s Haiku call lands, orphaning plausibility_check=NULL
 *
 * On success, writes the full PlausibilityResponse to
 * v2_tournament_solo_runs.plausibility_check. On any failure (Haiku down,
 * timeout, DB write fails), column stays NULL — settle cron treats NULL as
 * optimistic "plausible" per sprint decision.
 *
 * Duration is not currently collected by the solo endpoint (client doesn't
 * send it); passed as 0. When we wire duration in v3 replay, swap here.
 */
function firePlausibilityCheckAsync(input: {
  soloRunId: string;
  gameType: TournamentGame;
  score: number;
  /**
   * Gameplay duration captured client-side. 0 indicates "not provided"
   * (legacy clients during rolling deploy). The plausibility prompt's
   * 0-second branch will flag — fix is to ensure clients send this.
   */
  durationSeconds: number;
  /**
   * When provided, chains a Skill-Point award for the submitter onto the
   * same waitUntil lifetime as the plausibility audit. The verdict drives
   * the multiplier (plausible=1.0, suspicious=0.5, implausible=0.0).
   * On plausibility failure (timeout, db-write error) SP defaults to
   * "plausible" — mirrors the cron-settle optimism contract.
   */
  sp?: {
    playerAddress: Address;
  };
}): void {
  const checkPromise = checkPlausibility({
    duelId: input.soloRunId, // carries for log correlation only; not consumed by prompt
    gameType: toGameType(input.gameType),
    winnerScore: input.score,
    loserScore: 0, // solo — no opponent
    durationSeconds: input.durationSeconds,
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("anticheat_timeout")),
      PLAUSIBILITY_TIMEOUT_MS,
    );
  });

  const job = Promise.race([checkPromise, timeoutPromise])
    .then(async (result): Promise<Verdict> => {
      try {
        await getSupabaseService()
          .from("v2_tournament_solo_runs")
          .update({ plausibility_check: result })
          .eq("id", input.soloRunId);
      } catch (err) {
        console.warn(
          "[solo-anticheat] db write failed",
          input.soloRunId,
          err,
        );
      }
      return result.verdict;
    })
    .catch((err): Verdict => {
      console.warn("[solo-anticheat] check failed", input.soloRunId, err);
      return "plausible";
    })
    .then(async (verdict) => {
      if (!input.sp) return;
      try {
        await applySPAward({
          userAddress: input.sp.playerAddress,
          event: { kind: "solo_submit", verdict },
          // tournaments_participated is bumped at TOURNAMENT settle (one
          // per ranked participant), NOT per solo-run submit — otherwise
          // a player making 5 paid retries in one tournament would show
          // as "participated: 5" which would be misleading on the
          // leaderboard.
        });
      } catch (err) {
        console.warn(
          "[sp-award] solo-submit failed",
          input.soloRunId,
          err,
        );
      }
    });

  // Hand the job to Vercel's container-lifetime manager so it survives past
  // response-send. No-op in local dev (`waitUntil` returns undefined).
  waitUntil(job);
}

export function createTournamentSoloHandler(
  config: TournamentSoloHandlerConfig,
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

    const gameStateHashRaw = payload.gameStateHash;
    const gameStateHash =
      typeof gameStateHashRaw === "string" && gameStateHashRaw.length > 0
        ? gameStateHashRaw
        : null;

    const feeTxHashRaw = payload.feeTxHash;
    const feeTxHashProvided = isBytes32Hex(feeTxHashRaw) ? feeTxHashRaw : null;

    // Optional client-supplied gameplay duration. Plausibility audit uses
    // this to avoid the 0-second false-positive branch ("score X in 0s
    // is physically impossible"). Tolerated as missing for the rolling
    // deploy window — defaults to 0 (legacy behavior) when absent.
    const durationSecondsRaw = payload.durationSeconds;
    let durationSeconds = 0;
    if (durationSecondsRaw !== undefined && durationSecondsRaw !== null) {
      if (
        typeof durationSecondsRaw !== "number" ||
        !Number.isFinite(durationSecondsRaw) ||
        !Number.isInteger(durationSecondsRaw) ||
        durationSecondsRaw < 0 ||
        durationSecondsRaw > 86_400
      ) {
        return jsonError(
          "invalid_duration",
          "durationSeconds must be a non-negative integer ≤ 86400",
          400,
        );
      }
      durationSeconds = durationSecondsRaw;
    }

    // X20.0a — moves instrumentation (AntiCheat F0 prerequisite). Plumbing
    // only: stored on the solo_runs row, NOT enforced at submit. F0 formula
    // in X20.0b is the first reader. Absent / null = legacy client → NULL.
    const movesParsed = parseMovesField(payload.moves);
    if (!movesParsed.ok) {
      return jsonError(movesParsed.code, movesParsed.message, 400);
    }
    const moves = movesParsed.value;

    // ─── tournament lookup + gating ─────────────────────────────────────
    const supabase = getSupabaseService();
    const { data: tournamentRow, error: tReadErr } = await supabase
      .from("v2_tournaments")
      .select(
        "id,on_chain_id,game,cycle_type,starts_at,ends_at,participation_bonus,settled_at,tournament_class",
      )
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

    if (tournament.game !== config.game) {
      return jsonError(
        "game_mismatch",
        `tournament is for '${tournament.game}', endpoint serves '${config.game}'`,
        400,
      );
    }
    // X14.0: class enforcement. Per-game routes are the human-only path —
    // no SIWA wiring here. Reject if the tournament is declared agent-only.
    // Off-chain enforcement only (supplement v1.5 §3.16).
    if (tournament.tournament_class === "agent-only") {
      return jsonError(
        "class_mismatch",
        "Tournament is agent-only; human submission rejected.",
        403,
      );
    }
    if (tournament.settled_at) {
      return jsonError(
        "tournament_settled",
        "tournament already settled; no new submissions accepted",
        409,
      );
    }

    const nowMs = Date.now();
    const startsMs = new Date(tournament.starts_at).getTime();
    const endsMs = new Date(tournament.ends_at).getTime();
    if (nowMs < startsMs) {
      return jsonError(
        "tournament_not_active",
        `tournament starts at ${tournament.starts_at}`,
        400,
      );
    }
    if (nowMs >= endsMs) {
      return jsonError(
        "tournament_expired",
        `tournament closed at ${tournament.ends_at}`,
        400,
      );
    }

    // ─── free/paid decision ──────────────────────────────────────────────
    // Any prior solo run for (tournament, player) flips this to paid retry.
    // The 60s cooldown was retired with pay-then-play (see header comment) —
    // on-chain payment settlement is the spam gate.
    const { data: priorRun, error: lastRunErr } = await supabase
      .from("v2_tournament_solo_runs")
      .select("submitted_at")
      .eq("tournament_id", tournament.id)
      .eq("player_address", player)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRunErr) return jsonError("db_error", lastRunErr.message, 500);

    const isPaidRetry = priorRun !== null;

    let feeTxHash: Hex | null = null;
    if (isPaidRetry) {
      if (!feeTxHashProvided) {
        return jsonError(
          "payment_required",
          `retry fee of ${RETRY_FEE.toString()} USDC atoms (1 USDC) required; include feeTxHash after calling chargeRetryFee`,
          402,
        );
      }
      const verified = await verifyRetryFeeTx({
        feeTxHash: feeTxHashProvided,
        tournamentOnChainId: tournament.on_chain_id as Hex,
        player,
      });
      if (!verified.ok) {
        return jsonError(verified.code, verified.message, 400);
      }
      feeTxHash = feeTxHashProvided;
    }

    // ─── sign attestation ───────────────────────────────────────────────
    const onChainTournamentId = tournament.on_chain_id as Hex;
    const soloRunIdOnchain = randomBytes32();
    const nonce = randomBytes32();
    const matchCountDelta = 1n;

    const signature = await signTournamentSoloSubmitAttestation({
      tournamentId: onChainTournamentId,
      player,
      score: BigInt(score),
      soloRunId: soloRunIdOnchain,
      matchCountDelta,
      nonce,
    });

    // ─── insert solo_runs FIRST — fee_tx_hash unique index is the authority
    //     on "is this fee already consumed" ─────────────────────────────
    const { data: soloRunRow, error: insertErr } = await supabase
      .from("v2_tournament_solo_runs")
      .insert({
        tournament_id: tournament.id,
        player_address: player,
        score,
        is_paid_retry: isPaidRetry,
        fee_paid_usdc: isPaidRetry ? 1 : 0,
        fee_tx_hash: feeTxHash,
        game_state_hash: gameStateHash,
        // X20.0a plumbing — null when client doesn't send (legacy rolling
        // deploy window). F0 formula in X20.0b skips NULL rows.
        moves,
        // X14.0: per-game routes are the human path (no SIWA wiring here).
        is_agent: false,
        class_tag: "human",
      })
      .select("id")
      .single();
    if (insertErr) {
      // Postgres unique_violation (23505) → fee_tx already used. Anything
      // else is an unexpected DB failure.
      if (insertErr.code === "23505") {
        return jsonError(
          "fee_tx_already_used",
          "feeTxHash has already been consumed by another submission",
          409,
        );
      }
      return jsonError("db_error", insertErr.message, 500);
    }
    const soloRunDbId = soloRunRow.id as string;

    // ─── fire-and-forget on-chain submitSoloScore ───────────────────────
    // writeContract returns after RPC broadcast (hash assigned) — does NOT
    // wait for block inclusion. Reconcile cron picks up failed broadcasts.
    //
    // dataSuffix: ERC-8021 ASCII-hex Builder Code tail (X10b). Mirrors the
    // X10 agent path. Contract ignores the tail bytes; off-chain indexers
    // (Blockscout, Base App store) parse it for per-game attribution. The
    // game slug is captured from the factory closure (config.game), so the
    // suffix is deterministic per route.
    let txHash: Hex | null = null;
    try {
      const walletClient = getWalletClient();
      txHash = await walletClient.writeContract({
        address: TOURNAMENT_POOL_V2_ADDRESS,
        abi: TOURNAMENT_POOL_ABI,
        functionName: "submitSoloScore",
        args: [
          onChainTournamentId,
          player,
          BigInt(score),
          soloRunIdOnchain,
          matchCountDelta,
          nonce,
          signature,
        ],
        dataSuffix: dataSuffixForGame(config.game as BuilderCodeGame),
        account: walletClient.account ?? null,
        chain: walletClient.chain,
      });
    } catch (err) {
      // Broadcast-level failure (e.g., RPC down, nonce conflict). DB row is
      // already written; reconcile will retry. Surface the error so UI can
      // show a soft warning but still proceed — the fee is on-chain already.
      console.error("[tournament-solo] writeContract failed", {
        tournamentId,
        player,
        soloRunDbId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // ─── upsert v2_tournament_entries ───────────────────────────────────
    const bonus = tournament.participation_bonus;
    const { data: existingRow } = await supabase
      .from("v2_tournament_entries")
      .select(
        "best_score,match_count,paid_retries_count,total_fee_paid_usdc,source_duel_ids",
      )
      .eq("tournament_id", tournament.id)
      .eq("player_address", player)
      .maybeSingle();
    const existing = existingRow as EntryRow | null;

    const nextBest = existing
      ? Math.max(existing.best_score, score)
      : score;
    const nextMatchCount = (existing?.match_count ?? 0) + 1;
    const nextPaidRetries =
      (existing?.paid_retries_count ?? 0) + (isPaidRetry ? 1 : 0);
    const nextTotalFee =
      Number(existing?.total_fee_paid_usdc ?? 0) + (isPaidRetry ? 1 : 0);
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
      source: "solo" as const,
      paid_retries_count: nextPaidRetries,
      total_fee_paid_usdc: nextTotalFee,
      // Preserve existing source_duel_ids (duel history stays; new solo runs
      // don't contribute to that column).
      source_duel_ids: existing?.source_duel_ids ?? [],
      // X14.0: human per-game path.
      is_agent: false,
      class_tag: "human" as const,
    };

    const { error: upsertErr } = await supabase
      .from("v2_tournament_entries")
      .upsert(upsertPayload, { onConflict: "tournament_id,player_address" });

    if (upsertErr) {
      console.error("[tournament-solo] entries upsert failed", {
        tournamentId,
        player,
        soloRunDbId,
        err: upsertErr.message,
      });
    }

    // ─── rank compute ───────────────────────────────────────────────────
    const { count: higher, error: rankErr } = await supabase
      .from("v2_tournament_entries")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournament.id)
      .eq("excluded", false)
      .gt("effective_rank_score", nextEffective);
    if (rankErr) {
      console.warn("[tournament-solo] rank query failed", rankErr.message);
    }
    const rank = (higher ?? 0) + 1;

    const nextRetryFeeUsdcAtoms = RETRY_FEE.toString();

    // Fire-and-forget anti-cheat audit. Response is not blocked. Plausibility
    // verdict lands on the solo_runs row when Haiku completes (~3-5s). Settle
    // cron reads it downstream; NULL is treated as optimistic "plausible".
    firePlausibilityCheckAsync({
      soloRunId: soloRunDbId,
      gameType: config.game,
      score,
      durationSeconds,
      sp: { playerAddress: player },
    });

    return jsonOk({
      submitted: true,
      soloRunId: soloRunDbId,
      rank,
      txHash,
      signature,
      bestScore: nextBest,
      matchCount: nextMatchCount,
      effectiveRankScore: nextEffective,
      isPaidRetry,
      feePaidUsdcAtoms: isPaidRetry ? Number(RETRY_FEE) : 0,
      nextRetryFeeUsdcAtoms,
    });
  };
}

// ─── Fee-tx on-chain verification ──────────────────────────────────────────

type VerifyOk = { ok: true };
type VerifyErr = { ok: false; code: string; message: string };

/**
 * Confirm that the given tx hash is an on-chain RetryFeePaid event for this
 * (tournament, player), emitted from the v2 pool, with amount >= RETRY_FEE.
 *
 * This is the contract-level attestation that the retry fee landed. DB-level
 * fee_tx_hash uniqueness (partial unique index) is the OTHER half of the
 * defense: the same tx can verify on-chain multiple times, but the unique
 * index ensures it only backs one solo_runs row.
 */
async function verifyRetryFeeTx(params: {
  feeTxHash: Hex;
  tournamentOnChainId: Hex;
  player: Address;
}): Promise<VerifyOk | VerifyErr> {
  const { feeTxHash, tournamentOnChainId, player } = params;
  let receipt;
  try {
    receipt = await getPublicClient().getTransactionReceipt({ hash: feeTxHash });
  } catch (err) {
    return {
      ok: false,
      code: "fee_tx_not_found",
      message: `fee tx ${feeTxHash} not found on-chain: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  if (receipt.status !== "success") {
    return {
      ok: false,
      code: "fee_tx_reverted",
      message: `fee tx ${feeTxHash} did not succeed on-chain (status=${receipt.status})`,
    };
  }

  // Scan logs for a RetryFeePaid event from the v2 pool for this
  // (tournament, player) pair. parseEventLogs filters by contract address
  // of the event signature present in TOURNAMENT_POOL_ABI.
  const events = parseEventLogs({
    abi: TOURNAMENT_POOL_ABI,
    eventName: "RetryFeePaid",
    logs: receipt.logs,
  });

  const targetIdLower = tournamentOnChainId.toLowerCase();
  const match = events.find((e) => {
    if (e.address.toLowerCase() !== TOURNAMENT_POOL_V2_ADDRESS.toLowerCase()) {
      return false;
    }
    const args = e.args as {
      id?: Hex;
      player?: Address;
      amount?: bigint;
    };
    if (!args.id || !args.player || args.amount == null) return false;
    if (args.id.toLowerCase() !== targetIdLower) return false;
    if (getAddress(args.player) !== player) return false;
    return args.amount >= RETRY_FEE;
  });

  if (!match) {
    return {
      ok: false,
      code: "fee_tx_mismatch",
      message:
        "fee tx does not contain a RetryFeePaid event for this (tournament, player) with sufficient amount",
    };
  }

  return { ok: true };
}
