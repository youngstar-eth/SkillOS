// ───────────────────────────────────────────────────────────────────────────
// Solo-coach pipeline. Same CoachResponse shape as duel (so the AICoach
// card renders both without a mapping layer) but:
//
//   • Input is SoloCoachRequest (no opponent / won field).
//   • Feedback text is structured: two improvement areas + one concrete tip.
//   • Tone must be drawn from the SIX category tones; "encouraging" is a
//     fallback-only sentinel that the client interprets as "hide the badge"
//     so the user isn't shown a generic label that weakens the pitch.
//   • On enum violation we retry ONCE, then return the feedback text with
//     tone="encouraging" (hide-badge signal). We never crash the card.
//
// Cost: ~400 output tokens on Sonnet 4.6 ≈ $0.007/call (Sonnet's analytical
// reasoning lift beats Haiku's price advantage for this task; pay-then-play
// 1 USDC margin gives a 140x cushion).
// ───────────────────────────────────────────────────────────────────────────

import type { TextBlock } from "@anthropic-ai/sdk/resources/messages";
import type { CoachResponse, CoachTone, GameType } from "../types";
import { getAnthropicClient } from "../client";
import type { SoloCoachRequest } from "./types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 400;
const TEMPERATURE = 0.7;

/**
 * The six category tones the solo prompt is allowed to emit. Excludes
 * "encouraging" — that value is reserved as the hide-badge sentinel on
 * the fallback path.
 */
const STRICT_TONES: readonly CoachTone[] = [
  "tactical",
  "analytical",
  "technique",
  "risk",
  "pacing",
  "strategic",
];

/** Per-game voice paragraph. Kept inline to avoid a 6-file prompt sprawl. */
const GAME_VOICE: Record<GameType, string> = {
  game2048: `Game: 2048 (4×4 sliding tiles).
Speak the language of move analysis: corner anchoring, monotone row
building, forced merges, tile trajectories. If the run was short relative
to the score, flag that rushing likely forfeited merges. If the max tile
stalled, treat it as a corner-management failure, not a luck story.
Canonical tone for this game: "tactical".`,
  wordle: `Game: Wordle.
Speak in the language of deductive narrowing: letter frequency, vowel
placement, pivot guesses, positional constraints. If the run closed in
few attempts with a high score, the opener was well-chosen. If not,
cite which letter class (vowels, stops, fricatives) likely went
under-examined. Canonical tone for this game: "analytical".`,
  sudoku: `Game: Sudoku.
Speak in the language of technique: naked pairs, hidden singles, pointing
pairs, X-wing. Avoid "fill in the obvious" — every player does that.
Point at a specific class of mid-game technique they can lean on next
run. Canonical tone for this game: "technique".`,
  minesweeper: `Game: Minesweeper.
Speak in the language of probability: 1-in-N counting, forced squares,
50/50 guesses, chord efficiency. If the run ended short, treat it as a
risk-management question, not bad luck. Canonical tone for this game:
"risk".`,
  clicker: `Game: Clicker.
Speak in the language of rhythm and fatigue: sustained CPS, early burst
versus late drop, breathing cadence, finger-rotation patterns. Avoid
"click faster" — name a rhythm change. Canonical tone for this game:
"pacing".`,
  match3: `Game: Match-3.
Speak in the language of cascade planning: combo setups, multi-chain
triggers, column versus row breakers, board-state reads. Flag greedy
matches that broke a bigger setup. Canonical tone for this game:
"strategic".`,
};

/**
 * System prompt for solo. Defines persona, hard output format, and the
 * strict tone vocabulary. The per-game voice is appended per call.
 */
const SOLO_COACH_SYSTEM_BASE = `You are the AI Coach for Skillbase, a skills-based arcade tournament platform.

The requesting player just finished a SOLO run — there is no opponent.
Your job: tell them exactly what to adjust in their next run.

OUTPUT FORMAT — respond with valid JSON only, matching exactly:
{"feedback": "<structured text — see format below>", "tone": "<one of the six allowed tones>"}

The feedback field must be structured as:
Area 1: <2-6 word title> — <one concrete sentence about this run>.
Area 2: <2-6 word title> — <one concrete sentence about this run>.
Tip: <one concrete actionable sentence for the next run>.

Hard rules:
  • Exactly TWO improvement areas, labeled "Area 1:" and "Area 2:".
  • Exactly ONE tip, labeled "Tip:".
  • Speak to the player as "you". Each area and the tip must be concrete
    and grounded in the numerical facts you were given — never filler
    like "keep practicing", "great job", "you did well".
  • Do NOT mention a score, duration, or other facts that were not
    provided to you.
  • The tone field MUST be one of: "tactical", "analytical", "technique",
    "risk", "pacing", "strategic". Pick the one that best categorizes
    the DOMINANT theme of your two areas. Do not invent new tones.
    Do not use "encouraging" — it is reserved.

Do not wrap the JSON in markdown code fences. No prose before or after.
No trailing commentary. Just the JSON object.`;

/** Turn the SoloCoachRequest into the user-turn payload. */
function summarizeSoloRun(req: SoloCoachRequest): string {
  const durationMin = (req.durationSeconds / 60).toFixed(1);
  const lines = [
    `Final score: ${req.score}`,
    `Duration: ${durationMin} min`,
  ];
  if (req.isPaidRetry) {
    lines.push(
      `Context: this was a paid retry (the player spent 1 USDC to come back for another run in the same tournament).`,
    );
  }
  if (req.gameSpecificData && Object.keys(req.gameSpecificData).length > 0) {
    lines.push(
      `Game-specific context: ${JSON.stringify(req.gameSpecificData)}`,
    );
  }
  return lines.join("\n");
}

function buildSoloPrompt(req: SoloCoachRequest): {
  system: string;
  user: string;
} {
  const system = `${SOLO_COACH_SYSTEM_BASE}\n\n${GAME_VOICE[req.gameType]}`;
  return { system, user: summarizeSoloRun(req) };
}

/**
 * Attempt to parse + validate the model reply. Returns null on ANY
 * violation so the caller can retry or fall back — including when the
 * model emits a tone outside the strict 6-enum (the whole point of
 * the retry gate).
 */
function parseAndValidate(raw: string): CoachResponse | null {
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
  if (typeof feedback !== "string" || feedback.trim().length === 0) {
    return null;
  }
  if (typeof tone !== "string") return null;

  // Strict 6-enum check — this is the gate. "encouraging" (the duel
  // fallback) is intentionally excluded so a model that's drifting
  // toward generic coaching triggers a retry rather than silently
  // being accepted with a bland label.
  if (!(STRICT_TONES as readonly string[]).includes(tone)) return null;

  // Structural sanity: must include the three labels the format demands.
  // Cheap string check; the prompt is strict so this rarely fires, but
  // it's the last line of defense against malformed but enum-passing
  // output (e.g. model returning just one area with the right tone).
  const feedbackTrim = feedback.trim();
  const hasAreas =
    /Area\s*1\s*:/i.test(feedbackTrim) && /Area\s*2\s*:/i.test(feedbackTrim);
  const hasTip = /Tip\s*:/i.test(feedbackTrim);
  if (!hasAreas || !hasTip) return null;

  return { feedback: feedbackTrim, tone: tone as CoachTone };
}

function extractText(content: Array<{ type: string }>): string {
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Solo-coach generation. Single retry on validation failure, then
 * graceful fallback with `tone: "encouraging"` (the hide-badge sentinel
 * the client honors in solo context only — duel context treats
 * "encouraging" as a regular tone per its existing contract).
 */
export async function generateSoloCoachFeedback(
  req: SoloCoachRequest,
): Promise<CoachResponse> {
  const client = getAnthropicClient();
  const { system, user } = buildSoloPrompt(req);

  const callOnce = async (): Promise<CoachResponse | null> => {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system,
      messages: [{ role: "user", content: user }],
    });
    return parseAndValidate(extractText(response.content));
  };

  const first = await callOnce();
  if (first) return first;

  // One retry. Slightly higher temperature would be a lever if enum
  // violations become common — for now we re-issue the same prompt;
  // Haiku's non-determinism gives us a fresh roll.
  const second = await callOnce();
  if (second) return second;

  // Fallback: hide-badge sentinel. Frontend AICoach component in solo
  // context renders the feedback text but suppresses the tone badge.
  // The fallback text is deliberately generic — the strict-mode bar
  // wasn't met, so we don't pretend otherwise.
  return {
    feedback:
      "Area 1: Consistency — your scoring curve has room to steady out across the run. " +
      "Area 2: Recovery — mid-run dips cost more than bursts win back. " +
      "Tip: Pace the opening so the late run stays clean.",
    tone: "encouraging",
  };
}
