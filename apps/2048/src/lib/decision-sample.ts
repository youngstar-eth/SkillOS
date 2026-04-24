// ───────────────────────────────────────────────────────────────────────────
// Shared query + shape for /api/public/data/decision-sample/* routes.
//
// Honest v1 schema — we return only match-level fields because
// v2_tournament_solo_runs stores final outcome, not per-decision deltas.
// Per-decision traces (score_before / score_delta / game_state_hash /
// time_pressure_ms / choice_signature) are a v3 replay-verify milestone,
// flagged in sample_note so consumers don't expect them.
// ───────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { getSupabaseService } from "@skillbase/lib-shared";

export type Tier = "any" | "1-4" | "5-7" | "8-plus";
export const TIER_SLUGS = ["any", "1-4", "5-7", "8-plus"] as const;
export const PRICING_TIER_LABELS: Record<Tier, string> = {
  any: "any",
  "1-4": "L1-4",
  "5-7": "L5-7",
  "8-plus": "L8+",
};

const VALID_GAMES = [
  "2048",
  "wordle",
  "sudoku",
  "minesweeper",
  "clicker",
  "match3",
] as const;
export type GameSlug = (typeof VALID_GAMES)[number];

function levelInTier(level: number, tier: Tier): boolean {
  if (tier === "any") return true;
  if (tier === "1-4") return level >= 1 && level <= 4;
  if (tier === "5-7") return level >= 5 && level <= 7;
  return level >= 8;
}

function sampleNote(): string {
  return (
    "This sample returns match-level verified decision data. Phase 2 expands " +
    "to per-decision traces once v3 replay verify ships (game state hashes, " +
    "choice sequences, time-pressure telemetry). Current v1 schema: final " +
    "outcome + verdict + tier classification. For bulk licensing, contact " +
    "sales@simpl3.ai."
  );
}

type SoloRunRow = {
  id: string;
  score: number;
  submitted_at: string;
  plausibility_check: unknown;
  player_address: string;
  tournament: { game: string } | null;
};

type UserStatRow = {
  user_address: string;
  current_level: number;
};

export interface DecisionSampleResponse {
  generated_at: string;
  decision_id: string;
  game: string | null;
  tier_at_decision_time: string | null;
  plausibility_verdict: "plausible";
  available_fields: {
    final_score: number | null;
    duration_seconds: number | null;
    plausibility_score: number | null;
  };
  meta: {
    sample_note: string;
    pricing_tier: string;
    schema_version: "v1";
  };
}

export interface EmptyDecisionSampleResponse {
  generated_at: string;
  decision_id: null;
  game: null;
  tier_at_decision_time: null;
  plausibility_verdict: null;
  available_fields: Record<string, never>;
  meta: {
    sample_note: string;
    pricing_tier: string;
    schema_version: "v1";
    note: string;
  };
}

function pickRandom<T>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows[Math.floor(Math.random() * rows.length)];
}

function hasPlausibleVerdict(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const verdict = (raw as { verdict?: unknown }).verdict;
  return verdict === "plausible";
}

function plausibilityScore(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const conf = (raw as { confidence?: unknown }).confidence;
  return typeof conf === "number" ? conf : null;
}

function durationSeconds(submittedAt: string): number | null {
  // solo_runs has no explicit duration column; we cannot invent one. v3
  // schema will carry first_move_at so duration is computable there. For
  // v1 we report null rather than approximating.
  void submittedAt;
  return null;
}

export async function sampleDecision(params: {
  tier: Tier;
  game?: GameSlug;
}): Promise<DecisionSampleResponse | EmptyDecisionSampleResponse> {
  const { tier, game } = params;
  const supabase = getSupabaseService();

  // Pull plausible, non-excluded solo runs with their tournament game.
  // Bounded query — plausible-only set is small; we fetch up to 500 and
  // pick one in memory. Keeps the handler under a second without an RPC.
  const query = supabase
    .from("v2_tournament_solo_runs")
    .select(
      "id, score, submitted_at, plausibility_check, player_address, tournament:v2_tournaments!tournament_id(game)",
    )
    .eq("excluded", false)
    .limit(500);

  const { data: runs, error } = await query;
  if (error) {
    console.error("[decision-sample] solo_runs query failed", error);
    throw new Error("decision_sample_query_failed");
  }

  const plausibleRuns = ((runs ?? []) as unknown as SoloRunRow[]).filter(
    (r) =>
      hasPlausibleVerdict(r.plausibility_check) &&
      (!game || r.tournament?.game === game),
  );

  // Attach user tier via a second query — v2_tournament_solo_runs.player_address
  // has no declared FK to v2_user_stats so we join in JS.
  const playerAddresses = Array.from(
    new Set(plausibleRuns.map((r) => r.player_address)),
  );
  let userLevels = new Map<string, number>();
  if (playerAddresses.length > 0) {
    const { data: users, error: userErr } = await supabase
      .from("v2_user_stats")
      .select("user_address, current_level")
      .in("user_address", playerAddresses);
    if (userErr) {
      console.error("[decision-sample] user_stats lookup failed", userErr);
      throw new Error("decision_sample_query_failed");
    }
    userLevels = new Map(
      (users ?? []).map((u: UserStatRow) => [u.user_address, u.current_level]),
    );
  }

  const eligible = plausibleRuns
    .map((r) => ({ run: r, level: userLevels.get(r.player_address) }))
    .filter(
      (entry): entry is { run: SoloRunRow; level: number } =>
        entry.level !== undefined && levelInTier(entry.level, tier),
    );

  const generatedAt = new Date().toISOString();
  const pricingTier = PRICING_TIER_LABELS[tier];

  const picked = pickRandom(eligible);
  if (!picked) {
    return {
      generated_at: generatedAt,
      decision_id: null,
      game: null,
      tier_at_decision_time: null,
      plausibility_verdict: null,
      available_fields: {},
      meta: {
        sample_note: sampleNote(),
        pricing_tier: pricingTier,
        schema_version: "v1",
        note:
          "No decisions match filter at this time. Try tier=any or wait for fresh matches.",
      },
    };
  }

  const decisionId = createHash("sha256")
    .update(picked.run.id)
    .digest("hex")
    .slice(0, 16);

  return {
    generated_at: generatedAt,
    decision_id: decisionId,
    game: picked.run.tournament?.game ?? null,
    tier_at_decision_time: `L${picked.level}`,
    plausibility_verdict: "plausible",
    available_fields: {
      final_score: picked.run.score,
      duration_seconds: durationSeconds(picked.run.submitted_at),
      plausibility_score: plausibilityScore(picked.run.plausibility_check),
    },
    meta: {
      sample_note: sampleNote(),
      pricing_tier: pricingTier,
      schema_version: "v1",
    },
  };
}

export function parseGame(raw: string | null): GameSlug | undefined {
  if (!raw) return undefined;
  return (VALID_GAMES as readonly string[]).includes(raw)
    ? (raw as GameSlug)
    : undefined;
}
