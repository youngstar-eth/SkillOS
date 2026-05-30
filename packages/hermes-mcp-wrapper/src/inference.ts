// OpenRouter inference layer, fronted by the OpenAI SDK.
//
// Determinism: `temperature: 0` + fixed `seed: 42` so demo re-takes
// produce the same Hermes 3 output for the same MCP-tool sequence.
// (OpenRouter forwards both fields to the underlying provider; not
// every backend honors `seed`, but on Hermes 3 the combination is the
// strongest determinism guarantee available short of a local model.)

import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

import type { HermesModel } from './types.js';

export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
export const DETERMINISTIC_TEMPERATURE = 0;
export const DETERMINISTIC_SEED = 42;

/**
 * Per-1M-token pricing (USD) for the Hermes 3 variants we've validated.
 * Source: OpenRouter model pages (cross-checked in
 * docs/hermes-mcp-validation.md §3, sourced from PR #169).
 * Unknown models default to 0 so cost tracking degrades gracefully
 * rather than crashing.
 */
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'nousresearch/hermes-3-llama-3.1-405b': { input: 1.0, output: 1.0 },
  'nousresearch/hermes-3-llama-3.1-70b': { input: 0.3, output: 0.3 },
  'nousresearch/hermes-3-llama-3.1-405b:free': { input: 0, output: 0 },
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const rates = PRICING_PER_MILLION_TOKENS[model] ?? { input: 0, output: 0 };
  return (promptTokens * rates.input + completionTokens * rates.output) / 1_000_000;
}

export interface InferenceParams {
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  signal?: AbortSignal;
}

/**
 * Thin abstraction over `openai.chat.completions.create` so the agentic
 * loop in `index.ts` is trivially mockable: tests inject their own
 * `inference` function and never touch the real OpenAI SDK.
 */
export type InferenceFn = (params: InferenceParams) => Promise<ChatCompletion>;

/**
 * Identifies errors worth retrying. Network blips (ETIMEDOUT, ECONNRESET,
 * socket timeouts) and 5xx provider errors are transient. 4xx (auth,
 * rate-limit, bad request) are NOT retried — they'd loop forever.
 *
 * Added X32-5 after X32-4 broadcast: a single `read ETIMEDOUT` from
 * OpenRouter killed the DeepSeek leg of a real on-chain demo even
 * though Mistral had already submitted on-chain. Costing $40 USDC
 * sitting in a half-settled tournament was too steep for a transient
 * network blip.
 */
function isTransient(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; errno?: string; status?: number; type?: string; message?: string };
  if (e.code === 'ETIMEDOUT' || e.errno === 'ETIMEDOUT') return true;
  if (e.code === 'ECONNRESET' || e.errno === 'ECONNRESET') return true;
  if (e.code === 'ECONNREFUSED' || e.errno === 'ECONNREFUSED') return true;
  if (e.code === 'ENOTFOUND' || e.errno === 'ENOTFOUND') return true;
  if (e.type === 'system') return true; // node-fetch wraps low-level socket errors
  if (typeof e.status === 'number' && e.status >= 500 && e.status < 600) return true;
  // openai SDK surfaces socket timeouts via message text in some versions
  if (typeof e.message === 'string' && /\b(ETIMEDOUT|ECONNRESET|socket timeout|fetch.*failed)\b/i.test(e.message)) {
    return true;
  }
  return false;
}

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000]; // 3 attempts: 1s, 2s, 4s — exponential backoff
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

export function createOpenRouterInference(opts: {
  apiKey: string;
  model: HermesModel;
  baseUrl?: string;
}): InferenceFn {
  const openrouter = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseUrl ?? DEFAULT_BASE_URL,
  });
  return async ({ messages, tools, signal }) => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await openrouter.chat.completions.create(
          {
            model: opts.model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            temperature: DETERMINISTIC_TEMPERATURE,
            seed: DETERMINISTIC_SEED,
          },
          { signal },
        );
      } catch (err) {
        lastErr = err;
        if (!isTransient(err) || attempt === MAX_ATTEMPTS - 1) {
          // Non-transient or final attempt — bubble.
          throw err;
        }
        // eslint-disable-next-line no-console
        console.warn(
          `[hermes-mcp-wrapper] inference attempt ${attempt + 1}/${MAX_ATTEMPTS} failed (${(err as { code?: string; message?: string }).code ?? 'unknown'}); retrying in ${RETRY_DELAYS_MS[attempt]}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
    // Unreachable — every path through the loop either returns or throws.
    throw lastErr;
  };
}
