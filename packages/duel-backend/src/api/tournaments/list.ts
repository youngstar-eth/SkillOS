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
} from "@skillbase/lib-shared";
import type { TournamentGame } from "../../cron/tournaments";

export interface TournamentReadHandlerConfig {
  game: TournamentGame;
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
}

function toTournamentDTO(row: Record<string, unknown>, entryCount = 0): TournamentDTO {
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
  };
}

// ─── GET /api/tournaments (active daily + weekly) ─────────────────────────

export function createTournamentActiveHandler(config: TournamentReadHandlerConfig) {
  return async function GET(_req: NextRequest): Promise<Response> {
    const supabase = getSupabaseService();
    const nowIso = new Date().toISOString();

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

    for (const row of tournaments) {
      if (row.cycle_type === "daily" && !daily) {
        daily = toTournamentDTO(row, counts.get(row.id as string) ?? 0);
      } else if (row.cycle_type === "weekly" && !weekly) {
        weekly = toTournamentDTO(row, counts.get(row.id as string) ?? 0);
      }
    }

    return jsonOk({ game: config.game, daily, weekly });
  };
}

// ─── GET /api/tournaments/[id] (detail + leaderboard) ────────────────────

export function createTournamentDetailHandler(config: TournamentReadHandlerConfig) {
  return async function GET(
    _req: NextRequest,
    ctx: { params: { id: string } },
  ): Promise<Response> {
    const id = ctx.params.id;
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
    let rank = 0;
    const leaderboard: LeaderboardEntryDTO[] = entries.map((entry) => {
      const excluded = entry.excluded as boolean;
      if (!excluded) rank += 1;
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
