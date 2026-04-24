// ───────────────────────────────────────────────────────────────────────────
// Solo-recap pipeline. Same RecapResponse shape as duel recap (so the
// AIRecap card renders both without a mapping layer) but:
//
//   • Input is SoloRecapRequest (no opponent / won field).
//   • Narrative framing is solo-first — no "defeated opponent" language.
//   • Allowed styles narrowed to { speedRun, grind, standard } — the
//     opponent-relative archetypes (comeback, blowout, nailBiter) don't
//     apply when there is no opponent. The model picks one; anything
//     else collapses to "standard".
//
// Same Haiku 4.5 model + ~320 output tokens ≈ $0.008/call.
// ───────────────────────────────────────────────────────────────────────────

import type { TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient } from "../client";
import type { GameType } from "../types";
import type { RecapResponse, RecapStyle } from "../recap/types";
import type { SoloRecapRequest } from "./types";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 320;
const TEMPERATURE = 0.9;

const SOLO_VALID_STYLES: readonly RecapStyle[] = [
  "speedRun",
  "grind",
  "standard",
];

/** Per-game voice. Kept tight inline rather than forked to six files. */
const GAME_VOICE: Record<GameType, string> = {
  game2048:
    "Game: 2048. Language: corner anchoring, merge cadence, tile climb. No opponent narrative — frame the story as a solo climb toward a max-tile ceiling.",
  wordle:
    "Game: Wordle. Language: letter deduction, vowel placement, attempt economy. Frame as the player's solve arc across a bounded number of guesses.",
  sudoku:
    "Game: Sudoku. Language: technique deployed, logic chains, board-state control. Frame as a disciplined grid-resolution run.",
  minesweeper:
    "Game: Minesweeper. Language: probability reads, forced-square counting, chord plays. Frame as a measured-risk navigation through the board.",
  clicker:
    "Game: Clicker. Language: sustained cadence, burst windows, finger rhythm. Frame as a tempo run.",
  match3:
    "Game: Match-3. Language: cascade setups, chain multipliers, board reads. Frame as a combo-planning run.",
};

const SOLO_RECAP_SYSTEM_BASE = `You are the AI Recap for Skillbase, a skills-based arcade tournament platform.

The player just finished a SOLO tournament run. Write a shareable, punchy recap of THIS run — no opponent. This is the card a player shows friends.

OUTPUT FORMAT — respond with valid JSON only, matching exactly:
{"style": "<one of: speedRun, grind, standard>", "headline": "<≤8 words, punchy>", "narrative": "<2 sentences, dramatic but factual>", "shareText": "<≤240 chars, ends with the literal token {url} @skillbase>"}

Hard rules:
  • style MUST be one of: "speedRun", "grind", "standard". Pick based on
    duration: very short → speedRun, long/grindy → grind, otherwise
    standard. Never invent new styles. Never use opponent-relative
    styles like "comeback", "blowout", or "nailBiter".
  • headline is ≤8 words, ≤55 characters. Punchy. No emoji.
  • narrative is exactly 2 sentences. Uses the real numbers from the run
    (score, duration). No opponent framing — never say "defeated",
    "crushed", "beat", or reference an opponent. "You" is fine.
  • shareText includes the literal token "{url}" once (the caller
    substring-replaces it with the run URL) and "@skillbase". Reads
    well even if {url} is stripped before posting.

Do not wrap the JSON in markdown code fences. No prose before or after.
No trailing commentary. Just the JSON object.`;

function summarizeSoloRun(req: SoloRecapRequest): string {
  const durationMin = (req.durationSeconds / 60).toFixed(1);
  const lines = [
    `Final score: ${req.score}`,
    `Duration: ${durationMin} min`,
  ];
  if (req.isPaidRetry) {
    lines.push(
      "Context: this was a paid retry — the player spent 1 USDC to come back for another run in the same tournament.",
    );
  }
  if (req.gameSpecificData && Object.keys(req.gameSpecificData).length > 0) {
    lines.push(
      `Game-specific context: ${JSON.stringify(req.gameSpecificData)}`,
    );
  }
  return lines.join("\n");
}

function buildSoloRecapPrompt(req: SoloRecapRequest): {
  system: string;
  user: string;
} {
  const system = `${SOLO_RECAP_SYSTEM_BASE}\n\n${GAME_VOICE[req.gameType]}`;
  return { system, user: summarizeSoloRun(req) };
}

function parseSoloRecapJson(raw: string): RecapResponse | null {
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
  if (typeof headline !== "string" || headline.trim().length === 0) {
    return null;
  }
  if (typeof narrative !== "string" || narrative.trim().length === 0) {
    return null;
  }
  if (typeof shareText !== "string" || shareText.trim().length === 0) {
    return null;
  }

  // Narrow to solo styles; collapse to "standard" on violation rather
  // than reject. "standard" is the unflavored archetype — safe default.
  const safeStyle: RecapStyle = (SOLO_VALID_STYLES as readonly string[]).includes(
    typeof style === "string" ? style : "",
  )
    ? (style as RecapStyle)
    : "standard";

  return {
    style: safeStyle,
    headline: headline.trim(),
    narrative: narrative.trim(),
    shareText: shareText.trim().slice(0, 240),
  };
}

function buildFallbackRecap(req: SoloRecapRequest): RecapResponse {
  const durMin = (req.durationSeconds / 60).toFixed(1);
  return {
    style: "standard",
    headline: `Solo run — ${req.score} points`,
    narrative: `A ${durMin}-minute solo run landed at ${req.score}. The scoreboard takes it from here.`,
    shareText: `Just posted a Skillbase solo score: ${req.score} in ${durMin} min. {url} @skillbase`,
  };
}

export async function generateSoloRecap(
  req: SoloRecapRequest,
): Promise<RecapResponse> {
  const client = getAnthropicClient();
  const { system, user } = buildSoloRecapPrompt(req);

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

  const parsed = parseSoloRecapJson(text);
  if (parsed) return parsed;

  return buildFallbackRecap(req);
}
