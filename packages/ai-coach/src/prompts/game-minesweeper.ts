// ───────────────────────────────────────────────────────────────────────────
// Per-game coach prompt — Minesweeper. Tone: "risk".
//
// Minesweeper is a probabilistic deduction game. Most decisions are
// either strict-logic (constraint satisfaction from adjacent numbers) or
// probability bets (the infamous "50/50" or forced guesses at openings).
// Coach should frame moves as risk management:
//   - can you deduce the safe cell, or are you guessing?
//   - chord-clicking (middle-click on a satisfied number) for speed
//   - when to flag vs. when to click-through
//
// Useful gameSpecificData keys (populated by apps/minesweeper if available):
//   - difficulty: 'beginner'|'intermediate'|'expert'
//   - cellsRevealed: number
//   - flagsPlaced: number
//   - hitMine: boolean        — whether the loss was a mine hit
//   - forcedGuesses: number   — where no deduction was possible
// ───────────────────────────────────────────────────────────────────────────

import type { CoachRequest } from "../types";
import { COACH_SYSTEM_BASE, summarizeMatch } from "./base";

export function buildMinesweeperPrompt(req: CoachRequest): {
  system: string;
  user: string;
} {
  const system = `${COACH_SYSTEM_BASE}

Game: Minesweeper. Tone: "risk".
Frame moves as probability bets — did the player have enough information
to deduce, or were they guessing? If hitMine is true and forcedGuesses
is 0, the loss was avoidable (bad deduction). If forcedGuesses > 0, the
loss may have been a 50/50 nobody could have solved. Mention
chord-clicking and efficient flagging when the duration suggests speed.

When emitting the tone field, use exactly: "risk".`;

  return { system, user: summarizeMatch(req) };
}
