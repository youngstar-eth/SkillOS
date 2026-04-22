// ───────────────────────────────────────────────────────────────────────────
// Anthropic SDK client — lazy singleton.
//
// Design notes:
// - Lazy init: `new Anthropic({apiKey})` is cheap but doesn't validate the
//   key. Still, we defer creation until first use so simply importing this
//   package in a Next.js route (e.g. during build-time analysis) doesn't
//   require ANTHROPIC_API_KEY to be set. This matters for unrelated routes
//   and for test harnesses.
// - Explicit throw when env is missing: the SDK would silently 401 on first
//   request; throwing up-front with a helpful message shortens the debug
//   loop for the inevitable "forgot to sync env" moment.
// ───────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to the app's .env.local (local) " +
        "or to the Vercel project's production env (deploy).",
    );
  }

  _client = new Anthropic({ apiKey });
  return _client;
}
