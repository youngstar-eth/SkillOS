// ───────────────────────────────────────────────────────────────────────────
// Per-game recap prompt — Clicker.
//
// Clicker is time-bounded (fixed match duration in apps/clicker), so
// "speedRun" and "grind" don't map — you can't finish early and you
// can't drag it out. Blowout is measured by absolute delta, not ratio,
// because clicker scores are large numbers where ratio distortion near
// zero is misleading (1000 vs 500 is NOT the same story as 200000 vs
// 100000 even though both are 2x).
//
// Style applicability matrix:
// applicable: [standard, blowout, nailBiter, comeback]
// disabled:   [speedRun, grind]
//
// NOTE: your directive's matrix example listed grind as applicable for
// clicker, but the threshold table said "N/A". I read the N/A as
// canonical (match duration is fixed) and disabled both. If you want
// grind enabled (e.g. for longer-format clicker variants), say so and
// I'll re-enable with a threshold.
//
// Vocabulary: clicks, CPS (clicks-per-second), peak, sustain, fatigue,
//             upgrades, multiplier, idle, active rate, surge.
//
// Useful gameSpecificData keys (same as coach clicker):
//   - peakCps: number
//   - avgCps: number
//   - powerupsUsed: number
//   - idleSeconds: number
//   - upgradeSurge: boolean — TRUE if a large upgrade/multiplier burst
//                             fired in the final window; the comeback
//                             gate for clicker.
// ───────────────────────────────────────────────────────────────────────────

import type { RecapRequest } from "../types";
import { RECAP_SYSTEM_BASE, summarizeRecapMatch } from "./base";

/**
 * Per-game thresholds. Clicker uses absolute delta for blowout because
 * raw score magnitudes vary by 10–100× depending on upgrade paths.
 * 5000 as the blowout floor: any gap of 5k+ points in a fixed-duration
 * clicker match represents a meaningful rhythm/upgrade gap.
 */
const THRESHOLDS = {
  blowoutAbsoluteDelta: 5000, // winner - loser ≥ this → blowout
  nailBiterDeltaPct: 10, // |delta| / higher ≤ 10% → nailBiter
} as const;

export function buildClickerRecapPrompt(req: RecapRequest): {
  system: string;
  user: string;
} {
  const { blowoutAbsoluteDelta, nailBiterDeltaPct } = THRESHOLDS;

  const system = `${RECAP_SYSTEM_BASE}

Game: Clicker (timed click-rate / upgrade game). Vocabulary: clicks, CPS
(clicks-per-second), peak, sustain, fatigue, upgrades, multiplier, idle,
active rate, surge. Do NOT address the player in second person.

IMPORTANT — Clicker has a fixed match duration, so the styles "speedRun"
and "grind" are NOT ALLOWED for this game. Your allowed styles for this
game are exactly:
  "standard", "blowout", "nailBiter", "comeback"
If none of blowout/nailBiter/comeback fit, pick "standard". Do not
invent "speedRun" or "grind" regardless of how short or long the
duration appears.

Style selection rules for this game:
- "blowout"   — winner - loser ≥ ${blowoutAbsoluteDelta} absolute points.
                (Ratio is misleading here; use the absolute gap.)
- "nailBiter" — |score delta| ≤ ${nailBiterDeltaPct}% of the higher score.
- "comeback"  — ONLY if gameSpecificData.upgradeSurge === true (a late
                multiplier or upgrade burst in the final window flipped
                the match). Never fabricate.
- "standard"  — fall back here whenever the match is ordinary.

Voice anchors for this game:
- standard:  "Peaked at 14 CPS, sustained 11. A clean, honest round."
- comeback:  "Down 3000, then an upgrade surge in the last stretch. The multiplier did what the fingers couldn't."
- blowout:   "Winner hit 17 CPS through the fatigue wall. Opponent's rhythm broke at 20 seconds."
- nailBiter: "Forty points between them at the buzzer. Hands didn't stop shaking."

Numbers in your output MUST come from the match summary. Never invent
CPS values, upgrade counts, or durations.

Remember: headline ≤8 words, narrative exactly 2 sentences, shareText
≤240 chars with {url} token and @skillbase mention.`;

  return { system, user: summarizeRecapMatch(req) };
}
