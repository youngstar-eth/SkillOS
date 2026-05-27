// Integration smoke test for @skillos/hermes-mcp-wrapper.
//
// SKIPPED BY DEFAULT — this test hits OpenRouter live and would
// spuriously fail in CI without a key. To run manually:
//
//   OPENROUTER_API_KEY=sk-or-... \
//     npx tsx --test tests/integration.smoke.test.ts
//
// The test exists so a single wire-identical roundtrip can be
// verified by hand after a code change, and so the test runner's
// shape matches Claude's MCP host integration tests when that
// surface stabilizes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createHermesMcpClient,
  type McpClientLike,
} from '../src/index.js';
import type { McpToolLike } from '../src/tools-bridge.js';

const HAS_KEY = typeof process.env.OPENROUTER_API_KEY === 'string' && process.env.OPENROUTER_API_KEY.length > 0;

describe('integration smoke (requires OPENROUTER_API_KEY)', () => {
  it.skip('roundtrips one MCP tool call via Hermes 3 :free tier', async () => {
    if (!HAS_KEY) {
      assert.fail('OPENROUTER_API_KEY env var required; run manually post-merge');
    }

    // A minimal MCP-client stand-in. The smoke test verifies the
    // *inference + tool-bridge* path against the real Hermes 3 model;
    // testing real MCP transport is a separate concern (covered by
    // the @skillos/mcp package's own integration tests).
    const tools: McpToolLike[] = [
      {
        name: 'echo',
        description: 'Echo the provided text back',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
    ];
    let echoCalled = false;
    const mcp: McpClientLike = {
      async connect() {
        /* no-op */
      },
      async listTools() {
        return { tools };
      },
      async callTool(req) {
        echoCalled = true;
        const args = req.arguments ?? {};
        return { content: [{ type: 'text', text: String((args as { text?: unknown }).text ?? '') }] };
      },
      async close() {
        /* no-op */
      },
    };

    const client = createHermesMcpClient(
      {
        openrouterApiKey: process.env.OPENROUTER_API_KEY!,
        model: 'nousresearch/hermes-3-llama-3.1-405b:free',
      },
      {
        transport: { kind: 'stdio', command: 'node', args: ['./never-runs.js'] },
        _mcp: mcp,
      },
    );

    await client.connect();
    const result = await client.run(
      'Call the echo tool with text="hello hermes". Then say "done".',
      { maxIterations: 4 },
    );
    await client.close();

    assert.equal(echoCalled, true, 'expected Hermes to call the echo tool');
    assert.equal(result.stoppedReason, 'no_more_tool_calls');
    assert.ok(result.iterations >= 2, 'expected at least one tool round-trip');
    assert.ok(result.usage.totalTokens > 0, 'expected non-zero token usage');
  });
});
