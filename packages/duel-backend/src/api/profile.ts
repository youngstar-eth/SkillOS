// ───────────────────────────────────────────────────────────────────────────
// Route handler FACTORIES for the SP/profile reads.
//
//   GET /api/profile/[address]   → user stats + last 20 SP-earning events
//   GET /api/leaderboard         → top 100 by total_sp
//
// Data model note: v2_sp_ledger is a post-submission backlog item (see
// migrations/v2_20260424_user_stats.sql). Until it lands, "recent activity"
// is stitched from v2_duels + v2_tournament_solo_runs. Tournament rank
// bonuses are surfaced via the `tournaments_participated` / `tournaments_won`
// counters on v2_user_stats rather than as per-event activity rows — the
// per-row display would require a re-rank of every entry of every
// tournament the user's been in, which isn't worth the query budget for a
// read that runs on every profile view.
//
// Per-app wire-up (apps/<game>/src/app/api/profile/[address]/route.ts):
//   import { createProfileHandler } from "@skillbase/duel-backend";
//   export const runtime = "nodejs";
//   export const GET = createProfileHandler();
//
// Profile + leaderboard are GLOBAL across all 6 Phase-1 apps — the same
// DB rows back both routes regardless of which subdomain the jury visits.
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import {
  getSupabaseService,
  jsonError,
  jsonOk,
  parseAddress,
} from "@skillbase/lib-shared";
import {
  awardSP,
  levelForSP,
  spForNextLevel,
  type SPEvent,
  type Verdict,
} from "@skillbase/sp-engine";

// ─── DTO shapes ─────────────────────────────────────────────────────────────

export interface UserStatsDTO {
  totalSp: number;
  currentLevel: number;
  duelsWon: number;
  duelsLost: number;
  tournamentsParticipated: number;
  tournamentsWon: number;
  lastActiveAt: string;
  createdAt: string;
}

export type ActivityRow =
  | {
      kind: "duel";
      at: string;
      sp: number;
      result: "win" | "loss";
      verdict: Verdict;
      duelId: string;
      opponentAddress: string;
    }
  | {
      kind: "solo";
      at: string;
      sp: number;
      verdict: Verdict;
      runId: string;
      tournamentId: string;
      game: string;
    };

export interface ProfileDTO {
  address: string;
  stats: UserStatsDTO | null;
  progress: {
    next: number | null;
    remaining: number;
    currentLevelMinSP: number;
  };
  activity: ActivityRow[];
}

export interface LeaderboardRowDTO {
  rank: number;
  address: string;
  level: number;
  totalSp: number;
  lastActiveAt: string;
}

// ─── verdict helper ─────────────────────────────────────────────────────────
// Mirrors the nullish-coalescing the backfill uses: a missing verdict is
// treated as "plausible" (common for very early rows written before
// plausibility_check was backfilled). Matches the totals already stored in
// v2_user_stats so the per-row activity adds up to the displayed grand total.

function extractVerdict(
  plausibilityCheck: unknown,
): Verdict {
  const v =
    (plausibilityCheck as { verdict?: Verdict } | null)?.verdict;
  if (v === "plausible" || v === "suspicious" || v === "implausible") return v;
  return "plausible";
}

// ─── GET /api/profile/[address] ─────────────────────────────────────────────

export function createProfileHandler() {
  return async function GET(
    _req: NextRequest,
    ctx: { params: { address: string } },
  ): Promise<Response> {
    const addr = parseAddress(ctx.params.address);
    if (!addr) {
      return jsonError(
        "invalid_address",
        "address must be a 0x-prefixed 20-byte hex",
        400,
      );
    }

    const supabase = getSupabaseService();

    // 1. Stats row. Missing row = user has never earned SP. Render the
    //    page with zero-state copy rather than 404.
    const { data: statsRow, error: statsErr } = await supabase
      .from("v2_user_stats")
      .select(
        "total_sp,current_level,duels_won,duels_lost,tournaments_participated,tournaments_won,last_active_at,created_at",
      )
      .eq("user_address", addr)
      .maybeSingle();
    if (statsErr) return jsonError("db_error", statsErr.message, 500);

    const totalSp = statsRow?.total_sp ?? 0;
    const stats: UserStatsDTO | null = statsRow
      ? {
          totalSp,
          currentLevel: statsRow.current_level,
          duelsWon: statsRow.duels_won,
          duelsLost: statsRow.duels_lost,
          tournamentsParticipated: statsRow.tournaments_participated,
          tournamentsWon: statsRow.tournaments_won,
          lastActiveAt: statsRow.last_active_at,
          createdAt: statsRow.created_at,
        }
      : null;

    // Progress against level curve — computed from totalSp, not stored. Keeps
    // v2_user_stats free of denormalized "remaining" cols that would rot.
    const progress = spForNextLevel(totalSp);

    // 2. Recent duels (as either p1 or p2). `.or()` on two address cols
    //    without a composite index scans both — bounded by LIMIT. With
    //    anon-scale data this is cheap; if it becomes hot, add a
    //    GIN/trigram or a single participant_addresses[] column later.
    const { data: duels, error: duelsErr } = await supabase
      .from("v2_duels")
      .select(
        "id,winner_address,player1_address,player2_address,player1_submitted_at,player2_submitted_at,settled_at,plausibility_check",
      )
      .eq("status", "settled")
      .or(`player1_address.eq.${addr},player2_address.eq.${addr}`)
      .order("settled_at", { ascending: false })
      .limit(10);
    if (duelsErr) return jsonError("db_error", duelsErr.message, 500);

    // 3. Recent solo runs. Joined with v2_tournaments to pull the game
    //    slug for display ("Solo · 2048 · 2h ago").
    const { data: solos, error: solosErr } = await supabase
      .from("v2_tournament_solo_runs")
      .select(
        "id,tournament_id,submitted_at,plausibility_check,excluded,v2_tournaments!inner(game)",
      )
      .eq("player_address", addr)
      .order("submitted_at", { ascending: false })
      .limit(10);
    if (solosErr) return jsonError("db_error", solosErr.message, 500);

    // ─── stitch into ActivityRow[] ──────────────────────────────────────────

    const activity: ActivityRow[] = [];

    for (const d of duels ?? []) {
      if (!d.settled_at || !d.winner_address) continue;
      const verdict = extractVerdict(d.plausibility_check);
      const isWinner =
        d.winner_address.toLowerCase() === addr.toLowerCase();
      const opponent =
        d.player1_address.toLowerCase() === addr.toLowerCase()
          ? d.player2_address
          : d.player1_address;
      if (!opponent) continue;

      // Walkover losers (didn't submit) get no SP — skip them in the activity
      // feed too so the user doesn't see a "+0 loss" row for a match they
      // never played.
      if (!isWinner) {
        const mySubmit =
          d.player1_address.toLowerCase() === addr.toLowerCase()
            ? d.player1_submitted_at
            : d.player2_submitted_at;
        if (!mySubmit) continue;
      }

      const event: SPEvent = isWinner
        ? { kind: "duel_win", verdict }
        : { kind: "duel_loss", verdict };

      activity.push({
        kind: "duel",
        at: d.settled_at,
        sp: awardSP(event),
        result: isWinner ? "win" : "loss",
        verdict,
        duelId: d.id,
        opponentAddress: opponent,
      });
    }

    for (const r of solos ?? []) {
      if (r.excluded) continue; // no SP was awarded; don't clutter the feed
      const verdict = extractVerdict(r.plausibility_check);
      const event: SPEvent = { kind: "solo_submit", verdict };
      const game =
        (r.v2_tournaments as unknown as { game?: string } | null)?.game ??
        "unknown";
      activity.push({
        kind: "solo",
        at: r.submitted_at,
        sp: awardSP(event),
        verdict,
        runId: r.id,
        tournamentId: r.tournament_id,
        game,
      });
    }

    // Merge-sort by timestamp desc, cap at 20. Sort is on mostly-sorted
    // inputs so it's ~linear in practice.
    activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const trimmed = activity.slice(0, 20);

    const dto: ProfileDTO = {
      address: addr,
      stats,
      progress,
      activity: trimmed,
    };
    return jsonOk(dto);
  };
}

// ─── GET /api/leaderboard ───────────────────────────────────────────────────

export function createGlobalLeaderboardHandler() {
  return async function GET(_req: NextRequest): Promise<Response> {
    const supabase = getSupabaseService();

    const { data: rows, error } = await supabase
      .from("v2_user_stats")
      .select("user_address,total_sp,current_level,last_active_at")
      .order("total_sp", { ascending: false })
      .limit(100);
    if (error) return jsonError("db_error", error.message, 500);

    const leaderboard: LeaderboardRowDTO[] = (rows ?? []).map((r, i) => ({
      rank: i + 1,
      address: r.user_address,
      // Trust the stored level (written by hook + backfill), but recompute if
      // missing/zero — defensive against a mid-deploy window where stats were
      // inserted before current_level was populated.
      level: r.current_level || levelForSP(r.total_sp),
      totalSp: r.total_sp,
      lastActiveAt: r.last_active_at,
    }));

    return jsonOk({ leaderboard });
  };
}
