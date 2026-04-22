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
- Compute avg CPS = winner score / duration. Treat it as an upper bound on true clicking
  (upgrades inflate the ratio; a 15 avg could be 8 clicks/sec with a 2x multiplier).
- Human sustainable CPS: 8–12. Jitter-click burst: 15–20 for seconds only.
- Autoclickers typically produce flat 20+ CPS for the full duration.

Plausibility bands:
- avg CPS ≤ 12 → plausible
- avg CPS 12–20 → suspicious (possible with heavy upgrades, glance)
- avg CPS > 20 sustained > 30s → implausible (cite the computed CPS)

Flags to consider: "sustained-high-cps", "autoclicker-signature".`;

  return {
    system: `${ANTICHEAT_SYSTEM_BASE}\n\n${guidance}`,
    user: summarizeForAnticheat(req),
  };
}
