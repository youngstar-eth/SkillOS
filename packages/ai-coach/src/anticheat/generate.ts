// ───────────────────────────────────────────────────────────────────────────
// Main entry point for the anti-cheat pipeline: checkPlausibility(req).
//
// Called post-settle from packages/duel-backend/src/settle.ts as fire-and-
// forget. Failures must not block settle. The caller is responsible for
// applying a timeout (Promise.race or AbortController) — this function
// simply throws on SDK errors and lets the caller decide whether to drop.
//
// Returns a PlausibilityResponse with verdict ∈ {plausible, suspicious,
// implausible}, confidence 0..1, reasoning, flags, reviewedAt, modelVersion.
// On parse failure the function degrades to a "plausible" fallback rather
// than throwing — preserves the bias rule (false positives cost more than
// false negatives) and avoids "check errored" becoming "admin must review".
// ───────────────────────────────────────────────────────────────────────────

import type { TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient } from "../client";
import type {
  PlausibilityRequest,
  PlausibilityResponse,
  Verdict,
} from "./types";
import { VALID_VERDICTS } from "./prompts/base";
import { buildGame2048AnticheatPrompt } from "./prompts/game-2048";
import { buildWordleAnticheatPrompt } from "./prompts/game-wordle";
import { buildSudokuAnticheatPrompt } from "./prompts/game-sudoku";
import { buildMinesweeperAnticheatPrompt } from "./prompts/game-minesweeper";
import { buildClickerAnticheatPrompt } from "./prompts/game-clicker";
import { buildMatch3AnticheatPrompt } from "./prompts/game-match3";

// Same model as coach/recap. Shared constant so future swaps are one-line.
const MODEL = "claude-haiku-4-5";
// Room for reasoning + flags; verdicts are short.
const MAX_TOKENS = 400;
// Low temperature — judgments should be consistent across repeated calls
// on the same input, not flavorful. Contrast with recap (0.9, meant to be
// varied) and coach (0.5, middle ground).
const TEMPERATURE = 0.1;

function buildPromptFor(
  req: PlausibilityRequest,
): { system: string; user: string } {
  switch (req.gameType) {
    case "game2048":
      return buildGame2048AnticheatPrompt(req);
    case "wordle":
      return buildWordleAnticheatPrompt(req);
    case "sudoku":
      return buildSudokuAnticheatPrompt(req);
    case "minesweeper":
      return buildMinesweeperAnticheatPrompt(req);
    case "clicker":
      return buildClickerAnticheatPrompt(req);
    case "match3":
      return buildMatch3AnticheatPrompt(req);
  }
}

type ParsedCore = Pick<
  PlausibilityResponse,
  "verdict" | "confidence" | "reasoning" | "flags"
>;

function parseVerdict(raw: unknown): Verdict | null {
  if (typeof raw !== "string") return null;
  return (VALID_VERDICTS as readonly string[]).includes(raw)
    ? (raw as Verdict)
    : null;
}

function parseAnticheatJson(raw: string): ParsedCore | null {
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

  const { verdict, confidence, reasoning, flags } = obj as Record<
    string,
    unknown
  >;

  const v = parseVerdict(verdict);
  if (!v) return null;
  if (typeof reasoning !== "string" || reasoning.trim().length === 0) {
    return null;
  }

  // Clamp confidence to [0,1]; fall back to 0.5 if missing / non-numeric.
  const c =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0.5;

  // Keep up to 8 string flags — guards against the model emitting a novel
  // cornucopia of labels on a bad day.
  const f = Array.isArray(flags)
    ? flags
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 8)
    : [];

  return {
    verdict: v,
    confidence: c,
    reasoning: reasoning.trim(),
    flags: f,
  };
}

function plausibleFallback(): ParsedCore {
  // Bias-toward-plausible when parsing fails. "parse-failure" flag makes
  // the situation visible in the admin endpoint if anyone filters by
  // flag later.
  return {
    verdict: "plausible",
    confidence: 0.3,
    reasoning: "Model response could not be parsed; defaulting to plausible per bias rule.",
    flags: ["parse-failure"],
  };
}

/**
 * Run the plausibility audit. ~250-400 output tokens on Haiku 4.5 ≈ $0.005/call.
 * Caller caches per duel in `plausibility_check` (see settle hook).
 */
export async function checkPlausibility(
  req: PlausibilityRequest,
): Promise<PlausibilityResponse> {
  const client = getAnthropicClient();
  const { system, user } = buildPromptFor(req);

  const response = await client.messages.create({
    model: MODEL,
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

  const parsed = parseAnticheatJson(text) ?? plausibleFallback();

  return {
    ...parsed,
    reviewedAt: new Date().toISOString(),
    modelVersion: MODEL,
  };
}
