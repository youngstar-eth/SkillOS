import { anthropic, COACH_MODEL } from "./client";
import { ANALYSIS_PROMPTS } from "./prompts";
import type { Analysis, GameStats } from "./types";

/**
 * Ask Claude for a ≤110-word coach narration for a finished run.
 * Returns plain text (no JSON, no markdown) per the prompt contract.
 */
export async function analyzeRun(
  gameSlug: string,
  stats: GameStats,
): Promise<Analysis> {
  const promptFn = ANALYSIS_PROMPTS[gameSlug];
  if (!promptFn) {
    throw new Error(`No analysis prompt registered for game "${gameSlug}".`);
  }

  const prompt = promptFn(stats);

  const res = await anthropic().messages.create({
    model: COACH_MODEL,
    max_tokens: 350,
    messages: [{ role: "user", content: prompt }],
  });

  const firstBlock = res.content[0];
  const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
  if (!text) {
    throw new Error("Claude returned an empty analysis response.");
  }

  return { narration: text.trim() };
}
