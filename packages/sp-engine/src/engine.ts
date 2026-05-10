// ───────────────────────────────────────────────────────────────────────────
// @skillos/sp-engine — pure award formula + level lookup.
//
// Zero DB access, zero side effects. Called by:
//   1. duel-backend settle hook (winner + loser on duel resolution)
//   2. duel-backend tournament-settle cron (rank bonus for top 50)
//   3. duel-backend solo submit (base award after plausibility resolves)
//   4. scripts/backfill-sp.ts (recompute-from-history one-shot)
//
// Keep it pure so both the runtime and the backfill emit identical numbers
// for the same inputs.
// ───────────────────────────────────────────────────────────────────────────

import type { SPEvent, Verdict } from "./types";

/** Base points by event kind. */
export const BASE_SP = {
  duelWin: 100,
  duelLoss: 20,
  soloSubmit: 50,
} as const;

/**
 * Plausibility → multiplier. "implausible" zeroes the award rather than
 * going negative (we don't want SP loss rug-pulls on the frontend).
 */
export const MULTIPLIER: Record<Verdict, number> = {
  plausible: 1.0,
  suspicious: 0.5,
  implausible: 0.0,
};

/**
 * Rank bonus for tournament settlement: top 50 only, linear decay.
 * Rank 1 → 100, rank 2 → 98, ..., rank 50 → 2, rank 51+ → 0.
 */
function tournamentRankBonus(rank: number): number {
  if (rank < 1 || rank > 50) return 0;
  return (51 - rank) * 2;
}

/**
 * Compute the integer SP delta for a single event. Non-negative — the
 * "implausible" multiplier yields 0, not a negative number. `Math.round`
 * is applied at the multiplier step so (20 * 0.5) stays an integer.
 */
export function awardSP(event: SPEvent): number {
  switch (event.kind) {
    case "duel_win":
      return Math.round(BASE_SP.duelWin * MULTIPLIER[event.verdict]);
    case "duel_loss":
      return Math.round(BASE_SP.duelLoss * MULTIPLIER[event.verdict]);
    case "solo_submit":
      return Math.round(BASE_SP.soloSubmit * MULTIPLIER[event.verdict]);
    case "tournament_rank_bonus":
      return tournamentRankBonus(event.rank);
  }
}

// ─── Level thresholds ─────────────────────────────────────────────────────
//
// Exponential-ish curve: gaps widen through L5 then smooth to a 10k cadence
// through L10. L10 caps at 50,000 — beyond that the level stays 10 until
// we ship a prestige/ascension system post-submission.
export const LEVEL_THRESHOLDS: readonly { level: number; minSP: number }[] = [
  { level: 1, minSP: 0 },
  { level: 2, minSP: 500 },
  { level: 3, minSP: 1_500 },
  { level: 4, minSP: 3_500 },
  { level: 5, minSP: 7_500 },
  { level: 6, minSP: 15_000 },
  { level: 7, minSP: 25_000 },
  { level: 8, minSP: 35_000 },
  { level: 9, minSP: 45_000 },
  { level: 10, minSP: 50_000 },
];

/**
 * Return the current level for a given `totalSP`. Linear scan through the
 * 10-entry table — binary search is pointless at this size and the clarity
 * wins over the micro-optimization.
 */
export function levelForSP(totalSP: number): number {
  let current = 1;
  for (const t of LEVEL_THRESHOLDS) {
    if (totalSP >= t.minSP) current = t.level;
  }
  return current;
}

/**
 * Progress toward the next level. Returns the `minSP` of the next level (or
 * `null` at L10, the current cap), the SP still needed, and the current
 * level's `minSP` so the UI can render an in-level progress bar without
 * re-importing LEVEL_THRESHOLDS.
 *
 * Consumers typically render:
 *   (totalSP - currentLevelMinSP) / (next - currentLevelMinSP)
 */
export function spForNextLevel(totalSP: number): {
  next: number | null;
  remaining: number;
  currentLevelMinSP: number;
} {
  const level = levelForSP(totalSP);
  const currentLevelMinSP = LEVEL_THRESHOLDS[level - 1].minSP;
  if (level >= LEVEL_THRESHOLDS.length) {
    return { next: null, remaining: 0, currentLevelMinSP };
  }
  const next = LEVEL_THRESHOLDS[level].minSP;
  return { next, remaining: Math.max(0, next - totalSP), currentLevelMinSP };
}

/**
 * Breakdown for the SPEarnedCard — exposes base and multiplier alongside the
 * rounded delta so the UI can render "base 50 × 1.0 plausible → +50 SP"
 * without duplicating the switch-by-kind from `awardSP`.
 *
 * For `tournament_rank_bonus` there is no multiplier concept (implausible
 * entries are excluded from the ranking upstream at settle time), so
 * `base` equals the delta and `multiplier` is always 1.
 */
export function awardSPBreakdown(event: SPEvent): {
  sp: number;
  base: number;
  multiplier: number;
} {
  switch (event.kind) {
    case "duel_win":
      return {
        base: BASE_SP.duelWin,
        multiplier: MULTIPLIER[event.verdict],
        sp: Math.round(BASE_SP.duelWin * MULTIPLIER[event.verdict]),
      };
    case "duel_loss":
      return {
        base: BASE_SP.duelLoss,
        multiplier: MULTIPLIER[event.verdict],
        sp: Math.round(BASE_SP.duelLoss * MULTIPLIER[event.verdict]),
      };
    case "solo_submit":
      return {
        base: BASE_SP.soloSubmit,
        multiplier: MULTIPLIER[event.verdict],
        sp: Math.round(BASE_SP.soloSubmit * MULTIPLIER[event.verdict]),
      };
    case "tournament_rank_bonus": {
      const sp = tournamentRankBonus(event.rank);
      return { base: sp, multiplier: 1, sp };
    }
  }
}
