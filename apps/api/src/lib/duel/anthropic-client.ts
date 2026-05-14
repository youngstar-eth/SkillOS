// Lazy Anthropic SDK singleton, scoped to apps/api.
//
// Mirrors packages/ai-coach/src/client.ts intentionally — apps/api avoids
// the @skillos/ai-coach workspace dep so this app stays a standalone deploy
// unit. If three+ apps need an Anthropic client we promote the singleton to
// a package; until then duplication is cheap.

import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Required for /v1/agents/matches/start-solo (X20).',
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

// Haiku 4.5 — chosen for X20 over Sonnet 4.6:
//   - latency: ~1 sec/move vs ~3 sec — fits 24-move match into 60s function
//   - cost: ~7x cheaper, demo loop runs cheaply during pitch reps
//   - quality: 2048 move selection is constraint-rich; reasoning chains aren't
//     long, so Sonnet's edge in deep planning doesn't recover the latency hit.
// Sonnet swap path: edit this constant + bump function maxDuration in vercel.json.
export const AGENT_MATCH_MODEL = 'claude-haiku-4-5';
export const AGENT_MATCH_MODEL_DISPLAY = 'Claude Haiku 4.5';
