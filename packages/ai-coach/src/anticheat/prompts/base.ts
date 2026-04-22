// ───────────────────────────────────────────────────────────────────────────
// Shared system-prompt scaffolding for the anti-cheat auditor.
//
// Unlike coach (second-person advice) and recap (third-person narrative),
// this one speaks to NOBODY — it's a private audit output consumed by the
// settle hook and, if flagged, the admin endpoint. The prompt emphasizes
// (a) structured JSON, (b) number-faithfulness, and (c) bias-toward-plausible.
// ───────────────────────────────────────────────────────────────────────────

import type { PlausibilityRequest, Verdict } from "../types";

export const ANTICHEAT_SYSTEM_BASE = `You are the Plausibility Check auditor for Skillbase, a paid head-to-head duel platform.

You receive a settled match summary and decide whether the scoreline is consistent with honest human play. This runs post-settle and does NOT block payouts — it flags matches for later human admin review only.

BIAS: when in doubt, return "plausible". False positives damage trust with winning players; false negatives get caught by humans downstream.

VERDICTS (lowercase enum, exactly one):
- "plausible"    — consistent with honest play for this game
- "suspicious"   — one or more numeric signals outside the normal band; admin glance recommended
- "implausible"  — physically or mathematically incompatible with honest human play; admin must review

CONFIDENCE: float 0..1. How sure you are in the verdict, not the fraud probability.

REASONING: 1–2 sentences. Must cite concrete numbers from the input. Never speculate beyond what the summary supports. Do not invent move counts, CPS, or other figures not present.

FLAGS: 0–4 short kebab-case labels (e.g. "speedrun-anomaly", "score-duration-ratio"). Omit entirely for "plausible". For "implausible", at least one flag must pair with a numeric anomaly cited in reasoning.

An "implausible" verdict REQUIRES a numeric anomaly explicitly cited — e.g. "score 8192 in 25s implies ~4000 swipes at >160/s, far beyond human ceiling."

OUTPUT FORMAT — respond with valid JSON only, matching exactly this shape:
{
  "verdict": "<plausible|suspicious|implausible>",
  "confidence": <float 0..1>,
  "reasoning": "<1–2 sentences, concrete numbers only>",
  "flags": ["<kebab-case>", ...]
}

No markdown fences. No prose before or after. Just the JSON object.`;

/**
 * Compact summary fed as the user turn. Mirrors summarizeRecapMatch in
 * shape but speaks to the auditor's need (ratio + duration, not drama).
 */
export function summarizeForAnticheat(req: PlausibilityRequest): string {
  const ratio =
    req.loserScore > 0 ? (req.winnerScore / req.loserScore).toFixed(2) : "∞";
  const delta = Math.abs(req.winnerScore - req.loserScore);
  const durationSec = Math.round(req.durationSeconds);
  const durationMin = (req.durationSeconds / 60).toFixed(2);

  const lines = [
    `Game: ${req.gameType}`,
    `Winner score: ${req.winnerScore}`,
    `Loser score: ${req.loserScore}`,
    `Score delta: ${delta}`,
    `Winner/loser ratio: ${ratio}`,
    `Duration: ${durationSec}s (${durationMin} min)`,
  ];

  if (
    req.gameSpecificData &&
    Object.keys(req.gameSpecificData).length > 0
  ) {
    lines.push(`Game-specific signals: ${JSON.stringify(req.gameSpecificData)}`);
  }

  return lines.join("\n");
}

export const VALID_VERDICTS: readonly Verdict[] = [
  "plausible",
  "suspicious",
  "implausible",
] as const;
