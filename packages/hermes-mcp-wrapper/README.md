# @skillos/hermes-mcp-wrapper

Thin TypeScript wrapper exposing **Nous Research Hermes 3** (served by
OpenRouter) behind a wire-identical MCP client surface, so multi-agent
demos can swap Hermes in alongside Claude over the same
`@modelcontextprotocol/sdk` transport.

## What this is

- **One** function: `createHermesMcpClient(config, factoryOpts)`.
- **One** runtime dep stack: `@modelcontextprotocol/sdk`, `openai` (for
  OpenRouter), `zod`.
- **Deterministic by default:** `temperature: 0`, `seed: 42`, no
  persistent memory or skill state — re-running the same prompt against
  the same MCP-tool fixture produces the same Hermes 3 output.
- **Wire-identical to Claude's MCP host:** the same SDK, the same
  stdio + StreamableHTTP transports, the same `listTools` / `callTool`
  shapes.

## What this is *not*

- Not a Claude replacement — the wrapper has no Anthropic API surface.
- Not the [Nous Hermes Agent](https://hermes-agent.nousresearch.com/)
  runtime (which adds persistent memory, skill creation, and a Python
  CLI). If you want batteries, install that. This wrapper is the
  surgical, deterministic, TS-native alternative.
- Not currently published to npm — it's a private workspace package.

Design reference: `docs/hermes-mcp-validation.md` §2 + §4 (sourced
from PR #169 / `chore/x27-hermes-mcp-validation`).

## Install

Workspace-internal:

```jsonc
// in your app's package.json
{
  "dependencies": {
    "@skillos/hermes-mcp-wrapper": "*"
  }
}
```

Then `npm install` at the monorepo root.

## Usage

### Minimal — one prompt, one tool round-trip

```ts
import { createHermesMcpClient } from '@skillos/hermes-mcp-wrapper';

const client = createHermesMcpClient(
  {
    openrouterApiKey: process.env.OPENROUTER_API_KEY!,
    model: 'nousresearch/hermes-3-llama-3.1-405b',
  },
  {
    transport: {
      kind: 'stdio',
      command: 'node',
      args: ['./packages/mcp/dist/index.js'],
      env: { ...process.env } as Record<string, string>,
    },
  },
);

await client.connect();
const result = await client.run(
  'Register a new agent for wallet 0xabc on ERC-8004, then settle tournament T-42.',
);
console.log(result.finalContent);
console.log('iterations:', result.iterations);
console.log('tokens:', client.getTokenUsage());
await client.close();
```

### Drop-in for the X25 Hermes vs Claude demo

The X25 demo orchestrator (`scripts/create-hermes-vs-claude-demo.ts`,
on branch `chore/x25-hermes-demo-orchestration`) needs *the same MCP
client surface for both legs* so the Hermes and Claude agents are
truly comparable. The wrapper's `client.mcp` field exposes the raw
`@modelcontextprotocol/sdk` `Client`, so anywhere the demo script
expects a Claude-side MCP client it can pass `client.mcp` directly:

<details>
<summary><strong>Drop-in shape</strong> — click to expand</summary>

```ts
import { createHermesMcpClient } from '@skillos/hermes-mcp-wrapper';
// Hypothetical existing Claude leg, kept for shape parity:
// import { createClaudeMcpClient } from './claude-leg';

// Both legs share the same MCP server (skillos), differ only in the
// model brain. The X25 orchestrator can iterate over a uniform
// "agent" shape: { mcp: Client, connect, run, close }.

const hermes = createHermesMcpClient(
  {
    openrouterApiKey: process.env.OPENROUTER_API_KEY!,
    model: 'nousresearch/hermes-3-llama-3.1-405b',
  },
  {
    transport: {
      kind: 'stdio',
      command: 'node',
      args: ['./packages/mcp/dist/index.js'],
    },
  },
);

// const claude = createClaudeMcpClient({ ... });
// const agents = [hermes, claude];

await hermes.connect();
const hermesResult = await hermes.run(
  'Submit a Match3 score of 9000 for tournament T-1 and report what you observe.',
);
// await claude.connect();
// const claudeResult = await claude.run(/* same prompt */);

console.log({ hermesIterations: hermesResult.iterations });
await hermes.close();
```

</details>

### Switching transports

```ts
// StreamableHTTP (for remote MCP servers):
const client = createHermesMcpClient(config, {
  transport: {
    kind: 'streamableHttp',
    url: 'https://your-mcp-server.example.com/mcp',
    headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
});
```

## Configuration

| Field | Type | Default | Notes |
|---|---|---|---|
| `openrouterApiKey` | `string` | — | Required. `sk-or-...`. |
| `model` | `HermesModel` | — | One of the three validated Hermes 3 ids, or any OpenRouter model string for forward compat. |
| `baseUrl` | `string` | `https://openrouter.ai/api/v1` | Override for self-hosted OpenAI-compatible endpoints. |
| `clientName` / `clientVersion` | `string` | `hermes-mcp-wrapper` / `0.1.0` | Sent in MCP `initialize`. |
| `costWarningThresholdUsd` | `number` | `2` | One-shot `console.warn` when crossed. The wrapper never throws on cost. |

Run options (per `run()` call):

| Field | Type | Default | Notes |
|---|---|---|---|
| `maxIterations` | `number` | `10` | Hard cap on model→tool→model turns. |
| `systemPrompt` | `string` | — | Optional system message injected first. |
| `signal` | `AbortSignal` | — | Forwarded to the underlying OpenRouter fetch. |

## Determinism + cost

- `temperature: 0`, `seed: 42` are hard-coded for repeatability. If
  you need stochastic output, fork the package; configurability would
  defeat the demo guarantee.
- Cost is estimated from a hard-coded per-model pricing table sourced
  from OpenRouter (see `src/inference.ts`). Unknown models default to
  $0/token so cost tracking degrades gracefully rather than crashing.
- For dev + rehearsals, pin `model: 'nousresearch/hermes-3-llama-3.1-405b:free'`
  (105M tokens/week, no per-call cost). For live demos, switch to the
  paid `405b` for latency stability.

## Testing

### Unit tests (no network)

```bash
npm run test --workspace @skillos/hermes-mcp-wrapper
```

16 tests covering the tools bridge, inference helpers, and the
agentic loop (single tool, multi-tool sequence, OpenRouter error,
MCP error, max-iteration bailout, cumulative usage).

### Integration smoke test (real OpenRouter)

Skipped by default. To run manually:

```bash
OPENROUTER_API_KEY=sk-or-... \
  npx tsx --test \
  packages/hermes-mcp-wrapper/tests/integration.smoke.test.ts
```

Hits the `:free` tier (zero cost) and exercises one full tool
round-trip end-to-end.

## Architecture

```
┌──────────────────┐     ┌────────────────────────────┐     ┌─────────────────┐
│ MCP server(s)    │◄────│ @skillos/hermes-mcp-wrapper│────►│ OpenRouter      │
│ stdio + HTTP     │     │ - @modelcontextprotocol    │     │ POST /chat/     │
│ (skillos,        │     │   /sdk Client              │     │   completions   │
│  fs, etc.)       │     │ - openai SDK → OpenRouter  │     │ model:          │
└──────────────────┘     │ - mcp↔openai tools bridge  │     │   nousresearch/ │
                         │ - agentic loop (run())     │     │   hermes-3-...  │
                         └────────────────────────────┘     └─────────────────┘
```

## License

MIT.
