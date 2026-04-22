// ───────────────────────────────────────────────────────────────────────────
// Per-game plausibility — clicker.
//
// Physics: score is (approximately) click-count, modulated by upgrades.
// Average CPS = score / duration. Human sustainable CPS: 8–12. Burst
// jitter-click: 15–20 for a few seconds max. Above 20 CPS sustained is
// autoclicker territory.
//
// Skillbase clicker has an upgrade surge that multiplies clicks late-game;
// that means raw score/duration OVERSTATES the true click rate. We err
// generous: suspicious band starts at avg 12 CPS, implausible at 20+
// across a full-duration match.
//
// Signals:
// - "sustained-high-cps"       — computed CPS above human sustainable
// - "autoclicker-signature"    — avg CPS consistent with bot pattern
// ───────────────────────────────────────────────────────────────────────────

import type { PlausibilityRequest } from "../types";
import { ANTICHEAT_SYSTEM_BASE, summarizeForAnticheat } from "./base";

export function buildClickerAnticheatPrompt(
  req: PlausibilityRequest,
): { system: string; user: string } {
  const guidance = `GAME CONTEXT — clicker:
- Score grows roughly with click count, boosted by late-game upgrades.
- Human sustainable CPS: 8–12. Jitter-click burst: 15–20 for seconds only.
- Autoclickers typically produce flat 20+ CPS for the full duration.

CPS evaluation depends on what's present in the summary:

CASE A — gameSpecificData includes rawClickCount or rawClickTimestamps:
- peakCps = rawClickCount / durationSeconds
- If peakCps > 25 sustained: implausible
- If peakCps > 15 sustained with zero idle gaps: suspicious
- Cite the raw metric by name in reasoning.

CASE B — only score + duration available (today's default, no game_data column):
- Score/second is NOT click rate — upgrade multipliers inflate it.
- Bias toward plausible. Set confidence 0.3–0.5.
- Reasoning: "Raw click metrics not logged; verdict limited to score/duration sanity only."
- Do NOT flag as suspicious or implausible on score alone — except for the carve-out below.

EXCEPTION (CASE B carve-out — OVERRIDES the base bias-toward-plausible):
If computed winnerScore/durationSeconds ≥ 20, verdict MUST be "suspicious". This is a numeric threshold violation, NOT a borderline case — the base bias rule does not apply. Do not revert to "plausible" by invoking upgrade-multiplier narratives.

Required reasoning template: "winnerScore/durationSeconds = X.X, crossing the 20-point/sec threshold for clicker. Raw click count not logged; cannot distinguish upgrade inflation from autoclicker, so flagging for admin review rather than dismissing."

Required flags: at least "sustained-high-cps".

Flags to consider: "sustained-high-cps", "autoclicker-signature".`;

  return {
    system: `${ANTICHEAT_SYSTEM_BASE}\n\n${guidance}`,
    user: summarizeForAnticheat(req),
  };
}
