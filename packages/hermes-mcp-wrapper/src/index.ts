// `@skillos/hermes-mcp-wrapper` — public entry.
//
// `createHermesMcpClient(config)` returns a stateless, deterministic
// agentic loop around Nous Research Hermes 3 (served by OpenRouter)
// that talks to MCP servers over the same `@modelcontextprotocol/sdk`
// transports Claude's MCP host uses. The returned `mcp` is a real
// `Client`, so callers expecting Claude's surface (`.listTools()`,
// `.callTool()`, `.close()`) drop in unchanged.
//
// Design reference: docs/hermes-mcp-validation.md §2 + §4 (sourced
// from PR #169 / `chore/x27-hermes-mcp-validation`).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

import {
  createOpenRouterInference,
  estimateCostUsd,
  type InferenceFn,
} from './inference.js';
import { createTransport } from './mcp-transport.js';
import {
  mcpResultToToolMessage,
  mcpToolsToOpenAI,
  parseToolCallArguments,
  toolErrorToToolMessage,
  type McpCallToolResultLike,
  type McpToolLike,
} from './tools-bridge.js';
import type {
  HermesMcpClient,
  HermesMcpClientConfig,
  RunOptions,
  RunResult,
  TokenUsage,
  TransportConfig,
} from './types.js';

/**
 * Internal subset of the MCP `Client` API the wrapper actually calls.
 * Exposed as an injection seam (`_mcp`) so unit tests can drive the
 * agentic loop without spawning a real MCP server.
 */
export interface McpClientLike {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools: McpToolLike[] }>;
  callTool(req: { name: string; arguments?: Record<string, unknown> }): Promise<McpCallToolResultLike>;
  close(): Promise<void>;
}

export * from './types.js';
export { estimateCostUsd } from './inference.js';
export {
  mcpToolsToOpenAI,
  parseToolCallArguments,
  mcpResultToToolMessage,
} from './tools-bridge.js';

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_COST_WARNING_USD = 2;

/** Factory options. `transport` is required; the rest are internal/test seams. */
export interface FactoryOptions {
  transport: TransportConfig;
  /** @internal Test seam: inject a fake `InferenceFn` instead of hitting OpenRouter. */
  _inference?: InferenceFn;
  /** @internal Test seam: inject a fake MCP client instead of constructing one. */
  _mcp?: McpClientLike;
}

export function createHermesMcpClient(
  config: HermesMcpClientConfig,
  factoryOpts: FactoryOptions,
): HermesMcpClient {
  const inference: InferenceFn =
    factoryOpts._inference ??
    createOpenRouterInference({
      apiKey: config.openrouterApiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    });

  const mcp: McpClientLike =
    factoryOpts._mcp ??
    (new Client(
      {
        name: config.clientName ?? 'hermes-mcp-wrapper',
        version: config.clientVersion ?? '0.1.0',
      },
      { capabilities: {} },
    ) as unknown as McpClientLike);

  let connected = false;
  let closed = false;
  let toolsCache: ChatCompletionTool[] | null = null;
  const costWarningThreshold = config.costWarningThresholdUsd ?? DEFAULT_COST_WARNING_USD;
  let warnedAboveThreshold = false;
  const cumulative: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };

  async function connect(): Promise<void> {
    if (connected) return;
    await mcp.connect(createTransport(factoryOpts.transport));
    connected = true;
  }

  async function loadTools(): Promise<ChatCompletionTool[]> {
    if (toolsCache) return toolsCache;
    const { tools } = await mcp.listTools();
    toolsCache = mcpToolsToOpenAI(tools);
    return toolsCache;
  }

  async function run(userPrompt: string, options: RunOptions = {}): Promise<RunResult> {
    if (!connected) await connect();
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const tools = await loadTools();
    const messages: ChatCompletionMessageParam[] = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const runUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };

    for (let i = 1; i <= maxIterations; i++) {
      const completion = await inference({ messages, tools, signal: options.signal });
      const choice = completion.choices[0];
      if (!choice) throw new Error('OpenRouter returned no choices');
      const msg = choice.message;
      messages.push(msg);

      // Accumulate usage (OpenRouter mirrors OpenAI's `usage` field).
      if (completion.usage) {
        runUsage.promptTokens += completion.usage.prompt_tokens;
        runUsage.completionTokens += completion.usage.completion_tokens;
        runUsage.totalTokens += completion.usage.total_tokens;
      }

      // Terminal: no tool calls → we have the final assistant content.
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        runUsage.estimatedCostUsd = estimateCostUsd(
          config.model,
          runUsage.promptTokens,
          runUsage.completionTokens,
        );
        commitUsage(runUsage);
        return {
          finalContent: msg.content ?? null,
          iterations: i,
          stoppedReason: 'no_more_tool_calls',
          usage: runUsage,
        };
      }

      // Dispatch each tool call back through MCP.
      for (const call of msg.tool_calls) {
        if (!('function' in call)) continue;
        const parsed = parseToolCallArguments(call);
        if (!parsed.ok) {
          messages.push(toolErrorToToolMessage(call.id, parsed.error));
          continue;
        }
        try {
          const result = await mcp.callTool({
            name: call.function.name,
            arguments: parsed.value,
          });
          messages.push(mcpResultToToolMessage(call.id, result));
        } catch (e) {
          messages.push(
            toolErrorToToolMessage(call.id, `MCP callTool failed: ${(e as Error).message}`),
          );
        }
      }
    }

    runUsage.estimatedCostUsd = estimateCostUsd(
      config.model,
      runUsage.promptTokens,
      runUsage.completionTokens,
    );
    commitUsage(runUsage);
    return {
      finalContent: null,
      iterations: maxIterations,
      stoppedReason: 'max_iterations',
      usage: runUsage,
    };
  }

  function commitUsage(delta: TokenUsage): void {
    cumulative.promptTokens += delta.promptTokens;
    cumulative.completionTokens += delta.completionTokens;
    cumulative.totalTokens += delta.totalTokens;
    cumulative.estimatedCostUsd += delta.estimatedCostUsd;
    if (!warnedAboveThreshold && cumulative.estimatedCostUsd > costWarningThreshold) {
      warnedAboveThreshold = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[hermes-mcp-wrapper] cumulative cost $${cumulative.estimatedCostUsd.toFixed(4)} crossed threshold $${costWarningThreshold}`,
      );
    }
  }

  function getTokenUsage(): TokenUsage {
    return { ...cumulative };
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    await mcp.close();
  }

  // In production `mcp` is a real `Client`; the `McpClientLike` view
  // is only used internally for testability. Cast back at the boundary.
  return { mcp: mcp as unknown as Client, connect, run, getTokenUsage, close };
}
