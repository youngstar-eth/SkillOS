// ───────────────────────────────────────────────────────────────────────────
// x402-paid endpoint — $0.01 USDC per call.
// Aggregate tier histogram across 6 Skillbase games. Anonymized.
//
// Payment is handled by apps/2048/src/middleware.ts (verify + settle via
// CDP facilitator). This handler runs only after a successful settlement
// and returns the real data.
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getSupabaseService } from "@skillbase/lib-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LevelBucket = "level_1_3" | "level_4_6" | "level_7_9" | "level_10";

function bucket(level: number): LevelBucket {
  if (level <= 3) return "level_1_3";
  if (level <= 6) return "level_4_6";
  if (level <= 9) return "level_7_9";
  return "level_10";
}

function hasPlausibleVerdict(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return (raw as { verdict?: unknown }).verdict === "plausible";
}

export async function GET() {
  const supabase = getSupabaseService();

  const [usersRes, runsRes] = await Promise.all([
    supabase.from("v2_user_stats").select("user_address, current_level"),
    supabase
      .from("v2_tournament_solo_runs")
      .select("player_address, plausibility_check")
      .eq("excluded", false),
  ]);

  if (usersRes.error) {
    console.error("[sp-tier-distribution] user_stats query failed", usersRes.error);
    return NextResponse.json(
      { error: "query_failed", detail: "user_stats" },
      { status: 500 },
    );
  }
  if (runsRes.error) {
    console.error("[sp-tier-distribution] solo_runs query failed", runsRes.error);
    return NextResponse.json(
      { error: "query_failed", detail: "solo_runs" },
      { status: 500 },
    );
  }

  const users = (usersRes.data ?? []) as Array<{
    user_address: string;
    current_level: number;
  }>;
  const runs = (runsRes.data ?? []) as Array<{
    player_address: string;
    plausibility_check: unknown;
  }>;

  const userLevel = new Map<string, number>();
  const playersByBucket: Record<LevelBucket, number> = {
    level_1_3: 0,
    level_4_6: 0,
    level_7_9: 0,
    level_10: 0,
  };
  for (const u of users) {
    userLevel.set(u.user_address, u.current_level);
    playersByBucket[bucket(u.current_level)] += 1;
  }

  const decisionsByBucket: Record<LevelBucket, number> = {
    level_1_3: 0,
    level_4_6: 0,
    level_7_9: 0,
    level_10: 0,
  };
  let totalPlausibleDecisions = 0;
  for (const r of runs) {
    if (!hasPlausibleVerdict(r.plausibility_check)) continue;
    const level = userLevel.get(r.player_address);
    if (level === undefined) continue;
    decisionsByBucket[bucket(level)] += 1;
    totalPlausibleDecisions += 1;
  }

  const totalUsers = users.length;
  const pct = (n: number) =>
    totalUsers === 0 ? 0 : Number(((n / totalUsers) * 100).toFixed(2));

  const body = {
    generated_at: new Date().toISOString(),
    source: "Skillbase — 6 games, verified human decisions",
    total_verified_players: totalUsers,
    total_decisions_recorded: totalPlausibleDecisions,
    tier_distribution: {
      level_1_3: {
        players: playersByBucket.level_1_3,
        pct: pct(playersByBucket.level_1_3),
        decisions: decisionsByBucket.level_1_3,
      },
      level_4_6: {
        players: playersByBucket.level_4_6,
        pct: pct(playersByBucket.level_4_6),
        decisions: decisionsByBucket.level_4_6,
      },
      level_7_9: {
        players: playersByBucket.level_7_9,
        pct: pct(playersByBucket.level_7_9),
        decisions: decisionsByBucket.level_7_9,
      },
      level_10: {
        players: playersByBucket.level_10,
        pct: pct(playersByBucket.level_10),
        decisions: decisionsByBucket.level_10,
      },
    },
    plausibility_filter_applied: "plausible_only",
    sample_note:
      "Aggregate tier distribution across 6 Skillbase games. For single verified decision samples, see /api/public/data/decision-sample. For bulk licensing, contact sales@simpl3.ai.",
    related_endpoints: [
      "/api/public/data/decision-sample",
      "/api/public/ai/coach-sample",
    ],
  };

  return NextResponse.json(body);
}
