import { anthropic, CHALLENGE_MODEL } from "./client";
import { CHALLENGE_PROMPTS } from "./prompts";
import type { Challenge, ChallengeData } from "./types";

/**
 * Ask Claude for today's daily challenge for a given game.
 *
 * Strips markdown code fences (Claude sometimes adds ```json even when we ask
 * it not to) and JSON.parse the body. Throws if the response doesn't match
 * the required top-level shape (`theme`, `data`, `description`) — callers
 * should catch and surface to the user with a safe fallback.
 */
export async function generateDailyChallenge(
  gameSlug: string,
  date: Date = new Date(),
): Promise<Challenge> {
  const promptFn = CHALLENGE_PROMPTS[gameSlug];
  if (!promptFn) {
    throw new Error(`No challenge prompt registered for game "${gameSlug}".`);
  }

  const dateStr = date.toISOString().split("T")[0];
  const prompt = promptFn(dateStr);

  const res = await anthropic().messages.create({
    model: CHALLENGE_MODEL,
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const firstBlock = res.content[0];
  const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
  if (!text) {
    throw new Error("Claude returned an empty challenge response.");
  }

  // Claude sometimes wraps JSON in ```json ... ``` fences. Strip them.
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Claude returned non-JSON challenge (first 200 chars): ${cleaned.slice(0, 200)}`,
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Challenge).theme !== "string" ||
    typeof (parsed as Challenge).description !== "string" ||
    typeof (parsed as Challenge).data !== "object"
  ) {
    throw new Error(
      `Challenge response missing required fields — got: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
  }

  return parsed as Challenge<ChallengeData>;
}
