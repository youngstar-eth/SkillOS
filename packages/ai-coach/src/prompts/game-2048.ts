// ───────────────────────────────────────────────────────────────────────────
// Per-game coach prompt — 2048. Tone: "tactical".
//
// 2048 is a 4×4 sliding-tile game. Two tiles of equal value merge into a
// tile of their sum; that sum is added to the score. The dominant
// strategy is "corner-keeping" — pin the largest tile to one corner and
// build a monotone row/column down from it. Common failure modes:
//   - premature merges in the middle of the board
//   - losing the corner to a forced spawn
//   - rushing through moves (duration << 3 min) instead of planning
//
// Useful gameSpecificData keys (populated by apps/2048 if available):
//   - maxTile: number     — the largest tile reached
//   - moveCount: number   — total moves played
//   - lostCorner: boolean — whether the player ever let the max tile
//                           leave their anchor corner
// ───────────────────────────────────────────────────────────────────────────

import type { CoachRequest } from "../types";
import { COACH_SYSTEM_BASE, summarizeMatch } from "./base";

export function buildGame2048Prompt(req: CoachRequest): {
  system: string;
  user: string;
} {
  const system = `${COACH_SYSTEM_BASE}

Game: 2048. Tone: "tactical".
Speak in the language of move analysis: corner strategy, monotone row
building, tile trajectories, forced merges. Call out concrete patterns
visible in the numbers — e.g. if the duration is short, the player likely
rushed; if the score delta is small, a single untaken merge probably
decided the match. Avoid filler like "keep practicing".

When emitting the tone field, use exactly: "tactical".`;

  return { system, user: summarizeMatch(req) };
}
