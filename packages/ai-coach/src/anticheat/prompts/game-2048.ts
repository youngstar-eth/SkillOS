// ───────────────────────────────────────────────────────────────────────────
// Per-game plausibility — 2048.
//
// Physics: reaching the 2^N tile from empty board requires at least 2^(N-1)
// merges. Each merge consumes at least one swipe; many require 2+ (align
// before combining). Elite human swipe rate peaks around 3–5 swipes/sec
// and cannot be sustained for long sessions.
//
// Score model: Skillbase's score grows with merges (exact formula not
// exposed here, but the ceiling relationships hold — score ceilings scale
// with swipe budget). A score > 4096 in < 60s is suspicious; > 8192 in
// < 90s is implausible at any reasonable swipe rate.
//
// Signals available from input today (score + duration):
// - "score-duration-ratio"  — score too high for time window
// - "speedrun-anomaly"      — sub-30s with non-trivial score
//
// NOTE: moveCount / maxTile would strengthen this check dramatically,
// but v2_duels has no game_data column. Flag ceiling is duration-only
// until that lands.
// ───────────────────────────────────────────────────────────────────────────

import type { PlausibilityRequest } from "../types";
import { ANTICHEAT_SYSTEM_BASE, summarizeForAnticheat } from "./base";

export function buildGame2048AnticheatPrompt(
  req: PlausibilityRequest,
): { system: string; user: string } {
  const guidance = `GAME CONTEXT — 2048:
- Goal: merge same-value tiles on a 4x4 grid via directional swipes.
- Score grows with merges. Reaching higher tiles requires exponentially more swipes.
- Elite human swipe rate: 3–5 swipes/sec peak; sustained human rate 1–2/sec.
- Typical honest play: score < 4096 plays in 60–180s; 4096+ in 180–400s; 8192+ rare and 5+ min.

Plausibility bands (duration-only; no move-count signal available today):
- duration ≥ 60s  → lean plausible regardless of score
- duration 30–60s AND score > 4096 → suspicious
- duration < 30s  AND score > 2048 → suspicious
- duration < 30s  AND score > 8192 → implausible (cite the duration gap vs. the multi-minute floor for honest 8192+ play; do NOT cite invented swipe counts or swipe-rate math)

Required reasoning shape for implausible here: "Score X in Ys falls below the typical N-minute floor for any honest 8192+ play; move count not logged." Do not supply any swipe/move figure.

Flags to consider: "score-duration-ratio", "speedrun-anomaly".`;

  return {
    system: `${ANTICHEAT_SYSTEM_BASE}\n\n${guidance}`,
    user: summarizeForAnticheat(req),
  };
}
