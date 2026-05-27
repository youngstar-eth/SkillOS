# X27 — Hermes 3 MCP Client Validation

**Status:** Research + design doc, read-only. No implementation in this workstream.
**Branch:** `chore/x27-hermes-mcp-validation`
**Date:** 2026-05-27 (Istanbul)
**Audience:** Workstream A (Hermes leg of the multi-agent demo)
**Recommendation summary:** Use **Hermes Agent (v0.14.0, Nous Research, MIT)** as the turnkey path if you want a full agent runtime with built-in MCP client. Build a **thin OpenRouter-backed TypeScript wrapper** (~150 LOC) if you only want an MCP client that loops `tools → Hermes 3 → tool_calls → MCP` and nothing else. Both paths point at the **same MCP transport Claude uses** (`@modelcontextprotocol/sdk` stdio + StreamableHTTP).

---

## 1. Direct check — does Nous publish a turnkey MCP client for Hermes 3?

**Yes.** Two relevant artifacts exist, both first-party from Nous Research:

| Artifact | Repo | Role | Verdict |
|---|---|---|---|
| **Hermes Agent** | [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) | Full Python agent runtime that runs on Hermes 3 / Hermes 4 and ships with built-in MCP client + can itself be exposed as MCP server. MIT licensed. Released Feb 2026, currently at v0.14.0. | **Production-ready turnkey.** |
| **Hermes-Function-Calling** | [`NousResearch/Hermes-Function-Calling`](https://github.com/NousResearch/Hermes-Function-Calling) | Reference inference scripts: `jsonmode.py` (Pydantic → JSON schema), function-calling templates, ChatML `<tool_call>` parsers. Not MCP-aware. | **Lower-level building block** — useful for wrapper path, not turnkey. |

### Hermes Agent — what it gives you out of the box

From [the MCP feature page](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp):

- **MCP client** — connects to external MCP servers at startup, discovers tools, registers them as first-class agent tools. Auto-reconnect with exponential backoff.
- **MCP server** — `hermes mcp serve` exposes Hermes Agent's conversation interface to other MCP clients.
- **Transports** — stdio (local subprocesses) and HTTP / StreamableHTTP (remote, with bearer-token or OAuth 2.1 PKCE).
- **CLI** — `hermes mcp install`, `hermes mcp configure`, `hermes mcp serve`.
- **Config** — `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  filesystem:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
```

- **Inference backends** (any OpenAI-compatible endpoint): Nous Portal, **OpenRouter (200+ models)**, NovitaAI, NVIDIA NIM (Nemotron), Hugging Face, OpenAI, custom endpoints. Local backends: Ollama, vLLM, llama.cpp.
- **License:** MIT. **Language:** Python (primary) + Node.js (for MCP server invocations via `npx`).

### Install

```bash
# Linux / macOS / WSL2 / Termux
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
# Optional MCP extras (already bundled in standard install)
cd ~/.hermes/hermes-agent && uv pip install -e ".[mcp]"
```

### Sample invocation (Hermes Agent → OpenRouter Hermes 3 405B + MCP tools)

`~/.hermes/config.yaml`:

```yaml
inference:
  provider: openrouter
  model: nousresearch/hermes-3-llama-3.1-405b
  api_key: ${OPENROUTER_API_KEY}

mcp_servers:
  skillos-x402:
    command: "node"
    args: ["./packages/duel-backend/dist/mcp-server.js"]
    transport: stdio
```

Then:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
hermes chat "Settle tournament T-42 if all rounds are done"
```

Hermes Agent will: connect to the `skillos-x402` MCP server, list tools, format them for Hermes 3's `<tool_call>` ChatML schema (OpenRouter normalizes to OpenAI `tools` over the wire), dispatch back into MCP, and loop.

---

## 2. If you don't want the full Hermes Agent runtime — the wrapper path

Hermes Agent ships with persistent memory, skill creation, a CLI surface, and a YAML-config worldview. If Workstream A only needs **the MCP-client loop** (tools → LLM → tool_calls → execute → repeat) and wants TS not Python, build a thin wrapper.

### 2.1 Wrapper architecture

```
┌──────────────────┐     ┌────────────────────────┐     ┌─────────────────┐
│ MCP server(s)    │◄────│ wrapper (TS)           │────►│ OpenRouter      │
│ stdio + HTTP     │     │ - @modelcontextprotocol│     │ POST /chat/     │
│ (skillos x402,   │     │   /sdk client          │     │   completions   │
│  fs, etc.)       │     │ - openai-sdk fetch     │     │ model:          │
└──────────────────┘     │ - tool_call ↔ MCP loop │     │   nousresearch/ │
                         └────────────────────────┘     │   hermes-3-...  │
                                                        └─────────────────┘
```

Key insight: **the official MCP TypeScript SDK (`@modelcontextprotocol/sdk`) is LLM-agnostic.** Anthropic's tutorial happens to call Anthropic Messages API, but the `mcp` portion (transports, `session.listTools()`, `session.callTool()`) doesn't depend on Anthropic — see the [official build-client tutorial](https://modelcontextprotocol.io/docs/develop/build-client) which separates `mcp` from `anthropic` package installs.

### 2.2 Skeleton scaffold — `packages/hermes-mcp-wrapper/`

Suggested location: a new workspace package under `packages/`, parallel to existing `packages/ai-coach/`. **Do not implement in this workstream** — this is design only.

```
packages/hermes-mcp-wrapper/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts             # public entry: createHermesClient(config)
│   ├── transport.ts         # MCP stdio + StreamableHTTP transport setup
│   ├── tool-format.ts       # MCP Tool → OpenAI tools[] adapter
│   ├── openrouter.ts        # thin fetch wrapper around POST /chat/completions
│   ├── loop.ts              # agentic loop: model → tool_calls → MCP → repeat
│   └── types.ts             # config + message shapes
└── README.md
```

**Dependencies** (3 runtime, all production-grade):

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "openai": "^4.0.0",
    "zod": "^3.23.0"
  }
}
```

> **Why `openai` SDK to call OpenRouter?** OpenRouter exposes an OpenAI-compatible `/chat/completions` endpoint, and the OpenAI SDK lets you point at it with `baseURL: "https://openrouter.ai/api/v1"` — no custom HTTP layer needed. Hermes 3 on OpenRouter accepts the OpenAI `tools` parameter; OpenRouter normalizes between OpenAI's `tool_calls` format and Hermes 3's native ChatML `<tool_call>` tags server-side.

### 2.3 Sample invocation (wrapper)

```ts
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import OpenAI from "openai";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./packages/duel-backend/dist/mcp-server.js"],
});

const mcp = new Client({ name: "hermes-wrapper", version: "0.1.0" });
await mcp.connect(transport);

const { tools } = await mcp.listTools();
// MCP tool shape → OpenAI tools[] shape
const openAITools = tools.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.inputSchema },
}));

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const messages: any[] = [{ role: "user", content: "Settle tournament T-42." }];

for (let i = 0; i < 10; i++) {
  const res = await openrouter.chat.completions.create({
    model: "nousresearch/hermes-3-llama-3.1-405b",
    messages,
    tools: openAITools,
  });
  const msg = res.choices[0].message;
  messages.push(msg);

  if (!msg.tool_calls?.length) break; // done

  for (const call of msg.tool_calls) {
    const result = await mcp.callTool({
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments),
    });
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result.content),
    });
  }
}
```

That's the whole loop. Total wrapper LOC estimate: ~150 with error handling + types + StreamableHTTP transport alternative.

### 2.4 MCP transport compatibility check

Both SDKs the wrapper would use (`@modelcontextprotocol/sdk` TS + the `mcp` Python package) ship `StdioClientTransport` and `StreamableHTTPClientTransport`. These are the **same** transports Claude Desktop / Claude Code use as MCP host. **No transport incompatibility found.** A wrapper-side client connecting to the SkillOS MCP server is wire-identical to Claude connecting to the same server.

---

## 3. Cost + budget analysis

| Variant | Input | Output | Context | Tool calling |
|---|---|---|---|---|
| `nousresearch/hermes-3-llama-3.1-405b` | $1.00 / 1M tok | $1.00 / 1M tok | 131K | ✅ |
| `nousresearch/hermes-3-llama-3.1-70b` | $0.30 / 1M tok | $0.30 / 1M tok | 131K | ✅ |
| `nousresearch/hermes-3-llama-3.1-405b:free` | $0 | $0 | 131K | ✅ (per model description) |

Demo budget assumption: a multi-agent demo round-trip with a few MCP tool calls is ≈ 30–80K tokens per turn including tool results, ≈ 5–15 turns per demo run. Worst-case per demo run on 405B paid: **~1.2M tokens × $1 = $1.20.** Full demo arc (5 rehearsals + 1 live): **<$10 even with paid tier.** Under the $5 STOP threshold if rehearsals are on `:free` and only live is on paid 405B, or if rehearsals use the 70B at $0.30/M.

**Recommended budget posture:** dev + rehearsals on `nousresearch/hermes-3-llama-3.1-405b:free` (weekly token cap exists, ~105M tokens/week — plenty); live demo run pinned to paid `405b` for latency stability.

**STOP escalation NOT triggered.** Cost is well within budget.

---

## 4. Recommended path for Workstream A

### Recommendation: **Hermes Agent (turnkey) if you want batteries, wrapper if you want surgical control.**

| Criterion | Hermes Agent | Wrapper |
|---|---|---|
| Time to first working demo | ~30 min (install + config.yaml + `hermes chat`) | ~half day (write the loop + tests) |
| Language fit with SkillOS monorepo | Python (foreign to TS workspace) | TypeScript (native fit) |
| Surface area to maintain | External binary install at `~/.hermes` | One workspace package, ~150 LOC |
| Persistent memory / skill creation | ✅ built-in (may be more than A needs) | ❌ (intentional — keep demo deterministic) |
| MCP feature parity with Claude host | ✅ stdio + StreamableHTTP + OAuth | ✅ stdio + StreamableHTTP (OAuth is extra work) |
| Risk of demo flake from extra Hermes Agent features (memory, auto-skills) | Non-zero | Zero |
| License | MIT | MIT (wrapper would be ISC/MIT matching monorepo) |

### Founder decision needed

**Primary recommendation: wrapper path**, because:

1. SkillOS monorepo is TypeScript-first. Bolting on a Python runtime in `~/.hermes` for a demo Hermes leg creates a heterogeneous local-dev surface the rest of the team has to support.
2. Hermes Agent's "agent that grows with you" framing (persistent memory + autonomous skill creation) is **demo-incompatible** — we want a deterministic Hermes 3 turn-loop, not an agent that develops opinions across runs.
3. ~150 LOC of wrapper is reviewable, debuggable, and ships in the same PR cadence as everything else in this repo.
4. The MCP transport story is wire-identical to Claude's, so the demo narrative ("same MCP transport, two different model brains") holds cleanly.

**Choose Hermes Agent IF** Workstream A also wants the demo to showcase agent persistence / memory / skill bootstrapping — i.e., if the storyline is *"look at what an agent runtime can do on its own,"* not *"look at two different LLM brains over the same MCP fabric."*

### Estimated effort

- **Wrapper path:** ~1 dev-day to implement `packages/hermes-mcp-wrapper/` + tests + a `scripts/x27-hermes-demo.ts` runner. Wrapper itself ≈ 150 LOC; tests ≈ 200 LOC mocking MCP `listTools` / `callTool` + OpenRouter `chat.completions.create`.
- **Hermes Agent path:** ~2 hours to install, write `config.yaml`, and verify a tool round-trip against an existing SkillOS MCP server. Zero new code in this repo.

### Follow-up workstream proposal (founder decision required)

If wrapper path is chosen: open **X28 — `packages/hermes-mcp-wrapper` implementation**, scoped to:
- Implement `src/transport.ts`, `src/tool-format.ts`, `src/openrouter.ts`, `src/loop.ts`, `src/index.ts`
- Unit tests for the tool-format adapter + the loop's termination conditions
- One integration test against a real local MCP server (`@modelcontextprotocol/server-filesystem` is a safe target since it has no chain side-effects)
- Demo runner `scripts/x27-hermes-demo.ts` exercising one tool round-trip end-to-end

---

## 5. Constraint compliance check

- ✅ Read-only research + design doc, no implementation in this workstream.
- ✅ STOP thresholds **NOT** triggered: Hermes 3 405B paid is $1/M, demo cost well under $5; MCP transport compatibility confirmed (stdio + StreamableHTTP identical to Claude host).
- ⚠️ One uncertainty surfaced (not blocking): exact rate-limit behavior of `:free` tier on `nousresearch/hermes-3-llama-3.1-405b:free` is documented only as "Weekly Tokens: 105M" with no per-minute cap published. **Mitigation:** stage rehearsals against `:free`; if a 429 ever surfaces, fall back to paid 405b for that rehearsal.
- ✅ Single .md file as deliverable.

---

## 6. Sources

- [Hermes Agent — MCP feature docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [`NousResearch/hermes-agent` GitHub](https://github.com/NousResearch/hermes-agent)
- [`NousResearch/hermes-agent` v0.6.0 release notes](https://github.com/NousResearch/hermes-agent/blob/main/RELEASE_v0.6.0.md) (MCP-server mode introduction)
- [`NousResearch/hermes-agent` issue #342 — Hermes Agent as MCP Server](https://github.com/NousResearch/hermes-agent/issues/342)
- [Hermes 3 405B Instruct on OpenRouter](https://openrouter.ai/nousresearch/hermes-3-llama-3.1-405b)
- [Hermes 3 405B Instruct `:free` tier on OpenRouter](https://openrouter.ai/nousresearch/hermes-3-llama-3.1-405b:free)
- [Hermes 3 70B Instruct on OpenRouter](https://openrouter.ai/nousresearch/hermes-3-llama-3.1-70b)
- [Hermes-3-Llama-3.1-8B model card (function calling format)](https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B)
- [`NousResearch/Hermes-Function-Calling` reference scripts](https://github.com/NousResearch/Hermes-Function-Calling)
- [MCP — Build an MCP client tutorial](https://modelcontextprotocol.io/docs/develop/build-client)
- [`@modelcontextprotocol/sdk` TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [`modelcontextprotocol/python-sdk`](https://github.com/modelcontextprotocol/python-sdk)
- [`SPhillips1337/hermes-mcp` — third-party MCP bridge to Hermes Agent](https://github.com/SPhillips1337/hermes-mcp) (noted for completeness; not recommended — wraps Hermes Agent the runtime, not Hermes 3 the model)
