// Bridge between MCP tool definitions / results and the OpenAI
// function-calling shape Hermes 3 expects on OpenRouter.
//
// MCP `Tool` shape (per @modelcontextprotocol/sdk):
//   { name, description?, inputSchema: JSON Schema }
// OpenAI `ChatCompletionTool` shape:
//   { type: 'function', function: { name, description, parameters } }
//
// The two are isomorphic when `inputSchema` is already a JSON-Schema
// object literal (which is what every MCP server in the SkillOS
// monorepo emits today). The adapter is intentionally narrow — if the
// SDK ever changes the tool surface, the breakage shows up here, not
// scattered through the loop.

import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';

/** Subset of the MCP `Tool` we actually consume; matches the SDK's `Tool` type. */
export interface McpToolLike {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Subset of the MCP `CallToolResult` we actually consume. The SDK's
 * actual return type is a union of the modern shape (`content`) and a
 * deprecated compatibility shape (`toolResult`); we widen both fields
 * to optional so either survives the bridge intact.
 */
export interface McpCallToolResultLike {
  content?: unknown;
  toolResult?: unknown;
  isError?: boolean;
}

export function mcpToolsToOpenAI(tools: ReadonlyArray<McpToolLike>): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema,
    },
  }));
}

/**
 * Parse the JSON-encoded `arguments` field on an OpenAI tool call.
 * Returns `{ ok: true, value }` on success or `{ ok: false, error }`
 * so the loop can surface a structured tool error back to the model
 * instead of crashing on malformed JSON.
 */
export function parseToolCallArguments(
  call: ChatCompletionMessageToolCall,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  // OpenAI v4 SDK union includes both function and custom tool calls;
  // we only handle function-shaped calls. Use a runtime guard.
  const raw = 'function' in call ? call.function.arguments : '';
  if (!raw) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `tool arguments must decode to a JSON object, got ${typeof parsed}` };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: `failed to parse tool arguments as JSON: ${(e as Error).message}` };
  }
}

/** Format an MCP `callTool` result as the `role: 'tool'` message Hermes expects. */
export function mcpResultToToolMessage(
  toolCallId: string,
  result: McpCallToolResultLike,
): ChatCompletionToolMessageParam {
  // `content` is what the MCP server returned (usually an array of
  // content blocks). Stringify it so the model sees the raw payload;
  // marshalling structured blocks back into chat parts is out of
  // scope for v0.1.0 (X25 demo only needs JSON tool round-trips).
  // Fall back to `toolResult` for SDK back-compat results.
  const payload = result.content ?? result.toolResult ?? null;
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify(payload),
  };
}

/** Format a parse error as a tool message so the loop can hand it back to the model. */
export function toolErrorToToolMessage(
  toolCallId: string,
  error: string,
): ChatCompletionToolMessageParam {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify({ error }),
  };
}
