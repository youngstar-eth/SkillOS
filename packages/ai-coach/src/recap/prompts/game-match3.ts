// ───────────────────────────────────────────────────────────────────────────
// Per-game recap prompt — Match-3.
//
// Style applicability matrix:
// applicable: [standard, blowout, nailBiter, speedRun, grind, comeback]
// disabled:   []
//
// Vocabulary: combos, chains, cascade, board clear, specials
// (4-in-a-row / L / T / 5-in-a-row), swap, dead space, deferred swap.
//
// Useful gameSpecificData keys (same as coach match3):
//   - swapsUsed: number
//   - maxCascadeLength: number
//   - specialsCreated: number
//   - wastedSwaps: number
//   - comboChain: boolean — TRUE if a long combo chain fired in the
//                           final window; the comeback gate for match3.
// ───────────────────────────────────────────────────────────────────────────

import type { RecapRequest } from "../types";
import { RECAP_SYSTEM_BASE, summarizeRecapMatch } from "./base";

/**
 * Per-game thresholds. Match-3 rounds are short; 45s is the lower floor
 * for a "clean sweep" speedRun, 180s is where a grind narrative starts
 * to feel earned.
 */
const THRESHOLDS = {
  blowoutRatio: 2,
  nailBiterDeltaPct: 10,
  speedRunSec: 45,
  grindSec: 180,
} as const;

export function buildMatch3RecapPrompt(req: RecapRequest): {
  system: string;
  user: string;
} {
  const { blowoutRatio, nailBiterDeltaPct, speedRunSec, grindSec } = THRESHOLDS;

  const system = `${RECAP_SYSTEM_BASE}

Game: Match-3 (cascade-planning puzzle). Vocabulary: combos, chains,
cascade, board clear, specials (4-in-a-row / L-shape / T-shape / 5-in-a-row),
swap, dead space, deferred swap. Do NOT address the player in second
person.

A "cascade" in match-3 is a chain of auto-matches triggered by gravity
after a swap — use it when maxCascadeLength is large. Do not confuse with
minesweeper cascades.

Style selection rules for this game (pick "standard" if nothing fits):
- "blowout"   — winner's score ≥ ${blowoutRatio}× loser's.
- "nailBiter" — |score delta| ≤ ${nailBiterDeltaPct}% of the higher score.
- "speedRun"  — duration under ${speedRunSec}s.
- "grind"     — duration over ${grindSec}s.
- "comeback"  — ONLY if gameSpecificData.comboChain === true (a late
                chain/cascade detonated in the final window and flipped
                the score). Never fabricate.
- "standard"  — fall back here whenever the match is ordinary.

Voice anchors for this game:
- standard:  "Nine specials, two big cascades. Clean board management."
- comeback:  "Late combo chain detonated the board. The scoreboard flipped in six seconds."
- blowout:   "A seven-chain cascade midway and the opponent never recovered."
- nailBiter: "Final margin: 40 points. One combo chain away either way."
- speedRun:  "Board cleared in 38 seconds. Specials on tap the whole run."
- grind:     "Three minutes of patient swaps. Every chain built the next one."

Numbers in your output MUST come from the match summary. Never invent
cascade lengths, swap counts, or durations.

Remember: headline ≤8 words, narrative exactly 2 sentences, shareText
≤240 chars with {url} token and @skillbase mention.`;

  return { system, user: summarizeRecapMatch(req) };
}
