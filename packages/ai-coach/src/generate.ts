// ───────────────────────────────────────────────────────────────────────────
// The main entry point: generateCoachFeedback(req).
//
// Pipeline:
//   1. Build game-specific prompt via the matching prompts/game-<x>.ts.
//   2. Call Claude Haiku 4.5 via the shared Anthropic client.
//   3. Parse the JSON response; fall back to raw text + mapped tone on
//      parse failure (model rarely breaks the contract, but the route
//      handler should never crash just because one reply lost its braces).
//
// Error model: throws when ANTHROPIC_API_KEY is absent or when the SDK
// itself errors (network, 429, 5xx from Anthropic). Callers in Task 3
// (route handler) should wrap in try/catch and return a graceful
// user-visible error.
// ───────────────────────────────────────────────────────────────────────────

import type { TextBlock } from "@anthropic-ai/sdk/resources/messages";
import type { CoachRequest, CoachResponse, CoachTone } from "./types";
import { getAnthropicClient } from "./client";
import { GAME_TONE_MAP } from "./prompts/base";
import { buildGame2048Prompt } from "./prompts/game-2048";
import { buildWordlePrompt } from "./prompts/game-wordle";
import { buildSudokuPrompt } from "./prompts/game-sudoku";
import { buildMinesweeperPrompt } from "./prompts/game-minesweeper";
import { buildClickerPrompt } from "./prompts/game-clicker";
import { buildMatch3Prompt } from "./prompts/game-match3";

// Claude Haiku 4.5 — matches the sprint plan. Kept as a const to make
// future model swaps a one-line change.
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 200;
const TEMPERATURE = 0.7;

const VALID_TONES: readonly CoachTone[] = [
  "encouraging",
  "tactical",
  "analytical",
  "technique",
  "risk",
  "pacing",
  "strategic",
];

function buildPromptFor(
  req: CoachRequest,
): { system: string; user: string } {
  switch (req.gameType) {
    case "game2048":
      return buildGame2048Prompt(req);
    case "wordle":
      return buildWordlePrompt(req);
    case "sudoku":
      return buildSudokuPrompt(req);
    case "minesweeper":
      return buildMinesweeperPrompt(req);
    case "clicker":
      return buildClickerPrompt(req);
    case "match3":
      return buildMatch3Prompt(req);
  }
}

/**
 * Attempt to parse the model's JSON reply. Returns null on any shape
 * mismatch so the caller can decide how to degrade.
 *
 * We accept both raw JSON (expected) and JSON wrapped in markdown fences
 * (defensive — cheaper to tolerate than to retry-for-compliance).
 */
function parseCoachJson(raw: string): CoachResponse | null {
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
  const { feedback, tone } = obj as {
    feedback?: unknown;
    tone?: unknown;
  };
  if (typeof feedback !== "string" || feedback.trim().length === 0) return null;
  if (typeof tone !== "string") return null;

  const safeTone = (VALID_TONES as readonly string[]).includes(tone)
    ? (tone as CoachTone)
    : "encouraging";

  return { feedback: feedback.trim(), tone: safeTone };
}

/**
 * Produce post-match feedback for a single player. Cost: ~200 output
 * tokens on Haiku 4.5 ≈ $0.005/call. Rate limiting is the caller's job
 * (Task 3 uses a cached-per-player-per-match mechanism).
 */
export async function generateCoachFeedback(
  req: CoachRequest,
): Promise<CoachResponse> {
  const client = getAnthropicClient();
  const { system, user } = buildPromptFor(req);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system,
    messages: [{ role: "user", content: user }],
  });

  // Pull out just the text blocks. Haiku 4.5 for this prompt shape won't
  // emit tool_use / thinking blocks, but we guard anyway for future
  // model swaps. TextBlock is imported from the SDK so future SDK
  // upgrades that change TextBlock's shape surface here as a build
  // error rather than a silent runtime mismatch.
  const text = response.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = parseCoachJson(text);
  if (parsed) return parsed;

  // Model broke the JSON contract. Degrade to using the raw text as
  // feedback and the game's canonical tone.
  return {
    feedback:
      text.slice(0, 400).trim() ||
      "Match complete. Try again for a tighter read next round.",
    tone: GAME_TONE_MAP[req.gameType] ?? "encouraging",
  };
}
