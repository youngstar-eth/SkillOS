// ───────────────────────────────────────────────────────────────────────────
// Route handler FACTORY for the per-source SP breakdown read.
//
//   GET /api/sp-earned?kind=duel&id=<uuid>&player=<0x..>
//   GET /api/sp-earned?kind=solo&id=<run-uuid>&player=<0x..>
//
// Powers the post-game SPEarnedCard. Returns the SP awarded for ONE source
// row (duel win/loss or solo submit) plus the player's current stats so the
// card can render "+50 SP" + "Level 6 → Level 7" + progress bar in a single
// round-trip. Polling is the same pattern as AIReviewedBadge — if the
// anti-cheat verdict is still pending, return verdict: "pending" and let
// the client re-fetch once Haiku's audit lands.
//
// Not wired to tournament rank bonuses — those only exist at tournament
// settle time, not on any per-submit result page. The tournament leaderboard
// itself surfaces rank; the SPEarnedCard shown after a solo submit reflects
// only the solo_submit award.
//
// Per-app wire-up (apps/<game>/src/app/api/sp-earned/route.ts):
//   import { createSPEarnedHandler } from "@skillos/duel-backend";
//   export const runtime = "nodejs";
//   export const GET = createSPEarnedHandler();
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import {
  getSupabaseService,
  isUuid,
  jsonError,
  jsonOk,
  parseAddress,
} from "@skillos/lib-shared";
import {
  awardSPBreakdown,
  levelForSP,
  spForNextLevel,
  type SPEvent,
  type Verdict,
} from "@skillos/sp-engine";

type LookupKind = "duel" | "solo";
type CardVerdict = Verdict | "pending";

interface StatsSnapshot {
  totalSp: number;
  currentLevel: number;
  progress: {
    next: number | null;
    remaining: number;
    currentLevelMinSP: number;
  };
}

export interface SPEarnedDTO {
  kind: LookupKind;
  sourceId: string;
  player: string;
  /** "duel_win" | "duel_loss" | "solo_submit" — lets the card pick copy. */
  eventKind: SPEvent["kind"] | null;
  verdict: CardVerdict;
  /**
   * Awarded delta. Null iff verdict is "pending" (audit still in flight) —
   * the client polls and re-fetches. Zero when verdict is implausible.
   */
  sp: number | null;
  /** Base amount before multiplier; null when verdict is pending. */
  base: number | null;
  /** Plausibility multiplier; null when verdict is pending. */
  multiplier: number | null;
  /** Current user_stats totals. */
  current: StatsSnapshot;
  /**
   * Approximated "before this event" totals. Computed as current - sp. If
   * the user happened to earn SP between this source row and the card
   * render this will drift — acceptable for a transition animation. Null
   * until verdict resolves.
   */
  before: StatsSnapshot | null;
}

function snapshot(totalSp: number): StatsSnapshot {
  return {
    totalSp,
    currentLevel: levelForSP(totalSp),
    progress: spForNextLevel(totalSp),
  };
}

function extractVerdict(plausibilityCheck: unknown): CardVerdict {
  if (plausibilityCheck == null) return "pending";
  const v = (plausibilityCheck as { verdict?: Verdict }).verdict;
  if (v === "plausible" || v === "suspicious" || v === "implausible") return v;
  return "pending";
}

export function createSPEarnedHandler() {
  return async function GET(req: NextRequest): Promise<Response> {
    const url = new URL(req.url);
    const kindParam = url.searchParams.get("kind");
    const id = url.searchParams.get("id");
    const playerParam = url.searchParams.get("player");

    if (kindParam !== "duel" && kindParam !== "solo") {
      return jsonError("invalid_kind", "kind must be 'duel' or 'solo'", 400);
    }
    if (!id || !isUuid(id)) {
      return jsonError("invalid_id", "id must be a uuid v4", 400);
    }
    const player = parseAddress(playerParam);
    if (!player) {
      return jsonError("invalid_player", "player must be a 0x address", 400);
    }
    const kind: LookupKind = kindParam;

    const supabase = getSupabaseService();

    // ─── resolve event + verdict ────────────────────────────────────────────

    let event: SPEvent | null = null;
    let verdict: CardVerdict = "pending";

    if (kind === "duel") {
      const { data: duel, error } = await supabase
        .from("v2_duels")
        .select(
          "status,winner_address,player1_address,player2_address,player1_submitted_at,player2_submitted_at,plausibility_check",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) return jsonError("db_error", error.message, 500);
      if (!duel) return jsonError("not_found", "duel not found", 404);
      if (duel.status !== "settled") {
        // Mirror the "pending" path — let the card keep polling until settle.
        verdict = "pending";
      } else {
        verdict = extractVerdict(duel.plausibility_check);
        const isP1 = duel.player1_address?.toLowerCase() === player.toLowerCase();
        const isP2 = duel.player2_address?.toLowerCase() === player.toLowerCase();
        if (!isP1 && !isP2) {
          return jsonError(
            "not_a_participant",
            "player is not in this duel",
            403,
          );
        }
        const isWinner =
          duel.winner_address?.toLowerCase() === player.toLowerCase();
        const mySubmit = isP1
          ? duel.player1_submitted_at
          : duel.player2_submitted_at;
        const walkoverLoser = !isWinner && !mySubmit;
        if (walkoverLoser) {
          // No submit = no SP (same rule as the backfill). Return a card with
          // sp: 0 rather than pending so the UI doesn't poll forever.
          event = null;
        } else if (verdict !== "pending") {
          event = isWinner
            ? { kind: "duel_win", verdict }
            : { kind: "duel_loss", verdict };
        }
      }
    } else {
      // kind === "solo"
      const { data: run, error } = await supabase
        .from("v2_tournament_solo_runs")
        .select("player_address,plausibility_check,excluded")
        .eq("id", id)
        .maybeSingle();
      if (error) return jsonError("db_error", error.message, 500);
      if (!run) return jsonError("not_found", "solo run not found", 404);
      if (run.player_address.toLowerCase() !== player.toLowerCase()) {
        return jsonError("not_a_participant", "player did not submit this run", 403);
      }
      if (run.excluded) {
        verdict = "implausible";
        event = { kind: "solo_submit", verdict: "implausible" };
      } else {
        verdict = extractVerdict(run.plausibility_check);
        if (verdict !== "pending") {
          event = { kind: "solo_submit", verdict };
        }
      }
    }

    // ─── current + before stats ─────────────────────────────────────────────

    const { data: statsRow, error: statsErr } = await supabase
      .from("v2_user_stats")
      .select("total_sp")
      .eq("user_address", player)
      .maybeSingle();
    if (statsErr) return jsonError("db_error", statsErr.message, 500);
    const currentTotal = statsRow?.total_sp ?? 0;
    const current = snapshot(currentTotal);

    // ─── build DTO ──────────────────────────────────────────────────────────

    if (verdict === "pending") {
      const dto: SPEarnedDTO = {
        kind,
        sourceId: id,
        player,
        eventKind: null,
        verdict: "pending",
        sp: null,
        base: null,
        multiplier: null,
        current,
        before: null,
      };
      return jsonOk(dto);
    }

    // Walkover loser (duel): event is null but verdict resolved — show zero.
    if (!event) {
      const dto: SPEarnedDTO = {
        kind,
        sourceId: id,
        player,
        eventKind: null,
        verdict,
        sp: 0,
        base: 0,
        multiplier: 0,
        current,
        before: current,
      };
      return jsonOk(dto);
    }

    const { sp, base, multiplier } = awardSPBreakdown(event);
    const beforeTotal = Math.max(0, currentTotal - sp);
    const before = snapshot(beforeTotal);

    const dto: SPEarnedDTO = {
      kind,
      sourceId: id,
      player,
      eventKind: event.kind,
      verdict,
      sp,
      base,
      multiplier,
      current,
      before,
    };
    return jsonOk(dto);
  };
}
