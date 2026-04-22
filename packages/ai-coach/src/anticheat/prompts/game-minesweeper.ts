// ───────────────────────────────────────────────────────────────────────────
// Per-game plausibility — minesweeper.
//
// Physics: grid of hidden mines. Player reveals safe cells + flags mines
// using logic on adjacent-count hints. World records exist at ~1s beginner /
// ~30s expert, but these involve NF (no-flag) strategies and immense practice.
//
// Score model: Skillbase exposes score + duration only. Board size
// (beginner/intermediate/expert) is not in the summary. We err on the
// side of "plausible" for anything ≥ 5s to avoid flagging fast beginner
// runs; implausible band kicks in only at sub-3s territory.
//
// Signals:
// - "sub-five-second-clear" — very fast clear without board-size context
// - "speedrun-anomaly"      — pairs with non-zero score
// ───────────────────────────────────────────────────────────────────────────

import type { PlausibilityRequest } from "../types";
import { ANTICHEAT_SYSTEM_BASE, summarizeForAnticheat } from "./base";

export function buildMinesweeperAnticheatPrompt(
  req: PlausibilityRequest,
): { system: string; user: string } {
  const guidance = `GAME CONTEXT — minesweeper:
- Grid of hidden mines; reveal safe cells via logic on adjacent-count hints.
- World records: ~1s beginner, ~30s expert — achievable only with extreme practice.
- Typical honest play: 15–120s depending on difficulty.
- Board size (beginner/intermediate/expert) is NOT exposed in this summary,
  so reason generously — most fast plays are small boards, not cheats.

Plausibility bands:
- duration ≥ 15s → plausible
- duration 5–15s with non-zero score → suspicious (possible on easy, worth a glance)
- duration < 3s with non-zero score → implausible (below click-and-reveal floor)

Flags to consider: "sub-five-second-clear", "speedrun-anomaly".`;

  return {
    system: `${ANTICHEAT_SYSTEM_BASE}\n\n${guidance}`,
    user: summarizeForAnticheat(req),
  };
}
