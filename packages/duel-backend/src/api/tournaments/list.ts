// ───────────────────────────────────────────────────────────────────────────
// Route handler FACTORIES for tournament list + detail reads.
//
//   GET /api/tournaments              → active daily + weekly for this game
//   GET /api/tournaments/[id]         → full tournament + leaderboard
//   GET /api/tournaments/archive      → last 10 settled tournaments (this game)
//
// Per-app wire-up (apps/<game>/src/app/api/tournaments/.../route.ts):
//   export const GET = createTournamentActiveHandler({ game: "2048" });
//   export const GET = createTournamentDetailHandler({ game: "2048" });
//   export const GET = createTournamentArchiveHandler({ game: "2048" });
//
// Read-only. Leaderboard math mirrors the on-chain effective rank formula
// (best_score*85 + match_count*bonus*15) — same integer math the DB stored.
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import {
  getSupabaseService,
  isUuid,
  jsonError,
  jsonOk,
  parseAddress,
} from "@skillbase/lib-shared";
import { RETRY_FEE } from "@skillbase/contracts";
import type { TournamentGame } from "../../cron/tournaments";

export interface TournamentReadHandlerConfig {
  game: TournamentGame;
}

/**
 * Per-wallet eligibility for the next solo submission on a tournament.
 *
 * Pay-then-play needs the client to know upfront whether the next click
 * is a free run or a paid retry — the legacy "try free, fall back to 402"
 * pattern fires the wallet popup AFTER the user already saw their score
 * (cherry-pick exploit). With this, the client knows before the game starts.
 *
 * Computed only when caller provides ?address= query param. Backward-
 * compatible: callers without the param see `eligibility: null`.
 */
interface EligibilityDTO {
  walletAddress: string;
  /** count of v2_tournament_solo_runs rows for (tournament, player). */
  priorSoloRuns: number;
  /** true iff priorSoloRuns >= 1 — next submission requires fee. */
  nextPaidRetry: boolean;
  /** "1000000" (1 USDC, 6 decimals) when paid retry; "0" otherwise. */
  currentFeeOwed: string;
}

interface TournamentDTO {
  id: string;
  onChainId: string;
  game: string;
  cycleType: "daily" | "weekly";
  startsAt: string;
  endsAt: string;
  prizePoolUsdc: string;
  participationBonus: number;
  sponsorAddress: string;
  sponsorName: string | null;
  sponsorLogoUrl: string | null;
  settledAt: string | null;
  settleTxHash: string | null;
  entryCount: number;
  /** null when caller didn't pass ?address= or address was invalid. */
  eligibility: EligibilityDTO | null;
}

interface LeaderboardEntryDTO {
  rank: number;
  playerAddress: string;
  bestScore: number;
  matchCount: number;
  effectiveRankScore: string;
  excluded: boolean;
  prizeWonUsdc: string | null;
  prizeTxHash: string | null;
  /**
   * Player's current SP level from v2_user_stats. `null` when the player has
   * never earned SP (edge case: tournament entry written before any SP-earning
   * event completed). Rendered as an "L7" pill in the leaderboard column.
   */
  level: number | null;
}

function toTournamentDTO(
  row: Record<string, unknown>,
  entryCount = 0,
  eligibility: EligibilityDTO | null = null,
): TournamentDTO {
  return {
    id: row.id as string,
    onChainId: row.on_chain_id as string,
    game: row.game as string,
    cycleType: row.cycle_type as "daily" | "weekly",
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
    prizePoolUsdc: String(row.prize_pool_usdc),
    participationBonus: Number(row.participation_bonus),
    sponsorAddress: row.sponsor_address as string,
    sponsorName: (row.sponsor_name as string | null) ?? null,
    sponsorLogoUrl: (row.sponsor_logo_url as string | null) ?? null,
    settledAt: (row.settled_at as string | null) ?? null,
    settleTxHash: (row.settle_tx_hash as string | null) ?? null,
    entryCount,
    eligibility,
  };
}

// ─── GET /api/tournaments (active daily + weekly) ─────────────────────────

export function createTournamentActiveHandler(config: TournamentReadHandlerConfig) {
  return async function GET(req: NextRequest): Promise<Response> {
    const supabase = getSupabaseService();
    const nowIso = new Date().toISOString();

    // Pay-then-play eligibility: client passes ?address= to learn whether the
    // next click is a free run or a paid retry. Backward-compatible: missing/
    // invalid address yields `eligibility: null` on each tournament.
    const addressParam = req.nextUrl.searchParams.get("address");
    const player = addressParam ? parseAddress(addressParam) : null;

    const { data: rows, error } = await supabase
      .from("v2_tournaments")
      .select("*")
      .eq("game", config.game)
      .is("settled_at", null)
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso);
    if (error) return jsonError("db_error", error.message, 500);

    // At most one of each cycle type at a time. If duplicates exist (shouldn't),
    // pick the earliest ends_at.
    const tournaments = (rows ?? []) as Record<string, unknown>[];
    tournaments.sort((a, b) =>
      String(a.ends_at).localeCompare(String(b.ends_at)),
    );

    let daily: TournamentDTO | null = null;
    let weekly: TournamentDTO | null = null;
    const ids: string[] = [];
    for (const row of tournaments) {
      if (row.cycle_type === "daily" && !daily) ids.push(row.id as string);
      if (row.cycle_type === "weekly" && !weekly) ids.push(row.id as string);
    }

    // Bulk-count entries for the ids we care about so the UI can show
    // "N players" without a per-row count query.
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: entryRows, error: eErr } = await supabase
        .from("v2_tournament_entries")
        .select("tournament_id", { count: "exact" })
        .in("tournament_id", ids)
        .eq("excluded", false);
      if (eErr) return jsonError("db_error", eErr.message, 500);
      for (const r of entryRows ?? []) {
        const tid = (r as { tournament_id: string }).tournament_id;
        counts.set(tid, (counts.get(tid) ?? 0) + 1);
      }
    }

    // Bulk-count solo runs per (tournament, player) for eligibility. One
    // round-trip covers both daily + weekly via .in(); skipped when no
    // valid address was supplied. .select("tournament_id") returns one row
    // per matching solo run; we group client-side to avoid an RPC.
    const soloCountByTid = new Map<string, number>();
    if (player && ids.length > 0) {
      const { data: runRows, error: rErr } = await supabase
        .from("v2_tournament_solo_runs")
        .select("tournament_id")
        .in("tournament_id", ids)
        .eq("player_address", player);
      if (rErr) return jsonError("db_error", rErr.message, 500);
      for (const r of runRows ?? []) {
        const tid = (r as { tournament_id: string }).tournament_id;
        soloCountByTid.set(tid, (soloCountByTid.get(tid) ?? 0) + 1);
      }
    }

    function eligibilityFor(tournamentId: string): EligibilityDTO | null {
      if (!player) return null;
      const priorSoloRuns = soloCountByTid.get(tournamentId) ?? 0;
      const nextPaidRetry = priorSoloRuns >= 1;
      return {
        walletAddress: player,
        priorSoloRuns,
        nextPaidRetry,
        currentFeeOwed: nextPaidRetry ? RETRY_FEE.toString() : "0",
      };
    }

    for (const row of tournaments) {
      const id = row.id as string;
      if (row.cycle_type === "daily" && !daily) {
        daily = toTournamentDTO(row, counts.get(id) ?? 0, eligibilityFor(id));
      } else if (row.cycle_type === "weekly" && !weekly) {
        weekly = toTournamentDTO(row, counts.get(id) ?? 0, eligibilityFor(id));
      }
    }

    return jsonOk({ game: config.game, daily, weekly });
  };
}

// ─── GET /api/tournaments/[id] (detail + leaderboard) ────────────────────

export function createTournamentDetailHandler(config: TournamentReadHandlerConfig) {
  return async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id } = await ctx.params;
    if (!isUuid(id)) {
      return jsonError("invalid_tournament_id", "tournament id must be a uuid v4", 400);
    }

    const supabase = getSupabaseService();

    const { data: tournamentRow, error: tErr } = await supabase
      .from("v2_tournaments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (tErr) return jsonError("db_error", tErr.message, 500);
    if (!tournamentRow) {
      return jsonError("tournament_not_found", `tournament ${id} not found`, 404);
    }
    const row = tournamentRow as Record<string, unknown>;
    if (row.game !== config.game) {
      return jsonError(
        "game_mismatch",
        `tournament is for '${row.game as string}', endpoint serves '${config.game}'`,
        400,
      );
    }

    const { data: entryRows, error: eErr } = await supabase
      .from("v2_tournament_entries")
      .select("*")
      .eq("tournament_id", id)
      .order("excluded", { ascending: true }) // non-excluded first
      .order("effective_rank_score", { ascending: false });
    if (eErr) return jsonError("db_error", eErr.message, 500);

    const entries = (entryRows ?? []) as Record<string, unknown>[];

    // Batch-fetch SP levels for every player in the leaderboard so the UI
    // can render "L7" pills without N per-row round-trips. One `.in()` query
    // bounded by the tournament's entry count.
    const addresses = Array.from(
      new Set(entries.map((e) => (e.player_address as string).toLowerCase())),
    );
    const levelByAddr = new Map<string, number>();
    if (addresses.length > 0) {
      const { data: statsRows } = await supabase
        .from("v2_user_stats")
        .select("user_address,current_level")
        .in("user_address", addresses);
      for (const r of statsRows ?? []) {
        const addr = (r as { user_address: string }).user_address.toLowerCase();
        const lvl = (r as { current_level: number }).current_level;
        levelByAddr.set(addr, lvl);
      }
    }

    let rank = 0;
    const leaderboard: LeaderboardEntryDTO[] = entries.map((entry) => {
      const excluded = entry.excluded as boolean;
      if (!excluded) rank += 1;
      const addrLc = (entry.player_address as string).toLowerCase();
      return {
        rank: excluded ? 0 : rank,
        playerAddress: entry.player_address as string,
        bestScore: Number(entry.best_score),
        matchCount: Number(entry.match_count),
        effectiveRankScore: String(entry.effective_rank_score),
        excluded,
        prizeWonUsdc:
          entry.prize_won_usdc != null ? String(entry.prize_won_usdc) : null,
        prizeTxHash: (entry.prize_tx_hash as string | null) ?? null,
        level: levelByAddr.get(addrLc) ?? null,
      };
    });

    const nonExcludedCount = leaderboard.filter((e) => !e.excluded).length;

    return jsonOk({
      tournament: toTournamentDTO(row, nonExcludedCount),
      leaderboard,
    });
  };
}

// ─── GET /api/tournaments/archive (last 10 settled, this game) ───────────

export function createTournamentArchiveHandler(config: TournamentReadHandlerConfig) {
  return async function GET(_req: NextRequest): Promise<Response> {
    const supabase = getSupabaseService();
    const { data: rows, error } = await supabase
      .from("v2_tournaments")
      .select("*")
      .eq("game", config.game)
      .not("settled_at", "is", null)
      .order("settled_at", { ascending: false })
      .limit(10);
    if (error) return jsonError("db_error", error.message, 500);
    const archive = (rows ?? []).map((row) =>
      toTournamentDTO(row as Record<string, unknown>, 0),
    );
    return jsonOk({ game: config.game, archive });
  };
}
