// Unit tests for @skillos/hermes-mcp-wrapper.
//
// Run from package dir:  npx tsx --test tests/wrapper.test.ts
//
// Coverage (per X29 sprint prompt deliverable 6):
//   1. Mock OpenRouter response → MCP tool call extraction correct
//   2. Mock multi-tool sequence (agent_register → submit_score) →
//      assert state-free, deterministic
//   3. Mock OpenRouter timeout/error → MCP-formatted error surfacing
// Plus: pure-function coverage for tools-bridge + inference helpers.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import type { ChatCompletion } from 'openai/resources/chat/completions';

import {
  createHermesMcpClient,
  type FactoryOptions,
  type McpClientLike,
} from '../src/index.js';
import {
  mcpToolsToOpenAI,
  parseToolCallArguments,
  mcpResultToToolMessage,
  toolErrorToToolMessage,
} from '../src/tools-bridge.js';
import { estimateCostUsd, DEFAULT_BASE_URL } from '../src/inference.js';
import type { McpToolLike, McpCallToolResultLike } from '../src/tools-bridge.js';

// ---------- helpers ---------------------------------------------------------

/** Build a synthetic ChatCompletion that emits N tool calls then stops. */
function fakeCompletion(opts: {
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  content?: string | null;
  promptTokens?: number;
  completionTokens?: number;
}): ChatCompletion {
  const toolCalls = opts.toolCalls ?? [];
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'nousresearch/hermes-3-llama-3.1-405b',
    choices: [
      {
        index: 0,
        finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
        logprobs: null,
        message: {
          role: 'assistant',
          content: opts.content ?? null,
          refusal: null,
          tool_calls: toolCalls.length
            ? toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: c.arguments },
              }))
            : undefined,
        } as ChatCompletion['choices'][number]['message'],
      },
    ],
    usage: {
      prompt_tokens: opts.promptTokens ?? 10,
      completion_tokens: opts.completionTokens ?? 5,
      total_tokens: (opts.promptTokens ?? 10) + (opts.completionTokens ?? 5),
    },
  };
}

/** Build a fake MCP client whose `callTool` returns scripted results in order. */
function fakeMcp(opts: {
  tools: McpToolLike[];
  callResults?: McpCallToolResultLike[];
  callError?: Error;
}): McpClientLike & { calls: Array<{ name: string; arguments?: Record<string, unknown> }> } {
  const calls: Array<{ name: string; arguments?: Record<string, unknown> }> = [];
  const results = [...(opts.callResults ?? [])];
  return {
    calls,
    async connect() {
      /* no-op */
    },
    async listTools() {
      return { tools: opts.tools };
    },
    async callTool(req) {
      calls.push(req);
      if (opts.callError) throw opts.callError;
      const next = results.shift();
      return next ?? { content: [{ type: 'text', text: 'ok' }] };
    },
    async close() {
      /* no-op */
    },
  };
}

const BASE_CONFIG = {
  openrouterApiKey: 'sk-or-fake',
  model: 'nousresearch/hermes-3-llama-3.1-405b:free' as const,
};

const STDIO_TRANSPORT: FactoryOptions['transport'] = {
  kind: 'stdio',
  command: 'node',
  args: ['./never-runs.js'],
};

// ---------- pure-function tests ---------------------------------------------

describe('tools-bridge', () => {
  it('maps MCP tools to OpenAI function-calling shape', () => {
    const tools: McpToolLike[] = [
      {
        name: 'agent_register',
        description: 'Register an agent on ERC-8004',
        inputSchema: { type: 'object', properties: { wallet: { type: 'string' } }, required: ['wallet'] },
      },
    ];
    const out = mcpToolsToOpenAI(tools);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.type, 'function');
    assert.equal(out[0]!.function.name, 'agent_register');
    assert.equal(out[0]!.function.description, 'Register an agent on ERC-8004');
    assert.deepEqual(out[0]!.function.parameters, tools[0]!.inputSchema);
  });

  it('parses valid JSON tool arguments', () => {
    const out = parseToolCallArguments({
      id: 'call_1',
      type: 'function',
      function: { name: 'x', arguments: '{"a":1,"b":"two"}' },
    });
    assert.equal(out.ok, true);
    if (out.ok) assert.deepEqual(out.value, { a: 1, b: 'two' });
  });

  it('rejects non-object JSON tool arguments', () => {
    const out = parseToolCallArguments({
      id: 'call_1',
      type: 'function',
      function: { name: 'x', arguments: '[1,2,3]' },
    });
    assert.equal(out.ok, false);
  });

  it('rejects malformed JSON tool arguments with structured error', () => {
    const out = parseToolCallArguments({
      id: 'call_1',
      type: 'function',
      function: { name: 'x', arguments: '{not json' },
    });
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /failed to parse/);
  });

  it('treats empty arguments as empty object', () => {
    const out = parseToolCallArguments({
      id: 'call_1',
      type: 'function',
      function: { name: 'x', arguments: '' },
    });
    assert.equal(out.ok, true);
    if (out.ok) assert.deepEqual(out.value, {});
  });

  it('formats MCP result as role=tool message', () => {
    const msg = mcpResultToToolMessage('call_42', {
      content: [{ type: 'text', text: 'agentId=7' }],
    });
    assert.equal(msg.role, 'tool');
    assert.equal(msg.tool_call_id, 'call_42');
    assert.equal(typeof msg.content, 'string');
    assert.match(msg.content as string, /agentId=7/);
  });

  it('formats tool error as role=tool message', () => {
    const msg = toolErrorToToolMessage('call_X', 'boom');
    assert.equal(msg.role, 'tool');
    assert.equal(msg.tool_call_id, 'call_X');
    assert.deepEqual(JSON.parse(msg.content as string), { error: 'boom' });
  });
});

describe('inference helpers', () => {
  it('estimates cost from per-1M-token pricing table', () => {
    // 1M input + 1M output on 405b paid = $2
    const cost = estimateCostUsd('nousresearch/hermes-3-llama-3.1-405b', 1_000_000, 1_000_000);
    assert.equal(cost, 2);
  });

  it('treats :free tier as zero cost', () => {
    const cost = estimateCostUsd('nousresearch/hermes-3-llama-3.1-405b:free', 1_000_000, 1_000_000);
    assert.equal(cost, 0);
  });

  it('exposes OpenRouter base URL as a stable constant', () => {
    assert.equal(DEFAULT_BASE_URL, 'https://openrouter.ai/api/v1');
  });
});

// ---------- agentic loop tests (mocked) -------------------------------------

describe('createHermesMcpClient — agentic loop', () => {
  const TOOLS: McpToolLike[] = [
    {
      name: 'agent_register',
      description: 'Register an agent',
      inputSchema: { type: 'object', properties: { wallet: { type: 'string' } } },
    },
    {
      name: 'submit_score',
      description: 'Submit a score',
      inputSchema: {
        type: 'object',
        properties: { tournament: { type: 'string' }, score: { type: 'number' } },
      },
    },
  ];

  it('extracts a single MCP tool call and dispatches it (deliverable 6.1)', async () => {
    let inferenceCalls = 0;
    const inference = async (): Promise<ChatCompletion> => {
      inferenceCalls++;
      if (inferenceCalls === 1) {
        return fakeCompletion({
          toolCalls: [{ id: 'c1', name: 'agent_register', arguments: '{"wallet":"0xabc"}' }],
        });
      }
      return fakeCompletion({ content: 'agent registered, agentId=42' });
    };
    const mcp = fakeMcp({
      tools: TOOLS,
      callResults: [{ content: [{ type: 'text', text: '{"agentId":42}' }] }],
    });
    const client = createHermesMcpClient(BASE_CONFIG, {
      transport: STDIO_TRANSPORT,
      _inference: inference,
      _mcp: mcp,
    });
    await client.connect();
    const result = await client.run('Register agent for 0xabc');

    assert.equal(result.stoppedReason, 'no_more_tool_calls');
    assert.equal(result.iterations, 2);
    assert.equal(result.finalContent, 'agent registered, agentId=42');
    assert.equal(mcp.calls.length, 1);
    assert.equal(mcp.calls[0]!.name, 'agent_register');
    assert.deepEqual(mcp.calls[0]!.arguments, { wallet: '0xabc' });
  });

  it('runs a multi-tool sequence (agent_register → submit_score) statelessly (deliverable 6.2)', async () => {
    const scripts: Array<() => ChatCompletion> = [
      () => fakeCompletion({ toolCalls: [{ id: 'c1', name: 'agent_register', arguments: '{"wallet":"0x1"}' }] }),
      () => fakeCompletion({ toolCalls: [{ id: 'c2', name: 'submit_score', arguments: '{"tournament":"T1","score":9000}' }] }),
      () => fakeCompletion({ content: 'done' }),
    ];

    async function runOnce(): Promise<{
      calls: Array<{ name: string; arguments?: Record<string, unknown> }>;
      finalContent: string | null;
    }> {
      let i = 0;
      const inference = async () => scripts[i++]!();
      const mcp = fakeMcp({
        tools: TOOLS,
        callResults: [
          { content: [{ type: 'text', text: '{"agentId":1}' }] },
          { content: [{ type: 'text', text: '{"ok":true}' }] },
        ],
      });
      const client = createHermesMcpClient(BASE_CONFIG, {
        transport: STDIO_TRANSPORT,
        _inference: inference,
        _mcp: mcp,
      });
      const res = await client.run('do the demo');
      return { calls: mcp.calls, finalContent: res.finalContent };
    }

    // Determinism: two independent runs of the same fixture produce identical
    // tool-call sequences and identical final content (no shared wrapper state).
    const a = await runOnce();
    const b = await runOnce();
    assert.deepEqual(a.calls, b.calls);
    assert.equal(a.finalContent, b.finalContent);
    assert.equal(a.calls.length, 2);
    assert.equal(a.calls[0]!.name, 'agent_register');
    assert.equal(a.calls[1]!.name, 'submit_score');
    assert.equal(a.finalContent, 'done');
  });

  it('surfaces OpenRouter errors as a thrown error (deliverable 6.3a)', async () => {
    const inference = async (): Promise<ChatCompletion> => {
      throw new Error('openrouter timeout');
    };
    const mcp = fakeMcp({ tools: TOOLS });
    const client = createHermesMcpClient(BASE_CONFIG, {
      transport: STDIO_TRANSPORT,
      _inference: inference,
      _mcp: mcp,
    });
    await assert.rejects(() => client.run('try'), /openrouter timeout/);
  });

  it('surfaces MCP callTool failures as MCP-formatted error fed back to the model (deliverable 6.3b)', async () => {
    // First model turn requests a tool; MCP call throws; second turn observes
    // the structured error in the conversation and emits final content.
    const observedMessages: unknown[] = [];
    let turn = 0;
    const inference = async (params: {
      messages: unknown[];
    }): Promise<ChatCompletion> => {
      observedMessages.push(...params.messages);
      turn++;
      if (turn === 1) {
        return fakeCompletion({
          toolCalls: [{ id: 'c1', name: 'agent_register', arguments: '{"wallet":"0xfail"}' }],
        });
      }
      return fakeCompletion({ content: 'recovered' });
    };
    const mcp = fakeMcp({ tools: TOOLS, callError: new Error('chain rejected') });
    const client = createHermesMcpClient(BASE_CONFIG, {
      transport: STDIO_TRANSPORT,
      _inference: inference,
      _mcp: mcp,
    });
    const result = await client.run('register');
    assert.equal(result.finalContent, 'recovered');

    // The tool error appears as a role=tool message in the second-turn input.
    const toolErrorMessage = observedMessages.find(
      (m): m is { role: string; content: string } =>
        typeof m === 'object' && m !== null && (m as { role?: string }).role === 'tool',
    );
    assert.ok(toolErrorMessage, 'expected a role=tool error message in second-turn input');
    const decoded = JSON.parse(toolErrorMessage.content) as { error?: string };
    assert.match(decoded.error ?? '', /chain rejected/);
  });

  it('stops at maxIterations if the model never emits a terminal turn', async () => {
    // Model keeps requesting tool calls forever; loop must bail at maxIterations.
    const inference = async (): Promise<ChatCompletion> =>
      fakeCompletion({
        toolCalls: [{ id: 'c1', name: 'agent_register', arguments: '{}' }],
      });
    const mcp = fakeMcp({
      tools: TOOLS,
      // Provide an inexhaustible-ish result stream.
      callResults: Array.from({ length: 20 }, () => ({ content: [{ type: 'text', text: 'ok' }] })),
    });
    const client = createHermesMcpClient(BASE_CONFIG, {
      transport: STDIO_TRANSPORT,
      _inference: inference,
      _mcp: mcp,
    });
    const result = await client.run('loop forever', { maxIterations: 3 });
    assert.equal(result.stoppedReason, 'max_iterations');
    assert.equal(result.iterations, 3);
    assert.equal(result.finalContent, null);
  });

  it('accumulates cumulative token usage across multiple run() calls', async () => {
    const inference = async (): Promise<ChatCompletion> =>
      fakeCompletion({ content: 'hi', promptTokens: 100, completionTokens: 50 });
    const mcp = fakeMcp({ tools: TOOLS });
    const client = createHermesMcpClient(BASE_CONFIG, {
      transport: STDIO_TRANSPORT,
      _inference: inference,
      _mcp: mcp,
    });
    await client.run('1');
    await client.run('2');
    const usage = client.getTokenUsage();
    assert.equal(usage.promptTokens, 200);
    assert.equal(usage.completionTokens, 100);
    assert.equal(usage.totalTokens, 300);
    // :free tier → cost is zero regardless of token volume
    assert.equal(usage.estimatedCostUsd, 0);
  });
});
