// ───────────────────────────────────────────────────────────────────────────
// @skillos/sp-engine — public types.
//
// The engine itself is intentionally small: one pure award function, one
// level lookup, plus the constant tables that drive both. Shared by
// duel-backend hooks and the one-shot backfill script so the formula
// lives in exactly one place.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Three-tier plausibility verdict. Mirrors `Verdict` in @skillos/ai-coach;
 * we duplicate the type here to keep sp-engine free of any AI-pipeline
 * dependency (it's a pure-math package).
 */
export type Verdict = "plausible" | "suspicious" | "implausible";

/**
 * All SP-earning events. Discriminated union so TypeScript can enforce
 * the right fields per kind at call sites.
 *
 * - duel_win / duel_loss — participation + outcome on a duel
 * - solo_submit         — any tournament solo submission (free or paid)
 * - tournament_rank_bonus — awarded at settle for top-50 rank placement
 *
 * Note: the spec holds that paid solo retries award the SAME base (50) as
 * free submits — no "you paid so you earn more" feedback loop. Kept
 * consistent by not discriminating free vs paid at the event level.
 *
 * Verdict doesn't apply to the rank bonus because at tournament settle
 * time implausible entries have already been excluded from the ranking
 * (see cron/tournaments.ts — implausible verdicts flip `excluded=true`),
 * so a rank bonus is by construction awarded against plausibility-clean
 * source rows.
 */
export type SPEvent =
  | { kind: "duel_win"; verdict: Verdict }
  | { kind: "duel_loss"; verdict: Verdict }
  | { kind: "solo_submit"; verdict: Verdict }
  | { kind: "tournament_rank_bonus"; rank: number };
