// ───────────────────────────────────────────────────────────────────────────
// Pure branch selector for the DuelResultCard component.
//
// Lifted out of DuelResultCard.tsx so it can be unit-tested without React
// or React Testing Library. (packages/ui has no RTL setup as of this PR.)
// The component imports it from here; consumers can import either.
// ───────────────────────────────────────────────────────────────────────────

import type { Address } from "viem";

export type DuelResultBranch = "void" | "win" | "loss" | "pending";

export interface DuelResultBranchInput {
  /** v2_duels status. "settled" + winnerAddress=null → Match Voided. */
  status:
    | "queued"
    | "matched"
    | "player1_submitted"
    | "player2_submitted"
    | "settled"
    | "refunded";
  winnerAddress: Address | null;
  viewerAddress: Address | null;
}

/**
 * Choose which result panel to render.
 *
 *   pending — non-terminal status (still settling on-chain)
 *   void    — terminal but no winner (lie-state safety fallback OR
 *             refunded after expiry); reconcile cron runs daily
 *   win     — viewer is the on-chain winner
 *   loss    — terminal, winner is set, viewer is not the winner
 *
 * Address comparisons are checksum-insensitive (lowercase string compare)
 * so a viewer wallet that returns lowercase doesn't get falsely flagged as
 * a non-winner.
 */
export function selectDuelResultBranch(
  input: DuelResultBranchInput,
): DuelResultBranch {
  const { status, winnerAddress, viewerAddress } = input;
  if (status !== "settled" && status !== "refunded") return "pending";
  // Match Voided: terminal status without a winner. Covers two cases:
  //   1. status='settled' AND winnerAddress IS NULL — lie-state, surfaced
  //      by the daily reconcile-duels cron sweep.
  //   2. status='refunded' (cron mark-refunded-from-expired) — expired
  //      challenge, both stakes returned on-chain via expireAccepted().
  if (winnerAddress == null) return "void";
  if (viewerAddress == null) return "loss";
  return winnerAddress.toLowerCase() === viewerAddress.toLowerCase()
    ? "win"
    : "loss";
}
