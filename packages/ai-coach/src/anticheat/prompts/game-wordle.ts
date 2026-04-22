// ───────────────────────────────────────────────────────────────────────────
// Per-game plausibility — wordle.
//
// Physics: 5-letter target, 6 guesses max. Each guess cycle = read previous
// feedback + form hypothesis + type 5 letters + submit. Even for elite
// solvers the per-guess floor is ~4–6s; full-session floor ~20–30s.
// First-guess solves are possible (~1 in 2309) but rare.
//
// Score model: Skillbase's wordle score is tied to guess efficiency (fewer
// guesses = higher score) — we don't have attemptsUsed in the summary today,
// so we reason from duration.
//
// Signals:
// - "subsecond-guesses"  — duration implies per-guess cycles below human floor
// - "speedrun-anomaly"   — sub-10s with a non-zero score
// ───────────────────────────────────────────────────────────────────────────

import type { PlausibilityRequest } from "../types";
import { ANTICHEAT_SYSTEM_BASE, summarizeForAnticheat } from "./base";

export function buildWordleAnticheatPrompt(
  req: PlausibilityRequest,
): { system: string; user: string } {
  const guidance = `GAME CONTEXT — wordle:
- 5-letter target, 6 guesses max. Each guess requires reading feedback + forming hypothesis + typing.
- Human per-guess floor ~4–6s. Full 6-guess session floor ~20–30s.
- Typical honest play: 30–180s.

Plausibility bands:
- duration ≥ 20s → plausible (covers even single-guess lucky solves)
- duration 10–20s with non-zero score → suspicious (unusually fast)
- duration < 5s with non-zero score → implausible (below type-and-read physical floor)

Flags to consider: "subsecond-guesses", "speedrun-anomaly".`;

  return {
    system: `${ANTICHEAT_SYSTEM_BASE}\n\n${guidance}`,
    user: summarizeForAnticheat(req),
  };
}
