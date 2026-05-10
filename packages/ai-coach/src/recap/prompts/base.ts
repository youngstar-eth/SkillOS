// ───────────────────────────────────────────────────────────────────────────
// Shared system-prompt scaffolding for every per-game recap module.
//
// Contrast with coach/prompts/base.ts: coach speaks TO the player in
// second-person and gives actionable advice. Recap speaks ABOUT the match
// in third-person (or headline-voice) and tells a story an onlooker would
// share. Both pipelines share the Anthropic client + env var; everything
// about *what they output* is distinct by design.
// ───────────────────────────────────────────────────────────────────────────

import type { RecapRequest, RecapStyle } from "../types";

/**
 * Base persona + output contract.
 *
 * Why JSON-only with a fixed shape: downstream generate.ts parses it
 * deterministically; falling back to prose would mean losing the style
 * tag and the share-text split. The per-game module appends its own
 * paragraph with game-specific voice and a short set of per-style
 * examples.
 */
export const RECAP_SYSTEM_BASE = `You are the Recap writer for Skillbase, a head-to-head duel platform.

Two players pay a small stake, play a short match, and the winner takes the pot.
Matches are viewed after the fact on a result page. Your output is the
shareable hero card on that page — a short narrative a bystander would
retell, not advice to the loser.

Voice:
- Dramatic but factual. Never invent numbers. Never address the player as "you".
- Meme-adjacent. Short, punchy, quotable. No hedging words ("maybe", "perhaps").
- Use the actual score and duration verbatim where they sharpen the story.

You pick ONE style based on the match shape (exact rules given in the per-game
paragraph below). The allowed styles are:
- "comeback"  — one side was ahead and got overtaken
- "blowout"   — the winner dominated by a wide margin
- "nailBiter" — the final margin was tiny
- "speedRun"  — finished well faster than typical
- "grind"     — finished well slower than typical
- "standard"  — none of the above; just tell it straight

OUTPUT FORMAT — respond with valid JSON only, matching exactly:
{
  "style": "<one of the six styles above>",
  "headline": "<=8 words, title-case-ish, no trailing punctuation",
  "narrative": "<exactly 2 sentences, dramatic but factual>",
  "shareText": "<=240 chars; must contain the literal token {url}; must mention @SkillOS>"
}

No markdown fences. No prose before or after. No trailing commentary.
Just the JSON object.`;

// Per-game threshold constants live in each game's prompt file
// (see prompts/game-*.ts). That keeps tuning localized: adjusting
// wordle's speedRun threshold shouldn't require touching base.ts or
// 5 other prompt files. Each file defines its own THRESHOLDS const
// and interpolates the values into its system prompt.

/** Turn the RecapRequest into the user-turn payload. Per-game modules call this. */
export function summarizeRecapMatch(req: RecapRequest): string {
  const winnerScore = req.won ? req.myScore : req.opponentScore;
  const loserScore = req.won ? req.opponentScore : req.myScore;
  const delta = Math.abs(req.myScore - req.opponentScore);
  const durationSec = Math.round(req.durationSeconds);
  const durationMin = (req.durationSeconds / 60).toFixed(2);
  const ratio = loserScore > 0 ? (winnerScore / loserScore).toFixed(2) : "∞";

  const lines = [
    `Winner score: ${winnerScore}`,
    `Loser score: ${loserScore}`,
    `Absolute score delta: ${delta}`,
    `Winner/loser ratio: ${ratio}`,
    `Duration: ${durationSec}s (${durationMin} min)`,
  ];

  if (req.gameSpecificData && Object.keys(req.gameSpecificData).length > 0) {
    lines.push(`Game-specific context: ${JSON.stringify(req.gameSpecificData)}`);
  }

  return lines.join("\n");
}

/** Allowed styles as a runtime-checkable tuple. Used by generate.ts to validate. */
export const VALID_RECAP_STYLES: readonly RecapStyle[] = [
  "comeback",
  "blowout",
  "nailBiter",
  "speedRun",
  "grind",
  "standard",
] as const;
