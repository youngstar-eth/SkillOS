// ───────────────────────────────────────────────────────────────────────────
// Main entry point for the recap pipeline: generateRecap(req).
//
// Mirrors the coach pipeline:
//   1. Build per-game prompt via buildGame<Slug>RecapPrompt.
//   2. Call Haiku 4.5 through the shared Anthropic client.
//   3. Parse the strict-JSON reply; fall back to a conservative "standard"
//      recap on parse failure so a malformed model response never breaks
//      the result page.
//
// Error model: throws on missing ANTHROPIC_API_KEY or SDK failures. Caller
// (route handler) wraps in try/catch and returns a graceful error.
// ───────────────────────────────────────────────────────────────────────────

import type { TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient } from "../client";
import type { RecapRequest, RecapResponse, RecapStyle } from "./types";
import { VALID_RECAP_STYLES } from "./prompts/base";
import { buildGame2048RecapPrompt } from "./prompts/game-2048";
import { buildWordleRecapPrompt } from "./prompts/game-wordle";
import { buildSudokuRecapPrompt } from "./prompts/game-sudoku";
import { buildMinesweeperRecapPrompt } from "./prompts/game-minesweeper";
import { buildClickerRecapPrompt } from "./prompts/game-clicker";
import { buildMatch3RecapPrompt } from "./prompts/game-match3";

import { RECAP_MODEL } from "../models";

// Higher temperature than coach: recap is meant to be flavorful,
// coach is meant to be accurate.
const MAX_TOKENS = 320;
const TEMPERATURE = 0.9;

function buildRecapPromptFor(
  req: RecapRequest,
): { system: string; user: string } {
  switch (req.gameType) {
    case "game2048":
      return buildGame2048RecapPrompt(req);
    case "wordle":
      return buildWordleRecapPrompt(req);
    case "sudoku":
      return buildSudokuRecapPrompt(req);
    case "minesweeper":
      return buildMinesweeperRecapPrompt(req);
    case "clicker":
      return buildClickerRecapPrompt(req);
    case "match3":
      return buildMatch3RecapPrompt(req);
  }
}

/**
 * Parse Haiku's JSON reply. Returns null on any shape violation so the
 * caller can degrade. We strip optional markdown fences defensively —
 * Haiku 4.5 rarely emits them here but the cost of tolerance is zero.
 */
function parseRecapJson(raw: string): RecapResponse | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(stripped);
  } catch {
    return null;
  }

  if (typeof obj !== "object" || obj === null) return null;
  const { style, headline, narrative, shareText } = obj as {
    style?: unknown;
    headline?: unknown;
    narrative?: unknown;
    shareText?: unknown;
  };

  if (typeof headline !== "string" || headline.trim().length === 0) return null;
  if (typeof narrative !== "string" || narrative.trim().length === 0) return null;
  if (typeof shareText !== "string" || shareText.trim().length === 0) return null;

  const safeStyle: RecapStyle = (VALID_RECAP_STYLES as readonly string[]).includes(
    typeof style === "string" ? style : "",
  )
    ? (style as RecapStyle)
    : "standard";

  // Enforce the share-text length ceiling even if the model goes over.
  // 240 chars is the sprint-plan constraint (Twitter-safe after shorteners
  // and any auto-appended metadata). We slice rather than reject so a
  // slightly-too-long recap still renders.
  const boundedShare = shareText.trim().slice(0, 240);

  return {
    style: safeStyle,
    headline: headline.trim(),
    narrative: narrative.trim(),
    shareText: boundedShare,
  };
}

/**
 * Fallback recap used when Haiku's output cannot be parsed. Deliberately
 * generic and number-accurate — the goal is a graceful result-page
 * render, not a viral share.
 */
function buildFallbackRecap(req: RecapRequest): RecapResponse {
  const winner = req.won ? req.myScore : req.opponentScore;
  const loser = req.won ? req.opponentScore : req.myScore;
  const durMin = (req.durationSeconds / 60).toFixed(1);
  return {
    style: "standard",
    headline: `${winner} vs ${loser}`,
    narrative: `A ${durMin}-minute duel ended ${winner} to ${loser}. The scoreline tells the story.`,
    shareText: `Just played a Skillbase duel: ${winner} vs ${loser} in ${durMin} min. {url} @skillbase`,
  };
}

/**
 * Produce a shareable post-match narrative for a duel. ~300 output tokens
 * on Haiku 4.5 ≈ $0.008/call. Caller caches per duel in `recap_cache`
 * (see createRecapHandler in duel-backend).
 */
export async function generateRecap(req: RecapRequest): Promise<RecapResponse> {
  const client = getAnthropicClient();
  const { system, user } = buildRecapPromptFor(req);

  const response = await client.messages.create({
    model: RECAP_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = response.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = parseRecapJson(text);
  if (parsed) return parsed;

  return buildFallbackRecap(req);
}
