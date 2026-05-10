// ───────────────────────────────────────────────────────────────────────────
// Settlement orchestration.
//
// Two entry points, both server-only:
//
//   triggerSettle(matchId)
//     Called from /api/duel/submit when the second player's score lands.
//     Picks the winner (higher score; tie → earlier submitted_at),
//     signs an attestation, broadcasts settle() on-chain, and flips the
//     DB row to status='settled'. Idempotent: if the row is already
//     settled, returns the stored tx hash.
//
//   checkAndTriggerWalkover(matchId)
//     Polled from /api/duel/status on each read. If exactly one player
//     has submitted and more than (PLAY_WINDOW_MS + SUBMIT_GRACE_MS)
//     has elapsed since matched_at, signs a walkover attestation and
//     broadcasts walkover(). Keeps a stuck opponent from leaving the
//     submitter in permanent "waiting..." — critical for demo reliability.
//
// Both functions are idempotent and safe to race: the DB status guard
// drops concurrent callers on the floor.
// ───────────────────────────────────────────────────────────────────────────

import type { Address, Hex } from "viem";
import { getAddress } from "viem";
import {
  CHALLENGE_ESCROW_ABI,
  CHALLENGE_ESCROW_ADDRESS,
  PLAY_WINDOW_MS,
  SUBMIT_GRACE_MS,
} from "@skillos/contracts";
import { checkPlausibility, type GameType } from "@skillos/ai-coach";
import type { Verdict } from "@skillos/sp-engine";
import { waitUntil } from "@vercel/functions";
import { applySPAward } from "./sp/award";
import type { Duel } from "@skillos/game-types";
import {
  bytes32FromUuid,
  getPublicClient,
  getSupabaseService,
  getWalletClient,
  signSettleAttestation,
  signWalkoverAttestation,
} from "@skillos/lib-shared";
import {
  readChallengeGuard,
  type SettleGuardReason,
} from "./settle-guard";
import { decideWinner } from "./decide-winner";

export interface SettleResult {
  settled: boolean;
  winner: Address | null;
  settleTxHash: Hex | null;
  /**
   * Outcome kind:
   *   "settle"               — happy-path settle broadcast this call
   *   "walkover"             — walkover broadcast this call
   *   "noop"                 — nothing to do yet (scores still outstanding)
   *   "skip-already-settled" — DB or chain already reflects a prior settle
   *   "cannot_settle"        — on-chain guard rejected (see guardReason);
   *                            DB NOT mutated; admin reconcile required
   */
  kind:
    | "settle"
    | "walkover"
    | "noop"
    | "skip-already-settled"
    | "cannot_settle";
  /** Populated only when kind === "cannot_settle". */
  guardReason?: SettleGuardReason;
}

// ─── helpers ───────────────────────────────────────────────────────────────

async function readDuel(matchId: string): Promise<Duel | null> {
  const { data, error } = await getSupabaseService()
    .from("v2_duels")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw new Error(`readDuel: ${error.message}`);
  return (data as Duel | null) ?? null;
}

function normalizeAddress(raw: string | null | undefined): Address {
  if (!raw) throw new Error("normalizeAddress: empty");
  return getAddress(raw);
}

function challengeIdFor(duel: Duel): Hex {
  return (duel.onchain_id ?? bytes32FromUuid(duel.id)) as Hex;
}

/**
 * Claim the row for settlement under a compare-and-swap. Only one concurrent
 * caller wins; the rest see `null` and bail.
 *
 * Accepts any of the submitted states so the loser of a race still releases
 * the row cleanly; the caller re-reads to confirm final state.
 */
async function claimForSettle(matchId: string): Promise<Duel | null> {
  const { data, error } = await getSupabaseService()
    .from("v2_duels")
    .update({ status: "settled" })
    .eq("id", matchId)
    .in("status", ["player1_submitted", "player2_submitted"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`claimForSettle: ${error.message}`);
  return (data as Duel | null) ?? null;
}

// ─── anti-cheat fire-and-forget hook ──────────────────────────────────────

const PLAUSIBILITY_TIMEOUT_MS = 10_000;

/**
 * Fire-and-forget plausibility audit. Must NEVER affect the settle path:
 *   - caller does not await this function (return type is void, not Promise)
 *   - no thrown error escapes; all failures are logged and swallowed
 *   - a 10s timeout ensures a hung Haiku call cannot stall background work
 *     indefinitely — settle's own return already fired by then
 *   - registered with Vercel `waitUntil` so the serverless container is kept
 *     alive past the response until this work completes. Historically this
 *     has worked in production because settle's own receipt-await keeps the
 *     container alive long enough naturally, but we don't want to rely on
 *     that coincidence — the solo submit path (~500ms response) revealed it
 *     as a real risk, so we apply the same discipline here.
 *
 * On success, writes the full PlausibilityResponse to
 * v2_duels.plausibility_check. On any failure (Haiku down, timeout, DB
 * write fails), the column stays NULL and the public endpoint maps that
 * to { status: "pending" } — graceful degradation.
 */
function firePlausibilityCheckAsync(input: {
  duelId: string;
  gameType: GameType;
  winnerScore: number;
  loserScore: number;
  durationSeconds: number;
  /**
   * When provided, chains Skill-Point awards for both duelists onto the
   * same waitUntil lifetime as the plausibility check. The verdict used
   * for the multiplier is whatever the Haiku audit returned; on any
   * plausibility failure (timeout, db-write error) the SP path defaults
   * to `plausible` — same optimistic convention the settle cron uses.
   */
  sp?: {
    winnerAddress: Address;
    /**
     * Loser address is optional — omitted on walkover because the loser
     * never actually played, so the 20-SP "participation" bucket doesn't
     * apply and we skip the duels_lost counter too. In a normal settle
     * where both players submitted, always pass it.
     */
    loserAddress?: Address;
  };
}): void {
  const checkPromise = checkPlausibility({
    duelId: input.duelId,
    gameType: input.gameType,
    winnerScore: input.winnerScore,
    loserScore: input.loserScore,
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
          .from("v2_duels")
          .update({ plausibility_check: result })
          .eq("id", input.duelId);
      } catch (err) {
        console.warn("[anticheat] db write failed", input.duelId, err);
      }
      return result.verdict;
    })
    .catch((err): Verdict => {
      console.warn("[anticheat] check failed", input.duelId, err);
      // Default to "plausible" so a Haiku outage doesn't strip SP from
      // legitimate winners — matches the cron-settle "NULL = optimistic"
      // contract.
      return "plausible";
    })
    .then(async (verdict) => {
      if (!input.sp) return;
      try {
        await applySPAward({
          userAddress: input.sp.winnerAddress,
          event: { kind: "duel_win", verdict },
          counterDelta: { duelsWon: 1 },
        });
        if (input.sp.loserAddress) {
          await applySPAward({
            userAddress: input.sp.loserAddress,
            event: { kind: "duel_loss", verdict },
            counterDelta: { duelsLost: 1 },
          });
        }
      } catch (err) {
        console.warn("[sp-award] duel-settle failed", input.duelId, err);
      }
    });

  // Hand the job to Vercel's container-lifetime manager so it survives past
  // response-send. No-op in local dev (`waitUntil` returns undefined).
  waitUntil(job);
  // Deliberately no return value — fire-and-forget from the caller's POV.
}

// ─── public: triggerSettle ─────────────────────────────────────────────────

export async function triggerSettle(
  matchId: string,
  opts?: { gameType?: GameType },
): Promise<SettleResult> {
  const current = await readDuel(matchId);
  if (!current) throw new Error(`triggerSettle: match ${matchId} not found`);

  if (current.status === "settled") {
    return {
      settled: true,
      winner: current.winner_address
        ? normalizeAddress(current.winner_address)
        : null,
      settleTxHash: (current.settle_tx_hash as Hex | null) ?? null,
      kind: "skip-already-settled",
    };
  }
  if (current.player1_score == null || current.player2_score == null) {
    // Don't sign yet — one player is still outstanding. The walkover
    // path handles abandonment; happy-path settle fires only when both
    // scores exist.
    return { settled: false, winner: null, settleTxHash: null, kind: "noop" };
  }

  // Pre-check on-chain state BEFORE claiming the DB row. If the challenge
  // is not Accepted, settle() would revert and leave the DB in "lie state"
  // (status='settled' ∧ winner_address IS NULL). See settle-guard.ts.
  const guard = await readChallengeGuard(
    getPublicClient(),
    challengeIdFor(current),
  );
  if (!guard.ok) {
    console.warn(
      "[settle] on-chain guard rejected; skipping claim to preserve DB state",
      { matchId, reason: guard.reason, onChainStatus: guard.status },
    );
    return {
      settled: false,
      winner: null,
      settleTxHash: null,
      kind: "cannot_settle",
      guardReason: guard.reason,
    };
  }

  const claimed = await claimForSettle(matchId);
  if (!claimed) {
    // Lost the race. Re-read to surface the winning caller's tx hash.
    const after = await readDuel(matchId);
    return {
      settled: after?.status === "settled",
      winner: after?.winner_address
        ? normalizeAddress(after.winner_address)
        : null,
      settleTxHash: (after?.settle_tx_hash as Hex | null) ?? null,
      kind: "skip-already-settled",
    };
  }

  const challengeId = challengeIdFor(claimed);
  const winner = decideWinner(claimed);
  const creatorScore = BigInt(claimed.player1_score ?? 0);
  const challengerScore = BigInt(claimed.player2_score ?? 0);

  const signature = await signSettleAttestation({
    challengeId,
    winner,
    creatorScore,
    challengerScore,
  });

  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    address: CHALLENGE_ESCROW_ADDRESS,
    abi: CHALLENGE_ESCROW_ABI,
    functionName: "settle",
    args: [challengeId, winner, creatorScore, challengerScore, signature],
    account: walletClient.account ?? null,
    chain: walletClient.chain,
  });

  // Wait for inclusion so the DB row's settle_tx_hash is one the user can
  // click through to Basescan without racing propagation.
  await getPublicClient().waitForTransactionReceipt({ hash, timeout: 60_000 });

  await getSupabaseService()
    .from("v2_duels")
    .update({
      winner_address: winner,
      settle_tx_hash: hash,
      settled_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  // Fire-and-forget anti-cheat audit. No await, no throw — see
  // firePlausibilityCheckAsync for the error-containment contract.
  // Skipped when caller didn't provide gameType (callers that have not
  // been updated to flow gameType through remain backward-compatible).
  if (opts?.gameType && claimed.matched_at) {
    const durationSeconds = Math.max(
      0,
      Math.round(
        (Date.now() - new Date(claimed.matched_at).getTime()) / 1000,
      ),
    );
    const winnerIsP1 =
      winner === normalizeAddress(claimed.player1_address);
    const loser = winnerIsP1
      ? (claimed.player2_address
          ? normalizeAddress(claimed.player2_address)
          : null)
      : normalizeAddress(claimed.player1_address);
    firePlausibilityCheckAsync({
      duelId: matchId,
      gameType: opts.gameType,
      winnerScore: winnerIsP1
        ? (claimed.player1_score ?? 0)
        : (claimed.player2_score ?? 0),
      loserScore: winnerIsP1
        ? (claimed.player2_score ?? 0)
        : (claimed.player1_score ?? 0),
      durationSeconds,
      sp: loser ? { winnerAddress: winner, loserAddress: loser } : { winnerAddress: winner },
    });
  }

  return { settled: true, winner, settleTxHash: hash, kind: "settle" };
}

// ─── public: checkAndTriggerWalkover ───────────────────────────────────────

const WALKOVER_THRESHOLD_MS = PLAY_WINDOW_MS + SUBMIT_GRACE_MS;

/**
 * If exactly one player submitted and the play window + grace has elapsed
 * since matched_at, sign a walkover attestation and broadcast walkover().
 * Called from /api/duel/status on every GET (lightweight polling-based
 * trigger — no cron needed).
 *
 * Returns a SettleResult. `kind='walkover'` on success, `'noop'` if
 * nothing to do, `'skip-already-settled'` if we raced another caller.
 */
export async function checkAndTriggerWalkover(
  matchId: string,
  opts?: { gameType?: GameType },
): Promise<SettleResult> {
  const current = await readDuel(matchId);
  if (!current) return { settled: false, winner: null, settleTxHash: null, kind: "noop" };

  if (current.status === "settled") {
    return {
      settled: true,
      winner: current.winner_address
        ? normalizeAddress(current.winner_address)
        : null,
      settleTxHash: (current.settle_tx_hash as Hex | null) ?? null,
      kind: "skip-already-settled",
    };
  }

  // Only one-submit states qualify for walkover.
  if (
    current.status !== "player1_submitted" &&
    current.status !== "player2_submitted"
  ) {
    return { settled: false, winner: null, settleTxHash: null, kind: "noop" };
  }
  if (!current.matched_at) {
    return { settled: false, winner: null, settleTxHash: null, kind: "noop" };
  }

  const elapsed = Date.now() - new Date(current.matched_at).getTime();
  if (elapsed < WALKOVER_THRESHOLD_MS) {
    return { settled: false, winner: null, settleTxHash: null, kind: "noop" };
  }

  // Pre-check on-chain state BEFORE claiming. Same lie-state class of bug
  // as triggerSettle — walkover() also requires Accepted status on-chain.
  const guard = await readChallengeGuard(
    getPublicClient(),
    challengeIdFor(current),
  );
  if (!guard.ok) {
    console.warn(
      "[walkover] on-chain guard rejected; skipping claim to preserve DB state",
      { matchId, reason: guard.reason, onChainStatus: guard.status },
    );
    return {
      settled: false,
      winner: null,
      settleTxHash: null,
      kind: "cannot_settle",
      guardReason: guard.reason,
    };
  }

  // CAS: only proceed if no one else has flipped us past the submitted state.
  const claimed = await claimForSettle(matchId);
  if (!claimed) {
    const after = await readDuel(matchId);
    return {
      settled: after?.status === "settled",
      winner: after?.winner_address
        ? normalizeAddress(after.winner_address)
        : null,
      settleTxHash: (after?.settle_tx_hash as Hex | null) ?? null,
      kind: "skip-already-settled",
    };
  }

  const challengeId = challengeIdFor(claimed);
  // Submitter wins the walkover. Status-derived, so it reflects the
  // exact row we just claimed.
  const winner: Address =
    claimed.status === "player1_submitted" ||
    claimed.player1_score != null
      ? normalizeAddress(claimed.player1_address)
      : normalizeAddress(claimed.player2_address ?? "");

  const signature = await signWalkoverAttestation({ challengeId, winner });

  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    address: CHALLENGE_ESCROW_ADDRESS,
    abi: CHALLENGE_ESCROW_ABI,
    functionName: "walkover",
    args: [challengeId, winner, signature],
    account: walletClient.account ?? null,
    chain: walletClient.chain,
  });

  await getPublicClient().waitForTransactionReceipt({ hash, timeout: 60_000 });

  await getSupabaseService()
    .from("v2_duels")
    .update({
      winner_address: winner,
      settle_tx_hash: hash,
      settled_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  // Fire-and-forget anti-cheat audit. Walkovers still get audited — the
  // submitter's score can be inflated even when the opponent never shows.
  // loserScore falls to 0 naturally via ?? 0 on the null abandoner row.
  if (opts?.gameType && claimed.matched_at) {
    const durationSeconds = Math.max(
      0,
      Math.round(
        (Date.now() - new Date(claimed.matched_at).getTime()) / 1000,
      ),
    );
    const winnerIsP1 =
      winner === normalizeAddress(claimed.player1_address);
    firePlausibilityCheckAsync({
      duelId: matchId,
      gameType: opts.gameType,
      winnerScore: winnerIsP1
        ? (claimed.player1_score ?? 0)
        : (claimed.player2_score ?? 0),
      loserScore: winnerIsP1
        ? (claimed.player2_score ?? 0)
        : (claimed.player1_score ?? 0),
      durationSeconds,
      // Walkover: no loser SP. The abandoner didn't play, so "participated"
      // doesn't apply and duels_lost doesn't get bumped.
      sp: { winnerAddress: winner },
    });
  }

  return { settled: true, winner, settleTxHash: hash, kind: "walkover" };
}
