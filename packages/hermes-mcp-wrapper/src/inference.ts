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

export function createOpenRouterInference(opts: {
  apiKey: string;
  model: HermesModel;
  baseUrl?: string;
}): InferenceFn {
  const openrouter = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseUrl ?? DEFAULT_BASE_URL,
  });
  return ({ messages, tools, signal }) =>
    openrouter.chat.completions.create(
      {
        model: opts.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: DETERMINISTIC_TEMPERATURE,
        seed: DETERMINISTIC_SEED,
      },
      { signal },
    );
}
