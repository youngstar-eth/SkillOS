// ───────────────────────────────────────────────────────────────────────────
// Per-game recap prompt — 2048.
//
// Voice: tile-game punchy. Think "corner strategy crushed it", not
// "the player played well". Uses 2048's native vocabulary (tiles, merges,
// corner, monotone row, spawn luck).
//
// Per-game tone reference (from sprint plan):
//   - "816 vs 2388 — corner strategy crushed it in 1.1 minutes." (standard)
//   - "Down 724, clawed back to 2388. Never count out a 2048 grinder." (comeback)
//
// Useful gameSpecificData keys (populated by apps/2048 if available):
//   - maxTile: number     — the largest tile reached
//   - moveCount: number   — total moves played
//   - lostCorner: boolean — whether the player ever let the max tile leave
//                           their anchor corner
// ───────────────────────────────────────────────────────────────────────────

import type { RecapRequest } from "../types";
import { RECAP_SYSTEM_BASE, summarizeRecapMatch } from "./base";

// Style applicability matrix — all six styles are usable for 2048.
// applicable: [standard, blowout, nailBiter, speedRun, grind, comeback]
// disabled:   []
//
// Comeback signal: gameSpecificData.lostCorner === true, or moveCount
// disproportionate to final delta. No flag → never emit comeback.

/** Per-game thresholds. Tuned to 2048's typical match shape. */
const THRESHOLDS = {
  blowoutRatio: 2, // winner ≥ 2× loser → blowout candidate
  nailBiterDeltaPct: 10, // |delta| / higher ≤ 10% → nailBiter candidate
  speedRunSec: 60, // duration well under → speedRun
  grindSec: 300, // duration well over → grind
} as const;

export function buildGame2048RecapPrompt(req: RecapRequest): {
  system: string;
  user: string;
} {
  const { blowoutRatio, nailBiterDeltaPct, speedRunSec, grindSec } = THRESHOLDS;

  const system = `${RECAP_SYSTEM_BASE}

Game: 2048 (4×4 sliding-tile merge game). Vocabulary you may use: tiles,
merges, corner, monotone row, spawn, stall, forced merge. Do NOT address
the player in second person — recap is a bystander-voice story about the
match.

Style selection rules for this game (use these alongside the shape heuristics,
prefer "standard" if nothing fits cleanly):
- "blowout"   — winner's score ≥ ${blowoutRatio}× loser's score
- "nailBiter" — |score delta| ≤ ${nailBiterDeltaPct}% of the higher score
- "speedRun"  — duration well under ${speedRunSec}s AND score isn't tiny
- "grind"     — duration well over ${grindSec}s
- "comeback"  — ONLY if gameSpecificData hints at a mid-match lead swap
                (e.g. moveCount disproportionate to final delta, or an
                explicit "lead swapped" flag). Never fabricate a comeback.
- "standard"  — fall back here whenever the match is ordinary.

Voice anchors for this game (imitate the rhythm, not the exact words):
- standard:  "816 vs 2388 — corner strategy crushed it in 1.1 minutes."
- comeback:  "Down 724, clawed back to 2388. Never count out a 2048 grinder."
- blowout:   "2388 to 416. A corner held, a board cleared, a pot taken."
- nailBiter: "2388 vs 2320. One untaken merge decided it."
- speedRun:  "2048 in 47 seconds flat. The corner never wobbled."
- grind:     "Seven minutes. Two tiles from 4096. A slow win is still a win."

Numbers in your output MUST come from the match summary below. Never invent
a tile value, a score, or a duration.

Remember: headline ≤8 words, narrative exactly 2 sentences, shareText ≤240 chars
with {url} token and @SkillOS mention.`;

  return { system, user: summarizeRecapMatch(req) };
}
