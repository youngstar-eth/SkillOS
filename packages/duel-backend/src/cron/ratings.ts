// ───────────────────────────────────────────────────────────────────────────
// Post-settle Glicko-2 rating update cron.
//
// X23.2 per docs/sprints/x23-glicko-2/SPEC.md §D. Decoupled from the
// settle cron: this runs on its own schedule, scans v2_tournaments for
// `settled_at IS NOT NULL AND ratings_updated_at IS NULL`, and updates
// (wallet, game, class) ratings using the @skillos/glicko-rating
// wrapper. No on-chain writes — pure off-chain DB sweep.
//
// Per-tournament flow:
//   1. Pull participants from v2_tournament_entries (duel-mode) and
//      v2_tournament_solo_runs (solo-mode). Excluded rows skipped.
//      A player appearing in both tables is collapsed to best score.
//   2. Group by class_tag — strict same-class only per SPEC §J.4 lock
//      (no cross-class updates). Mixed-declared tournaments produce
//      two parallel cohort updates.
//   3. For each cohort:
//      - cohort.length > MAX_COHORT_SIZE: log + skip, stamp tournament
//        so we don't retry (Phase 3 pruning placeholder per SPEC §D.5).
//      - cohort.length < 2: no opponents, skip cohort but still stamp.
//      - else: read pre-period ratings, round-robin pairwise compute,
//        write history rows + upsert ratings.
//   4. Stamp v2_tournaments.ratings_updated_at — idempotency flip.
//
// Failure isolation: per-tournament errors don't abort the sweep.
// The lock is the same v2_cron_runs primitive used by settle, with
// cron_name="update-ratings".
// ───────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_RATING,
  updateRating,
  type MatchOutcome,
  type RatingState,
} from "@skillos/glicko-rating";
import { getSupabaseService } from "@skillos/lib-shared";
import {
  acquireCronLock,
  currentMinuteWindow,
  releaseCronLock,
} from "./run-lock";

// Phase 3 pruning threshold per SPEC §D.5. Today: log + skip cohort.
const MAX_COHORT_SIZE = 200;

export interface UpdateRatingsResult {
  tournamentsProcessed: number;
  ratingsUpdated: number;
  cohortsPruned: number;
  errors: Array<{ tournamentId: string; message: string }>;
  lockSkipped?: boolean;
  lockReason?: string;
}

/**
 * Optional dependency overrides for runUpdateRatings. Mirrors the
 * SettleDependencies pattern in cron/tournaments.ts so tests can
 * inject a Supabase mock.
 */
export interface UpdateRatingsDependencies {
  supabase?: ReturnType<typeof getSupabaseService>;
}

type SupabaseLike = ReturnType<typeof getSupabaseService>;

interface PendingTournamentRow {
  id: string;
  game: string;
}

interface EntryRow {
  player_address: string;
  class_tag: string;
  best_score: number;
  excluded: boolean;
}

interface SoloRunRow {
  player_address: string;
  class_tag: string;
  score: number;
  excluded: boolean;
}

interface Participant {
  player_address: string;
  class_tag: string;
  score: number;
}

interface ExistingRatingRow extends RatingState {
  wallet: string;
  updates_count: number;
}

interface PerTournamentSummary {
  ratingsUpdated: number;
  cohortsPruned: number;
}

export async function runUpdateRatings(
  deps: UpdateRatingsDependencies = {},
): Promise<UpdateRatingsResult> {
  const result: UpdateRatingsResult = {
    tournamentsProcessed: 0,
    ratingsUpdated: 0,
    cohortsPruned: 0,
    errors: [],
  };

  const supabase = deps.supabase ?? getSupabaseService();
  const cronName = "update-ratings";
  const windowStart = currentMinuteWindow();
  const lock = await acquireCronLock({ supabase, cronName, windowStart });
  if (!lock.acquired) {
    return {
      ...result,
      lockSkipped: true,
      lockReason: lock.reason ?? "lock not acquired",
    };
  }

  try {
    const { data: pending, error } = await supabase
      .from("v2_tournaments")
      .select("id, game")
      .not("settled_at", "is", null)
      .is("ratings_updated_at", null)
      .order("settled_at", { ascending: true });

    if (error) {
      throw new Error(`pending fetch: ${error.message}`);
    }

    for (const t of (pending as PendingTournamentRow[] | null) ?? []) {
      try {
        const summary = await updateOneTournament(supabase, t);
        result.tournamentsProcessed += 1;
        result.ratingsUpdated += summary.ratingsUpdated;
        result.cohortsPruned += summary.cohortsPruned;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ tournamentId: t.id, message });
      }
    }
  } finally {
    await releaseCronLock({
      supabase,
      cronName,
      windowStart,
      summary: {
        tournamentsProcessed: result.tournamentsProcessed,
        ratingsUpdated: result.ratingsUpdated,
        cohortsPruned: result.cohortsPruned,
        errors: result.errors.length,
      },
    });
  }

  return result;
}

async function updateOneTournament(
  supabase: SupabaseLike,
  tournament: PendingTournamentRow,
): Promise<PerTournamentSummary> {
  const summary: PerTournamentSummary = {
    ratingsUpdated: 0,
    cohortsPruned: 0,
  };

  const { data: entries, error: entriesErr } = await supabase
    .from("v2_tournament_entries")
    .select("player_address, class_tag, best_score, excluded")
    .eq("tournament_id", tournament.id);
  if (entriesErr) throw new Error(`entries fetch: ${entriesErr.message}`);

  const { data: soloRuns, error: soloErr } = await supabase
    .from("v2_tournament_solo_runs")
    .select("player_address, class_tag, score, excluded")
    .eq("tournament_id", tournament.id);
  if (soloErr) throw new Error(`solo_runs fetch: ${soloErr.message}`);

  // Collapse to best score per (player). Solo runs can produce multiple
  // rows per player for paid retries; entries dedupes by
  // (tournament_id, player_address). Either table can be authoritative
  // for a given tournament, so we union them and take the max.
  const bestByPlayer = new Map<string, Participant>();

  const consider = (
    address: string,
    classTag: string,
    score: number,
    excluded: boolean,
  ): void => {
    if (excluded) return;
    const existing = bestByPlayer.get(address);
    if (!existing || score > existing.score) {
      bestByPlayer.set(address, {
        player_address: address,
        class_tag: classTag,
        score,
      });
    }
  };

  for (const e of (entries as EntryRow[] | null) ?? []) {
    consider(e.player_address, e.class_tag, e.best_score, e.excluded);
  }
  for (const s of (soloRuns as SoloRunRow[] | null) ?? []) {
    consider(s.player_address, s.class_tag, s.score, s.excluded);
  }

  // Group by class_tag — strict same-class only per SPEC §J.4 default.
  const cohorts = new Map<string, Participant[]>();
  for (const p of bestByPlayer.values()) {
    const arr = cohorts.get(p.class_tag) ?? [];
    arr.push(p);
    cohorts.set(p.class_tag, arr);
  }

  for (const [classTag, cohort] of cohorts) {
    if (cohort.length > MAX_COHORT_SIZE) {
      console.log(
        `[ratings.cohort.pruned] tournament=${tournament.id} game=${tournament.game} class=${classTag} cohort_size=${cohort.length}`,
      );
      summary.cohortsPruned += 1;
      continue;
    }
    if (cohort.length < 2) continue;

    const wallets = cohort.map((p) => p.player_address);
    const { data: existingRatings, error: ratingsErr } = await supabase
      .from("v2_player_ratings")
      .select("wallet, rating, rd, volatility, updates_count")
      .in("wallet", wallets)
      .eq("game", tournament.game)
      .eq("class", classTag);
    if (ratingsErr) throw new Error(`ratings fetch: ${ratingsErr.message}`);

    const stateByWallet = new Map<string, ExistingRatingRow>();
    for (const r of (existingRatings as ExistingRatingRow[] | null) ?? []) {
      stateByWallet.set(r.wallet, r);
    }

    const recordedAt = new Date().toISOString();

    // Compute first (all using pre-period state), then write. Avoids
    // a partial-write window where some players see post-period state
    // as opponents within the same cohort.
    const computed: Array<{
      wallet: string;
      before: RatingState;
      after: RatingState;
      previousUpdatesCount: number;
      matchesCount: number;
    }> = [];

    for (const player of cohort) {
      const current: ExistingRatingRow = stateByWallet.get(
        player.player_address,
      ) ?? {
        wallet: player.player_address,
        rating: DEFAULT_RATING.rating,
        rd: DEFAULT_RATING.rd,
        volatility: DEFAULT_RATING.volatility,
        updates_count: 0,
      };

      const matches: MatchOutcome[] = cohort
        .filter((o) => o.player_address !== player.player_address)
        .map((opponent) => {
          const oppState =
            stateByWallet.get(opponent.player_address) ?? DEFAULT_RATING;
          let score: 0 | 0.5 | 1;
          if (player.score > opponent.score) score = 1;
          else if (player.score < opponent.score) score = 0;
          else score = 0.5;
          return {
            opponent: {
              rating: oppState.rating,
              rd: oppState.rd,
              volatility: oppState.volatility,
            },
            score,
          };
        });

      const next = updateRating(
        {
          rating: current.rating,
          rd: current.rd,
          volatility: current.volatility,
        },
        matches,
      );

      computed.push({
        wallet: player.player_address,
        before: {
          rating: current.rating,
          rd: current.rd,
          volatility: current.volatility,
        },
        after: next,
        previousUpdatesCount: current.updates_count,
        matchesCount: matches.length,
      });
    }

    const historyRows = computed.map((c) => ({
      wallet: c.wallet,
      game: tournament.game,
      class: classTag,
      rating_before: c.before.rating,
      rating_after: c.after.rating,
      rd_before: c.before.rd,
      rd_after: c.after.rd,
      volatility_before: c.before.volatility,
      volatility_after: c.after.volatility,
      tournament_id: tournament.id,
      matches_count: c.matchesCount,
      recorded_at: recordedAt,
    }));

    const upsertRows = computed.map((c) => ({
      wallet: c.wallet,
      game: tournament.game,
      class: classTag,
      rating: c.after.rating,
      rd: c.after.rd,
      volatility: c.after.volatility,
      updates_count: c.previousUpdatesCount + 1,
      updated_at: recordedAt,
    }));

    const { error: histErr } = await supabase
      .from("v2_player_rating_history")
      .insert(historyRows);
    if (histErr) throw new Error(`history insert: ${histErr.message}`);

    const { error: upsertErr } = await supabase
      .from("v2_player_ratings")
      .upsert(upsertRows, { onConflict: "wallet,game,class" });
    if (upsertErr) throw new Error(`ratings upsert: ${upsertErr.message}`);

    summary.ratingsUpdated += upsertRows.length;
  }

  // Stamp idempotency flag last — happens even when no cohort produced
  // updates (single-participant cohorts, all-excluded, etc.) so the
  // cron doesn't keep retrying this tournament forever.
  const { error: stampErr } = await supabase
    .from("v2_tournaments")
    .update({ ratings_updated_at: new Date().toISOString() })
    .eq("id", tournament.id);
  if (stampErr) throw new Error(`stamp ratings_updated_at: ${stampErr.message}`);

  return summary;
}
