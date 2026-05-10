// ───────────────────────────────────────────────────────────────────────────
// Admin reconcile endpoint — repairs "lie-state" duel rows by reading
// on-chain ChallengeEscrow state and bringing DB into agreement.
//
//   POST /api/admin/duels/[id]/reconcile
//   Authorization: Bearer <ADMIN_API_TOKEN>
//
// Lie-state background: before the Task-1 guard landed, triggerSettle()
// claimed the DB row (status='settled') before broadcasting. If the
// contract reverted (common when P2's ERC-4337 accept UserOp silently
// failed → challenge status Open then Expired, never Accepted), the DB
// row was marked settled but winner_address / settle_tx_hash stayed null.
//
// Action matrix (driven by decideReconcileAction — pure, unit-tested):
//
//   on-chain Expired    + DB already 'refunded'     → noop-already-reconciled
//   on-chain Expired    + DB anything else          → mark-refunded-from-expired
//                                                      (funds already returned
//                                                      to creator by expireOpen
//                                                      / expireAccepted tx;
//                                                      we just fix the DB)
//   on-chain Settled    + DB status='settled' w/ winner → noop-already-reconciled
//   on-chain Settled    + DB anything else          → backfill-settled
//   on-chain Walkover   + DB status='settled' w/ winner → noop-already-reconciled
//   on-chain Walkover   + DB anything else          → backfill-settled
//   on-chain Accepted   + both scores present       → drive-settle (broadcast)
//   on-chain Accepted   + scores missing            → needs-manual (422)
//   on-chain Open/None  + DB lie-state              → needs-manual (422)
//
// Response shape:
//   200 { matchId, action, before, after, txHash }
//   422 { matchId, action: "needs-manual", before, after: before, reason }
//   401 { error: "unauthorized" }
//   404 { error: "not_found" }
//
// Per-app wire-up (only on 2048 for now; admin endpoints are centralized
// there to match /api/admin/flags convention):
//   export { adminReconcileHandler as POST } from "@skillos/duel-backend";
//   export const runtime = "nodejs";
// ───────────────────────────────────────────────────────────────────────────

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { type Address, type Hex, getAddress } from "viem";
import {
  CHALLENGE_ESCROW_ABI,
  CHALLENGE_ESCROW_ADDRESS,
} from "@skillos/contracts";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
  isUuid,
  signSettleAttestation,
} from "@skillos/lib-shared";
import type { Duel } from "@skillos/game-types";
import { CHALLENGE_STATUS } from "../../settle-guard";
import { decideWinner } from "../../decide-winner";

// ─── Types ────────────────────────────────────────────────────────────────

export type ReconcileAction =
  | "noop-already-reconciled"
  | "mark-refunded-from-expired"
  | "drive-settle"
  | "backfill-settled"
  | "needs-manual";

export interface ReconcileDecision {
  action: ReconcileAction;
  reason?: string;
  /** Backfill winner when action is "backfill-settled" (from on-chain winner). */
  winnerBackfill?: Address;
}

export interface ReconcileDecisionInput {
  onChainStatus: number;
  onChainWinner: Address;
  duelStatus: string;
  duelWinnerAddress: string | null;
  hasBothScores: boolean;
}

// ─── Pure decision function ────────────────────────────────────────────────
//
// Extracted from the handler so it has a crisp contract + full unit-test
// coverage. No side effects, no RPC, no DB.

export function decideReconcileAction(
  input: ReconcileDecisionInput,
): ReconcileDecision {
  const { onChainStatus, onChainWinner, duelStatus, duelWinnerAddress, hasBothScores } =
    input;

  if (onChainStatus === CHALLENGE_STATUS.Expired) {
    if (duelStatus === "refunded") {
      return { action: "noop-already-reconciled" };
    }
    return { action: "mark-refunded-from-expired" };
  }

  if (
    onChainStatus === CHALLENGE_STATUS.Settled ||
    onChainStatus === CHALLENGE_STATUS.Walkover
  ) {
    const alreadyReflected =
      duelStatus === "settled" &&
      !!duelWinnerAddress &&
      getAddress(duelWinnerAddress) === onChainWinner;
    if (alreadyReflected) return { action: "noop-already-reconciled" };
    return { action: "backfill-settled", winnerBackfill: onChainWinner };
  }

  if (onChainStatus === CHALLENGE_STATUS.Accepted) {
    if (!hasBothScores) {
      return {
        action: "needs-manual",
        reason:
          "challenge Accepted on-chain but at least one score missing in DB — cannot decide winner",
      };
    }
    return { action: "drive-settle" };
  }

  // None, Open, or any unexpected status
  const label =
    onChainStatus === CHALLENGE_STATUS.None
      ? "None"
      : onChainStatus === CHALLENGE_STATUS.Open
        ? "Open"
        : `Unknown(${onChainStatus})`;
  return {
    action: "needs-manual",
    reason: `on-chain status '${label}' requires manual review — admin reconcile does not auto-act on these states`,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────

function statusLabel(s: number): string {
  switch (s) {
    case CHALLENGE_STATUS.None:
      return "None";
    case CHALLENGE_STATUS.Open:
      return "Open";
    case CHALLENGE_STATUS.Accepted:
      return "Accepted";
    case CHALLENGE_STATUS.Settled:
      return "Settled";
    case CHALLENGE_STATUS.Expired:
      return "Expired";
    case CHALLENGE_STATUS.Walkover:
      return "Walkover";
    default:
      return `Unknown(${s})`;
  }
}

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Best-effort lookup of the terminal tx hash via event log scan. Returns
 *  null if not found — not fatal, admin can view on Basescan directly.
 *
 *  Exported so the reconcile-duels cron sweep (cron/reconcile-duels.ts)
 *  can re-use the same lookup heuristics without re-implementing the
 *  ~100k-block scan window.
 */
export async function findTerminalTxHash(
  challengeId: Hex,
  onChainStatus: number,
): Promise<Hex | null> {
  try {
    const publicClient = getPublicClient();
    const latest = await publicClient.getBlockNumber();
    // ~2 days on Base (@ 2s block time). Covers all realistic lie-state
    // matches. Anything older requires Basescan manual lookup.
    const fromBlock = latest > 100_000n ? latest - 100_000n : 0n;

    const eventName =
      onChainStatus === CHALLENGE_STATUS.Expired
        ? "ChallengeExpired"
        : "ChallengeSettled";

    const logs = await publicClient.getContractEvents({
      address: CHALLENGE_ESCROW_ADDRESS,
      abi: CHALLENGE_ESCROW_ABI,
      eventName,
      args: { id: challengeId },
      fromBlock,
      toBlock: "latest",
    });

    if (logs.length === 0) return null;
    // If multiple (shouldn't happen under current contract), take the last.
    return logs[logs.length - 1].transactionHash;
  } catch (err) {
    console.warn("[reconcile] findTerminalTxHash failed", err);
    return null;
  }
}

export async function adminReconcileHandler(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ─── auth ──────────────────────────────────────────────────────────
  const configToken = process.env.ADMIN_API_TOKEN;
  if (!configToken || configToken.length === 0) {
    console.error("[admin/reconcile] ADMIN_API_TOKEN not set");
    return unauthorized();
  }
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return unauthorized();
  const providedToken = authHeader.slice("Bearer ".length).trim();
  if (!safeEqual(providedToken, configToken)) return unauthorized();

  // ─── input ─────────────────────────────────────────────────────────
  const { id: matchId } = await ctx.params;
  if (!isUuid(matchId)) {
    return Response.json(
      { error: "invalid_match_id", message: "matchId must be a uuid v4" },
      { status: 400 },
    );
  }

  // ─── read DB ───────────────────────────────────────────────────────
  const supabase = getSupabaseService();
  const { data: row, error: readErr } = await supabase
    .from("v2_duels")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (readErr) {
    return Response.json(
      { error: "db_error", message: readErr.message },
      { status: 500 },
    );
  }
  if (!row) {
    return Response.json({ error: "not_found", matchId }, { status: 404 });
  }
  const duel = row as Duel;

  const challengeId = (duel.onchain_id ?? "") as Hex;
  if (!challengeId || !challengeId.startsWith("0x")) {
    return Response.json(
      {
        error: "no_onchain_id",
        message: "duel has no onchain_id; cannot reconcile",
        matchId,
      },
      { status: 422 },
    );
  }

  // ─── read on-chain ─────────────────────────────────────────────────
  const publicClient = getPublicClient();
  const raw = (await publicClient.readContract({
    address: CHALLENGE_ESCROW_ADDRESS,
    abi: CHALLENGE_ESCROW_ABI,
    functionName: "getChallenge",
    args: [challengeId],
  })) as {
    creator: Address;
    challenger: Address;
    gameSlug: Hex;
    stake: bigint;
    createdAt: bigint;
    acceptedAt: bigint;
    expiresAt: bigint;
    status: number;
    winner: Address;
    payoutAmount: bigint;
  };

  const before = {
    dbStatus: duel.status,
    dbWinner: duel.winner_address,
    dbSettleTxHash: duel.settle_tx_hash,
    onChainStatus: raw.status,
    onChainStatusLabel: statusLabel(raw.status),
    onChainWinner: raw.winner,
  };

  // ─── decide ────────────────────────────────────────────────────────
  const decision = decideReconcileAction({
    onChainStatus: raw.status,
    onChainWinner: raw.winner,
    duelStatus: duel.status,
    duelWinnerAddress: duel.winner_address,
    hasBothScores: duel.player1_score != null && duel.player2_score != null,
  });

  if (decision.action === "needs-manual") {
    return Response.json(
      {
        matchId,
        action: decision.action,
        before,
        after: before,
        txHash: null,
        reason: decision.reason,
      },
      { status: 422 },
    );
  }

  if (decision.action === "noop-already-reconciled") {
    return Response.json({
      matchId,
      action: decision.action,
      before,
      after: before,
      txHash: null,
    });
  }

  // ─── act ───────────────────────────────────────────────────────────
  let txHash: Hex | null = null;
  const now = new Date().toISOString();

  if (decision.action === "mark-refunded-from-expired") {
    txHash = await findTerminalTxHash(challengeId, CHALLENGE_STATUS.Expired);
    const { error: updErr } = await supabase
      .from("v2_duels")
      .update({
        status: "refunded",
        settle_tx_hash: txHash,
        settled_at: now,
      })
      .eq("id", matchId);
    if (updErr) {
      return Response.json(
        { error: "db_update_failed", message: updErr.message, matchId },
        { status: 500 },
      );
    }
  } else if (decision.action === "backfill-settled") {
    if (!decision.winnerBackfill) {
      return Response.json(
        { error: "internal", message: "winnerBackfill missing from decision" },
        { status: 500 },
      );
    }
    txHash = await findTerminalTxHash(challengeId, raw.status);
    const { error: updErr } = await supabase
      .from("v2_duels")
      .update({
        status: "settled",
        winner_address: decision.winnerBackfill,
        settle_tx_hash: txHash,
        settled_at: now,
      })
      .eq("id", matchId);
    if (updErr) {
      return Response.json(
        { error: "db_update_failed", message: updErr.message, matchId },
        { status: 500 },
      );
    }
  } else if (decision.action === "drive-settle") {
    // Broadcast settle() with the correct winner.
    const winner = decideWinner(duel);
    const creatorScore = BigInt(duel.player1_score ?? 0);
    const challengerScore = BigInt(duel.player2_score ?? 0);
    const signature = await signSettleAttestation({
      challengeId,
      winner,
      creatorScore,
      challengerScore,
    });
    const walletClient = getWalletClient();
    try {
      txHash = await walletClient.writeContract({
        address: CHALLENGE_ESCROW_ADDRESS,
        abi: CHALLENGE_ESCROW_ABI,
        functionName: "settle",
        args: [challengeId, winner, creatorScore, challengerScore, signature],
        account: walletClient.account ?? null,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      return Response.json(
        { error: "onchain_settle_failed", message, matchId },
        { status: 502 },
      );
    }
    const { error: updErr } = await supabase
      .from("v2_duels")
      .update({
        status: "settled",
        winner_address: winner,
        settle_tx_hash: txHash,
        settled_at: now,
      })
      .eq("id", matchId);
    if (updErr) {
      return Response.json(
        {
          error: "db_update_failed_after_onchain_success",
          message: updErr.message,
          matchId,
          onChainTxHash: txHash,
        },
        { status: 500 },
      );
    }
  }

  // ─── re-read for after snapshot ───────────────────────────────────
  const { data: afterRow } = await supabase
    .from("v2_duels")
    .select("status, winner_address, settle_tx_hash, settled_at")
    .eq("id", matchId)
    .single();

  return Response.json({
    matchId,
    action: decision.action,
    before,
    after: {
      dbStatus:
        (afterRow as { status?: string } | null)?.status ?? duel.status,
      dbWinner:
        (afterRow as { winner_address?: string | null } | null)
          ?.winner_address ?? null,
      dbSettleTxHash:
        (afterRow as { settle_tx_hash?: string | null } | null)
          ?.settle_tx_hash ?? null,
    },
    txHash,
  });
}
