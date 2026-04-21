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
} from "@skillbase/contracts";
import type { Duel } from "@skillbase/game-types";
import {
  bytes32FromUuid,
  getPublicClient,
  getSupabaseService,
  getWalletClient,
  signSettleAttestation,
  signWalkoverAttestation,
} from "@skillbase/lib-shared";

export interface SettleResult {
  settled: boolean;
  winner: Address | null;
  settleTxHash: Hex | null;
  /** "settle" | "walkover" | "noop" | "skip-already-settled" */
  kind: "settle" | "walkover" | "noop" | "skip-already-settled";
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

/**
 * Pick winner between p1 (creator) and p2 (challenger).
 * Rules: higher score wins; tie → earlier submitted_at; null-submit loses.
 */
function decideWinner(duel: Duel): Address {
  const p1 = normalizeAddress(duel.player1_address);
  if (!duel.player2_address) {
    throw new Error("decideWinner: player2 not set");
  }
  const p2 = normalizeAddress(duel.player2_address);
  const s1 = duel.player1_score;
  const s2 = duel.player2_score;

  if (s1 == null && s2 == null) {
    throw new Error("decideWinner: neither submitted");
  }
  if (s1 == null) return p2;
  if (s2 == null) return p1;
  if (s1 > s2) return p1;
  if (s2 > s1) return p2;

  // Tie → earlier submitted_at wins.
  const t1 = duel.player1_submitted_at
    ? new Date(duel.player1_submitted_at).getTime()
    : Infinity;
  const t2 = duel.player2_submitted_at
    ? new Date(duel.player2_submitted_at).getTime()
    : Infinity;
  return t1 <= t2 ? p1 : p2;
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

// ─── public: triggerSettle ─────────────────────────────────────────────────

export async function triggerSettle(matchId: string): Promise<SettleResult> {
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

  return { settled: true, winner, settleTxHash: hash, kind: "walkover" };
}
