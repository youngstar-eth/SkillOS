// ───────────────────────────────────────────────────────────────────────────
// Duel reconcile cron logic — periodic sweep that scans for "stuck" duel
// rows and brings their DB state into agreement with on-chain truth.
//
// Single entry point:
//
//   runReconcileDuels(deps?)
//     Currently scheduled daily at 01:13 UTC (between settle-tournaments
//     at 00:05 and anchor-sp-snapshot at 02:07). Schedule lives in
//     apps/orchestrator/vercel.json — that file is the source of truth.
//
//     Stale-row criteria (the rows we sweep):
//       (1) lie-state — status='settled' AND winner_address IS NULL
//             Should be near-zero given the settle-guard pre-flight (PR #4),
//             but the cron is the safety net if a row ever slips through
//             (e.g. STUDIO_PRIVATE_KEY rotation mid-broadcast).
//       (2) abandoned — status IN (matched, player1_submitted,
//             player2_submitted) AND matched_at < now - 24h
//             Walkover normally fires from /api/duel/status polls; the
//             cron handles the case where neither player ever returns to
//             trigger a status check.
//
//     Per row, runReconcileDuels:
//       (a) Reads on-chain ChallengeEscrow.getChallenge(challengeId)
//       (b) Calls decideReconcileAction (pure, exhaustively unit-tested)
//       (c) Acts on the decision: mark-refunded / backfill-settled /
//           drive-settle  — except in dry-run mode, which logs intent only
//
//     Bounded blast radius: hard limit of 50 rows per run by default, with
//     per-row try/catch so a single bad row doesn't abort the sweep.
//     `drive-settle` actions broadcast on-chain txs — same key path as
//     runSettleTournaments, no new credentials.
//
//     Dry-run mode: when `dryRun: true` (or DRY_RUN env var set), the
//     decision is logged but no DB or on-chain mutations occur. Used on
//     first deploy to validate behavior before flipping to live.
//
// Returns a structured result the cron route JSON-serializes directly.
// Errors are collected per-row so a single bad match doesn't stop the sweep.
// ───────────────────────────────────────────────────────────────────────────

import { type Address, type Hex, getAddress } from "viem";
import {
  CHALLENGE_ESCROW_ABI,
  CHALLENGE_ESCROW_ADDRESS,
} from "@skillbase/contracts";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
  signSettleAttestation,
} from "@skillbase/lib-shared";
import type { Duel } from "@skillbase/game-types";
import {
  decideReconcileAction,
  findTerminalTxHash,
  type ReconcileAction,
  type ReconcileDecision,
} from "../api/admin/reconcile";
import { CHALLENGE_STATUS } from "../settle-guard";
import { decideWinner } from "../decide-winner";

// ─── Tunables ──────────────────────────────────────────────────────────────

/** Hard cap on rows processed per run. Bounds runtime + chain cost. */
const DEFAULT_LIMIT = 50;

/** Stale threshold for active states. Rows matched older than this AND
 *  still in submitted/matched are reconcile candidates. */
const STALE_ACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// ─── Public types ──────────────────────────────────────────────────────────

export interface ReconcileDuelsResult {
  /** Rows we considered (after stale-row query). */
  scanned: number;
  /** Rows the decision function chose to act on AND we executed. */
  acted: Array<{
    matchId: string;
    action: Exclude<ReconcileAction, "noop-already-reconciled" | "needs-manual">;
    txHash: Hex | null;
  }>;
  /** Rows the decision function flagged needs-manual (skipped). */
  needsManual: Array<{ matchId: string; reason: string }>;
  /** Rows already in sync (no-op). */
  noops: Array<{ matchId: string }>;
  /** Per-row failures (chain RPC error, DB error, etc). */
  errors: Array<{ matchId: string; message: string }>;
  /** Set when dryRun is true — actions were logged but not executed. */
  dryRun: boolean;
}

export interface ReconcileDuelsDependencies {
  supabase?: ReturnType<typeof getSupabaseService>;
  publicClient?: ReturnType<typeof getPublicClient>;
  walletClient?: ReturnType<typeof getWalletClient>;
  /** Hard cap on rows processed per run. Default 50. */
  limit?: number;
  /** When true, log intended actions without DB/chain side effects. */
  dryRun?: boolean;
  /** Override the stale-active threshold (ms). Default 24h. */
  staleThresholdMs?: number;
  /** Override "now" for deterministic testing. Default Date.now(). */
  now?: () => number;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

interface OnChainRead {
  status: number;
  winner: Address;
}

async function readOnChainStatus(
  publicClient: ReturnType<typeof getPublicClient>,
  challengeId: Hex,
): Promise<OnChainRead> {
  const raw = (await publicClient.readContract({
    address: CHALLENGE_ESCROW_ADDRESS,
    abi: CHALLENGE_ESCROW_ABI,
    functionName: "getChallenge",
    args: [challengeId],
  })) as {
    status: number;
    winner: Address;
  };
  return { status: raw.status, winner: raw.winner };
}

/** Collect candidate rows: lie-state ∪ stale-active. Two narrow queries
 *  is more readable than supabase-js .or() composition; we cap each
 *  half at `limit` and merge-cap to `limit` total. */
async function selectStaleDuels(
  supabase: ReturnType<typeof getSupabaseService>,
  limit: number,
  staleCutoffIso: string,
): Promise<Duel[]> {
  const { data: lies, error: lieErr } = await supabase
    .from("v2_duels")
    .select("*")
    .eq("status", "settled")
    .is("winner_address", null)
    .limit(limit);
  if (lieErr) throw new Error(`selectStaleDuels.lies: ${lieErr.message}`);

  const { data: actives, error: actErr } = await supabase
    .from("v2_duels")
    .select("*")
    .in("status", ["player1_submitted", "player2_submitted", "matched"])
    .lt("matched_at", staleCutoffIso)
    .limit(limit);
  if (actErr) throw new Error(`selectStaleDuels.actives: ${actErr.message}`);

  // Merge with id-dedupe (a row can't be in both queries today, but defensive).
  const seen = new Set<string>();
  const merged: Duel[] = [];
  for (const row of [...(lies ?? []), ...(actives ?? [])]) {
    const d = row as Duel;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    merged.push(d);
    if (merged.length >= limit) break;
  }
  return merged;
}

async function executeAction(args: {
  duel: Duel;
  challengeId: Hex;
  decision: ReconcileDecision;
  onChainStatus: number;
  supabase: ReturnType<typeof getSupabaseService>;
  publicClient: ReturnType<typeof getPublicClient>;
  walletClient: ReturnType<typeof getWalletClient>;
}): Promise<{ txHash: Hex | null }> {
  const {
    duel,
    challengeId,
    decision,
    onChainStatus,
    supabase,
    publicClient,
    walletClient,
  } = args;
  const now = new Date().toISOString();
  let txHash: Hex | null = null;

  if (decision.action === "mark-refunded-from-expired") {
    txHash = await findTerminalTxHash(challengeId, CHALLENGE_STATUS.Expired);
    const { error } = await supabase
      .from("v2_duels")
      .update({
        status: "refunded",
        settle_tx_hash: txHash,
        settled_at: now,
      })
      .eq("id", duel.id);
    if (error) throw new Error(`db_update_failed: ${error.message}`);
    return { txHash };
  }

  if (decision.action === "backfill-settled") {
    if (!decision.winnerBackfill) {
      throw new Error("backfill-settled: winnerBackfill missing from decision");
    }
    txHash = await findTerminalTxHash(challengeId, onChainStatus);
    const { error } = await supabase
      .from("v2_duels")
      .update({
        status: "settled",
        winner_address: decision.winnerBackfill,
        settle_tx_hash: txHash,
        settled_at: now,
      })
      .eq("id", duel.id);
    if (error) throw new Error(`db_update_failed: ${error.message}`);
    return { txHash };
  }

  if (decision.action === "drive-settle") {
    const winner = decideWinner(duel);
    const creatorScore = BigInt(duel.player1_score ?? 0);
    const challengerScore = BigInt(duel.player2_score ?? 0);
    const signature = await signSettleAttestation({
      challengeId,
      winner,
      creatorScore,
      challengerScore,
    });
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
    const { error } = await supabase
      .from("v2_duels")
      .update({
        status: "settled",
        winner_address: winner,
        settle_tx_hash: txHash,
        settled_at: now,
      })
      .eq("id", duel.id);
    if (error) {
      throw new Error(
        `db_update_failed_after_onchain_success: ${error.message} (txHash=${txHash})`,
      );
    }
    return { txHash };
  }

  // Unreachable: caller already filtered noop / needs-manual.
  throw new Error(`executeAction: unexpected action ${decision.action}`);
}

// ─── Public entry point ────────────────────────────────────────────────────

export async function runReconcileDuels(
  deps: ReconcileDuelsDependencies = {},
): Promise<ReconcileDuelsResult> {
  const supabase = deps.supabase ?? getSupabaseService();
  const publicClient = deps.publicClient ?? getPublicClient();
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const staleMs = deps.staleThresholdMs ?? STALE_ACTIVE_THRESHOLD_MS;
  const nowFn = deps.now ?? Date.now;

  // Resolve dry-run from deps OR env var. Keeps the route handler thin —
  // it just toggles deps.dryRun based on the query param it sees.
  const dryRun =
    deps.dryRun === true ||
    (deps.dryRun === undefined && process.env.DRY_RUN === "1");

  // Lazy walletClient — only needed if we hit a drive-settle. Dry runs
  // and pure backfill/refund sweeps skip wallet access entirely.
  let walletClientCache: ReturnType<typeof getWalletClient> | null = null;
  const getWallet = () => {
    if (walletClientCache) return walletClientCache;
    walletClientCache = deps.walletClient ?? getWalletClient();
    return walletClientCache;
  };

  const result: ReconcileDuelsResult = {
    scanned: 0,
    acted: [],
    needsManual: [],
    noops: [],
    errors: [],
    dryRun,
  };

  const staleCutoffIso = new Date(nowFn() - staleMs).toISOString();
  let candidates: Duel[];
  try {
    candidates = await selectStaleDuels(supabase, limit, staleCutoffIso);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron reconcile-duels] candidate fetch failed", err);
    result.errors.push({ matchId: "<fetch>", message });
    return result;
  }

  result.scanned = candidates.length;

  for (const duel of candidates) {
    try {
      const challengeId = (duel.onchain_id ?? "") as Hex;
      if (!challengeId || !challengeId.startsWith("0x")) {
        result.errors.push({
          matchId: duel.id,
          message: "no onchain_id; manual review required",
        });
        continue;
      }

      const onChain = await readOnChainStatus(publicClient, challengeId);
      const decision = decideReconcileAction({
        onChainStatus: onChain.status,
        onChainWinner: getAddress(onChain.winner),
        duelStatus: duel.status,
        duelWinnerAddress: duel.winner_address,
        hasBothScores:
          duel.player1_score != null && duel.player2_score != null,
      });

      if (decision.action === "noop-already-reconciled") {
        result.noops.push({ matchId: duel.id });
        continue;
      }
      if (decision.action === "needs-manual") {
        result.needsManual.push({
          matchId: duel.id,
          reason: decision.reason ?? "needs manual review",
        });
        continue;
      }

      if (dryRun) {
        // Log intent only; no execution.
        console.log(
          "[cron reconcile-duels] dry-run intended action",
          {
            matchId: duel.id,
            action: decision.action,
            onChainStatus: onChain.status,
            winnerBackfill: decision.winnerBackfill ?? null,
          },
        );
        result.acted.push({
          matchId: duel.id,
          action: decision.action,
          txHash: null,
        });
        continue;
      }

      const { txHash } = await executeAction({
        duel,
        challengeId,
        decision,
        onChainStatus: onChain.status,
        supabase,
        publicClient,
        walletClient: getWallet(),
      });
      result.acted.push({ matchId: duel.id, action: decision.action, txHash });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.warn("[cron reconcile-duels] row failed", duel.id, err);
      result.errors.push({ matchId: duel.id, message });
    }
  }

  return result;
}
