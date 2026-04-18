// Anthropic client — lazy-initialised so importing this module in a
// build/tsc pass without ANTHROPIC_API_KEY set doesn't throw. The constructor
// only runs the first time a caller actually asks for the client.

import Anthropic from "@anthropic-ai/sdk";

// Daily Challenge calls are quality-sensitive (one per game per day), so we
// run them through Sonnet. AI Coach runs on every game-over tap; keep it on
// Haiku for cost + latency.
export const CHALLENGE_MODEL = "claude-sonnet-4-6";
export const COACH_MODEL = "claude-haiku-4-5";

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — required for AI layer (daily challenges / coach).",
    );
  }
  _client = new Anthropic({ apiKey: key });
  return _client;
}
