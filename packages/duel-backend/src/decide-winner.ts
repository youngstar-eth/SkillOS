// ───────────────────────────────────────────────────────────────────────────
// decideWinner — shared winner-selection rule for duels.
//
// Background:
//   Two call sites previously inlined identical winner-selection logic:
//     - settle.ts::decideWinner (the hot path called from /api/duel/submit)
//     - api/admin/reconcile.ts::decideWinnerFromDuel (admin lie-state repair)
//   That duplication is a drift hazard — changing one without the other
//   would silently desync settle outcomes from reconcile outcomes. This
//   module is the single source of truth; both call sites import from here.
//
// Tiebreak rule: EARLIER SUBMISSION WINS.
//
//   On a tied score, the player whose `submitted_at` timestamp is earlier
//   wins. Rationale:
//
//     1. Deterministic. Two callers (settle.ts on score-arrival, reconcile.ts
//        on admin repair) reach the same answer without consulting the chain.
//     2. Contract-compatible. ChallengeEscrow.settle() requires a non-zero
//        winner ∈ {creator, challenger} (contracts/src/ChallengeEscrow.sol
//        L191). There is no on-chain "draw" or "refund both" path for ties;
//        only Expired triggers a dual refund (L226-236, on timeout, not score).
//     3. Operationally simple. Submission timestamp is already stored on
//        v2_duels and was always going to be the cheapest comparator.
//
//   Trade-off acknowledged: this rewards latency advantage on the network
//   path. A "fairer" rule (refund both, or RNG-seed comparison) would
//   require either contract work (Phase 2 v2.2 contract bundle scope) or
//   a more elaborate off-chain protocol. Earlier-submission is the rule
//   we ship for Phase 2 testnet → mainnet readiness.
//
//   Edge cases:
//     - Both timestamps null → Infinity vs Infinity → t1 <= t2 → p1 wins
//       (deterministic but should never occur, since a tied score implies
//        both players submitted scores)
//     - Equal timestamps (millisecond collision) → t1 <= t2 → p1 wins
//        (deterministic; documented for future audit)
// ───────────────────────────────────────────────────────────────────────────

import type { Address } from "viem";
import { getAddress } from "viem";
import type { Duel } from "@skillos/game-types";

function normalizeAddress(raw: string | null | undefined): Address {
  if (!raw) throw new Error("decideWinner.normalizeAddress: empty");
  return getAddress(raw);
}

/**
 * Pick the winner between p1 (creator) and p2 (challenger).
 *
 * Rules, in order:
 *   1. Higher score wins.
 *   2. Tie → earlier submitted_at wins (see module header for rationale).
 *   3. Single-submitter case: the one who submitted wins (other walked over).
 *
 * Throws if neither player submitted (callers must gate on
 * `player1_score != null && player2_score != null` before invoking the
 * normal-settle path; walkover is the only legal one-sided settlement).
 *
 * Throws if player2_address is unset (challenge not yet matched).
 */
export function decideWinner(duel: Duel): Address {
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
