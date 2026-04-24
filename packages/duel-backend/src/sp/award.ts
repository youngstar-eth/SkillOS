// ───────────────────────────────────────────────────────────────────────────
// DB-aware wrapper around the pure @skillbase/sp-engine.
//
// sp-engine stays framework-free and side-effect-free — this module holds
// the Supabase read + UPSERT so hooks can fire-and-forget an SP award with
// one call. Callers:
//
//   1. settle.ts (duel settle)               — winner + loser awards
//   2. cron/tournaments.ts (tournament settle) — rank bonus per top-50 entry
//   3. api/tournaments/solo.ts (solo submit)   — submitter base award,
//      chained onto the plausibility waitUntil Promise so the multiplier
//      reflects the actual verdict when it lands.
//
// Concurrency note: this is a read-then-write helper, NOT a CAS. Two
// concurrent awards to the same user race, and the later write wins. For
// Phase-1 we accept this — per-user event frequency is orders of
// magnitude below "simultaneous" (60s cooldown on solo, one-duel-at-a-time
// UX on duel). If leaderboard correctness under contention ever matters,
// lift this to a stored proc with a serializable transaction.
// ───────────────────────────────────────────────────────────────────────────

import { awardSP, levelForSP, type SPEvent } from "@skillbase/sp-engine";
import { getSupabaseService, parseAddress } from "@skillbase/lib-shared";

export interface SPAwardInput {
  /**
   * User's wallet address. Any format accepted (checksummed, lowercase,
   * mixed) — normalized to EIP-55 checksummed inside before the DB touch
   * so v2_user_stats keys match the rest of the schema's address columns.
   */
  userAddress: string;
  /** The SP-earning event (see @skillbase/sp-engine types). */
  event: SPEvent;
  /**
   * Optional counter increments to commit alongside the SP delta. These
   * are product-level counters (duels_won, tournaments_participated, etc.)
   * that don't affect SP but live on the same row for leaderboard reads.
   */
  counterDelta?: {
    duelsWon?: number;
    duelsLost?: number;
    tournamentsParticipated?: number;
    tournamentsWon?: number;
  };
}

export interface SPAwardResult {
  /** SP added by this event. Zero for implausible verdicts. */
  delta: number;
  /** Row's total_sp after this write. */
  newTotal: number;
  /** Row's current_level after this write. */
  newLevel: number;
}

/**
 * Apply one SP award + counter update to v2_user_stats. Upserts on
 * user_address. No-op on unparseable addresses (logs + returns zero
 * delta) rather than throwing — hooks are typically fire-and-forget and
 * a bad address shouldn't take down the settle/submit response.
 */
export async function applySPAward(
  input: SPAwardInput,
): Promise<SPAwardResult> {
  const addr = parseAddress(input.userAddress);
  if (!addr) {
    console.warn("[sp-award] unparseable address, skipping", input.userAddress);
    return { delta: 0, newTotal: 0, newLevel: 1 };
  }

  const delta = awardSP(input.event);
  const supabase = getSupabaseService();

  // Read current row (if any). Service-role key bypasses RLS.
  const { data: row, error: readErr } = await supabase
    .from("v2_user_stats")
    .select(
      "total_sp,duels_won,duels_lost,tournaments_participated,tournaments_won",
    )
    .eq("user_address", addr)
    .maybeSingle();
  if (readErr) {
    console.error("[sp-award] db read failed", addr, readErr);
    return { delta: 0, newTotal: 0, newLevel: 1 };
  }

  const prev = row ?? {
    total_sp: 0,
    duels_won: 0,
    duels_lost: 0,
    tournaments_participated: 0,
    tournaments_won: 0,
  };

  const c = input.counterDelta ?? {};
  const nextTotal = prev.total_sp + delta;
  const nextLevel = levelForSP(nextTotal);

  const { error: writeErr } = await supabase.from("v2_user_stats").upsert(
    {
      user_address: addr,
      total_sp: nextTotal,
      current_level: nextLevel,
      duels_won: prev.duels_won + (c.duelsWon ?? 0),
      duels_lost: prev.duels_lost + (c.duelsLost ?? 0),
      tournaments_participated:
        prev.tournaments_participated + (c.tournamentsParticipated ?? 0),
      tournaments_won: prev.tournaments_won + (c.tournamentsWon ?? 0),
      last_active_at: new Date().toISOString(),
    },
    { onConflict: "user_address" },
  );
  if (writeErr) {
    console.error("[sp-award] upsert failed", addr, writeErr);
    return { delta: 0, newTotal: prev.total_sp, newLevel: levelForSP(prev.total_sp) };
  }

  return { delta, newTotal: nextTotal, newLevel: nextLevel };
}
