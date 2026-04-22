// ───────────────────────────────────────────────────────────────────────────
// Per-game plausibility — match3.
//
// Physics: swap adjacent tiles, create 3+ matches, cascades multiply score.
// Human swap rate: 1–2/sec typical, 3/sec burst. Cascades can inflate score
// dramatically from a single swap, so high score in short time is NOT
// automatically suspicious — cascade luck matters.
//
// We err generous here: suspicious band only if duration is very short
// with high score, implausible only at sub-3s non-zero.
//
// Signals:
// - "swap-rate-anomaly"   — implied swaps-per-second above human ceiling
// - "speedrun-anomaly"    — very short duration with non-trivial score
// ───────────────────────────────────────────────────────────────────────────

import type { PlausibilityRequest } from "../types";
import { ANTICHEAT_SYSTEM_BASE, summarizeForAnticheat } from "./base";

export function buildMatch3AnticheatPrompt(
  req: PlausibilityRequest,
): { system: string; user: string } {
  const guidance = `GAME CONTEXT — match3:
- Swap adjacent tiles to form 3+ matches. Cascades multiply score non-linearly.
- Human swap rate: 1–2/sec typical, 3/sec burst. Cascade luck drives score more than raw rate.
- High scores in short matches are possible with good cascades — be generous.

Plausibility bands:
- duration ≥ 30s → plausible (cascades make legitimate fast-high scores)
- duration 10–30s with very high score (ratio > 5x loser) → suspicious
- duration < 3s with non-zero score → implausible (below tap-and-cascade floor)

Flags to consider: "swap-rate-anomaly", "speedrun-anomaly".`;

  return {
    system: `${ANTICHEAT_SYSTEM_BASE}\n\n${guidance}`,
    user: summarizeForAnticheat(req),
  };
}
