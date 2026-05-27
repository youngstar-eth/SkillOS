// Public configuration + return shapes for the Hermes MCP wrapper.
//
// The shapes here are deliberately small: the wrapper's value is wire-
// identical interchangeability with Claude's MCP host, not a new API.
// Anything Claude consumers expect (`mcp.listTools()`, `mcp.callTool()`,
// `mcp.close()`) is reachable directly off `HermesMcpClient.mcp`.

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Hermes 3 model identifiers exposed by OpenRouter. The three listed
 * here are the only ones we've validated against; arbitrary OpenRouter
 * model strings are permitted via `(string & {})` for forward compat.
 */
export type HermesModel =
  | 'nousresearch/hermes-3-llama-3.1-405b'
  | 'nousresearch/hermes-3-llama-3.1-70b'
  | 'nousresearch/hermes-3-llama-3.1-405b:free'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** Transport selection (discriminated union). */
export type TransportConfig =
  | {
      kind: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    }
  | {
      kind: 'streamableHttp';
      url: string;
      headers?: Record<string, string>;
    };

export interface HermesMcpClientConfig {
  /** OpenRouter API key (`sk-or-...`). */
  openrouterApiKey: string;
  /** Hermes 3 model id on OpenRouter. */
  model: HermesModel;
  /** Optional baseURL override (default `https://openrouter.ai/api/v1`). */
  baseUrl?: string;
  /** Optional client identity overrides for MCP `initialize`. */
  clientName?: string;
  clientVersion?: string;
  /**
   * Cumulative-cost warning threshold (USD). Default $2; the wrapper
   * logs a `console.warn` once when crossed. Settlement of the limit
   * is the caller's responsibility — the wrapper never throws on cost.
   */
  costWarningThresholdUsd?: number;
}

export interface RunOptions {
  /** Max agentic iterations (model → tool_calls → tool result → model). Default 10. */
  maxIterations?: number;
  /** Optional system prompt injected as the first message. */
  systemPrompt?: string;
  /** Abort signal for the underlying OpenRouter request(s). */
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated cumulative cost in USD across all `run()` calls on this client. */
  estimatedCostUsd: number;
}

export interface RunResult {
  /** Final assistant message content (may be null if the model only emitted tool calls and then ran out of iterations). */
  finalContent: string | null;
  /** Number of agentic iterations actually consumed. */
  iterations: number;
  /** Whether the loop terminated naturally (no further tool_calls) vs hit `maxIterations`. */
  stoppedReason: 'no_more_tool_calls' | 'max_iterations';
  /** Token usage for this single `run()` call. */
  usage: TokenUsage;
}

export interface HermesMcpClient {
  /** Underlying `@modelcontextprotocol/sdk` Client — wire-identical to Claude's host. */
  mcp: Client;
  /** Connects the MCP client over the configured transport. Idempotent. */
  connect(): Promise<void>;
  /**
   * Run the agentic loop: send `userPrompt` to Hermes 3, dispatch any
   * tool calls back through the MCP client, feed results back to the
   * model, repeat until no more tool calls or `maxIterations` is hit.
   */
  run(userPrompt: string, options?: RunOptions): Promise<RunResult>;
  /** Returns cumulative token usage across all `run()` calls. */
  getTokenUsage(): TokenUsage;
  /** Closes the MCP transport. Safe to call multiple times. */
  close(): Promise<void>;
}
