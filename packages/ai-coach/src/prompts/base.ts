// ───────────────────────────────────────────────────────────────────────────
// Shared system-prompt scaffolding for every per-game coach module.
//
// Strategy:
//   1. A constant base system prompt (persona, output-shape rules).
//   2. A helper that turns the CoachRequest into a human-readable match
//      summary (the "user turn" of the conversation).
//   3. A GAME_TONE_MAP the generator uses as a safe fallback when the
//      model returns an out-of-enum tone string.
//
// Per-game modules append their own system-prompt paragraph (voice,
// terminology, what to call out) and delegate the match summary to
// summarizeMatch().
// ───────────────────────────────────────────────────────────────────────────

import type { CoachRequest, CoachTone, GameType } from "../types";

/**
 * Persona + hard output rule shared by every game. The per-game module
 * appends a paragraph with game-specific voice and the exact tone string
 * the model is expected to emit.
 *
 * Why JSON-only: avoids markdown drift in Haiku output and lets
 * generate.ts parse deterministically. The fallback path in generate.ts
 * handles the (rare) case where Haiku emits prose.
 */
export const COACH_SYSTEM_BASE = `You are the AI Coach for a head-to-head duel platform called Skillbase.

Two players pay a small stake, play a short match, and the winner takes the pot.
Matches are short and the opponent's identity is not disclosed.

Your job: give the requesting player **concrete, actionable** feedback in
2–4 sentences. Address them as "you". Be specific, not preachy. Never use
filler like "keep practicing" or "great job trying". Lean into the details
of the match (score gap, duration, any extra context provided).

OUTPUT FORMAT — respond with valid JSON only, matching exactly:
{"feedback": "<2–4 sentences>", "tone": "<one of the allowed tones>"}

Do not wrap the JSON in markdown code fences. No prose before or after.
No trailing commentary. Just the JSON object.`;

/**
 * Turn the CoachRequest into the user-turn payload. Per-game modules call
 * this to keep numerical facts presented uniformly.
 */
export function summarizeMatch(req: CoachRequest): string {
  const outcome = req.won ? "WIN" : "LOSS";
  const delta = req.myScore - req.opponentScore;
  const signedDelta = delta > 0 ? `+${delta}` : String(delta);
  const durationMin = (req.durationSeconds / 60).toFixed(1);

  const lines = [
    `Match outcome: ${outcome}`,
    `My score: ${req.myScore}`,
    `Opponent score: ${req.opponentScore}`,
    `Score delta (mine − theirs): ${signedDelta}`,
    `Duration: ${durationMin} min`,
  ];

  if (req.gameSpecificData && Object.keys(req.gameSpecificData).length > 0) {
    lines.push(`Game-specific context: ${JSON.stringify(req.gameSpecificData)}`);
  }

  return lines.join("\n");
}

/**
 * Game → expected tone string. The generator falls back to this when the
 * model emits a tone it shouldn't have (rare but worth hardening against).
 */
export const GAME_TONE_MAP: Record<GameType, CoachTone> = {
  game2048: "tactical",
  wordle: "analytical",
  sudoku: "technique",
  minesweeper: "risk",
  clicker: "pacing",
  match3: "strategic",
};
