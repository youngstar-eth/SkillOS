#!/usr/bin/env -S tsx
// ─────────────────────────────────────────────────────────────────────────────
// X23.2 one-shot smoke for runUpdateRatings.
//
// Invokes the cron handler directly against the live Supabase project so
// the founder can verify on-disk schema + glicko math + idempotency
// before flipping on the cron schedule in apps/orchestrator/vercel.json.
//
// What this exercises:
//   - v2_tournaments scan (settled_at + ratings_updated_at filter)
//   - v2_tournament_entries + v2_tournament_solo_runs union per tournament
//   - Class-aware cohort grouping
//   - Glicko-2 round-robin updates via @skillos/glicko-rating
//   - v2_player_ratings upsert + v2_player_rating_history insert
//   - v2_tournaments.ratings_updated_at stamp
//   - v2_cron_runs lock acquire/release
//
// What this does NOT exercise:
//   - Vercel cron route auth wrapper (apps/orchestrator/.../route.ts)
//
// Usage (against prod Supabase):
//   NEXT_PUBLIC_SUPABASE_URL=https://clizuqvtkekzxiflbsyr.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/x23-2-ratings-smoke.ts
//
// To re-run idempotency check, run twice — second invocation should
// report tournamentsProcessed: 0 (or just the count of newly-settled
// tournaments since the first run).
// ─────────────────────────────────────────────────────────────────────────────

import { runUpdateRatings } from "@skillos/duel-backend";

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.",
    );
    process.exit(1);
  }

  console.log("[x23-2-smoke] invoking runUpdateRatings against live DB ...");
  const result = await runUpdateRatings();
  console.log("[x23-2-smoke] result:");
  console.log(JSON.stringify(result, null, 2));

  if (result.lockSkipped) {
    console.log(
      "\n[x23-2-smoke] LOCK SKIPPED — another cron run holds the window. " +
        "This is the expected idempotency behavior when re-running within " +
        "the same minute. Wait 60s and retry to exercise the full path.",
    );
    return;
  }

  console.log(
    `\n[x23-2-smoke] SUMMARY: ${result.tournamentsProcessed} tournaments processed, ` +
      `${result.ratingsUpdated} rating writes, ${result.cohortsPruned} cohorts pruned, ` +
      `${result.errors.length} errors.`,
  );

  if (result.errors.length > 0) {
    console.error("\n[x23-2-smoke] ERRORS:");
    for (const err of result.errors) {
      console.error(`  tournament=${err.tournamentId}: ${err.message}`);
    }
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("[x23-2-smoke] fatal:", err);
  process.exit(1);
});
