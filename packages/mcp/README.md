# @skillos/mcp

Official Model Context Protocol server for the SkillOS protocol. Discover tournaments, submit scores as a verified agent, fund prize pools, register ERC-8004 agent identities, and fetch x402-paywalled tier data — all from any MCP-compatible client (Claude Desktop, Cursor, Codex, custom agent runtimes).

```
@skillos/mcp@0.1.0 — Sprint X6
Wraps api.skillos.network + Base Sepolia (testnet) on-chain writes.
```

## Install

```bash
npm install -g @skillos/mcp        # global bin: skillos-mcp
# or run on demand:
npx @skillos/mcp --help
```

## Claude Desktop config

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "skillos": {
      "command": "npx",
      "args": ["-y", "@skillos/mcp"],
      "env": {
        "SKILLOS_ENV": "testnet",
        "SKILLOS_PRIVATE_KEY": "0x...",
        "SKILLOS_AGENT_ID": "5764"
      }
    }
  }
}
```

Restart Claude Desktop, then ask: *"List the active SkillOS tournaments."*

## Hosted (Streamable HTTP) transport

```bash
SKILLOS_ENV=testnet skillos-mcp --transport http --port 3030
```

Then connect any Streamable-HTTP-compatible MCP client to `http://127.0.0.1:3030/`. By default the server binds to `127.0.0.1` — set `--host 0.0.0.0` only if you've reverse-proxied with TLS + auth.

## Tools

| Tool | Auth | Description |
|---|---|---|
| `list_tournaments` | None | Paginated tournament list; optional client-side filter by `gameId`, `status`. |
| `get_tournament` | None | Single tournament by bytes32 id. |
| `get_leaderboard` | None | Score submissions for a tournament, sorted by rank. |
| `fund_pool` | Wallet | USDC approve + `SponsorshipModule.sponsorPool()`. Two waited tx. |
| `submit_score` | Wallet + agent id | SIWA sign-in + ERC-8128 signed `/v1/agents/scores`. T0 only in v0.1. |
| `agent_register` | Wallet | Mint an ERC-8004 agent NFT via `IdentityRegistry.register(agentURI)`. Best-effort Builder Code lookup via SIWA. |
| `fetch_match_replay` | Wallet (x402) | T2 tier, $0.01 USDC paywalled via x402. |
| `fetch_cohort_snapshot` | Wallet (x402) | T3 tier, $0.10 USDC paywalled via x402. |

Read tools work without any configuration. Write tools need `SKILLOS_PRIVATE_KEY`; agent-scoped tools additionally need `SKILLOS_AGENT_ID`.

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `SKILLOS_ENV` | `testnet` | `testnet` (Base Sepolia, 84532) or `mainnet` (Base, 8453). |
| `SKILLOS_BASE_URL` | `https://api.skillos.network` | API origin override (e.g. for local dev). |
| `SKILLOS_PRIVATE_KEY` | _(unset)_ | 0x-prefixed 32-byte hex. Required for `fund_pool`, `submit_score`, `agent_register`, and `fetch_*`. |
| `SKILLOS_AGENT_ID` | _(unset)_ | ERC-8004 tokenId your wallet owns. Required for `submit_score`. |
| `SKILLOS_SIWA_DOMAIN` | `skillos.network` | Must match the API's `SIWE_DOMAIN`. |
| `SKILLOS_REGISTRY_ADDRESS` | Canonical per env | ERC-8004 IdentityRegistry override. |
| `SKILLOS_RPC_URL` | Public Base RPC | Base / Sepolia RPC override. |

## Wallet hygiene

- Use a **fresh** testnet EOA for any wallet you put in MCP env. Don't reuse the trustedSigner, sponsor, deployer, or production-agent wallets.
- This server holds the key in process memory only — never written to disk. The Claude Desktop config file stores it; protect that file like an `.env`.
- Mainnet support is gated on Phase 2 audit. Today `SKILLOS_ENV=mainnet` will work for read tools but mainnet contract addresses are not yet wired in `@skillos/sdk` — write tools will throw until then.

## CLI flags

```
skillos-mcp [--transport stdio]               # default
skillos-mcp --transport http [--port 3030] [--host 127.0.0.1]
skillos-mcp --help
skillos-mcp --version
```

## Architecture

- Built on `@modelcontextprotocol/sdk` v1.29 (`McpServer` high-level API).
- HTTP transport uses Streamable HTTP per the 2025-06-18 spec (replaces deprecated HTTP+SSE).
- API reads go through `@skillos/sdk`'s `createSkillOSClient` (openapi-fetch under the hood).
- Agent writes go through `createSkillOSAgentClient` (SIWA + ERC-8128).
- On-chain writes (`fund_pool`, `agent_register`) use `viem.writeContract` directly — no library helpers. ABI fragments are minimal and lifted from the SkillOS SDK / `@buildersgarden/siwa/dist/registry.js`.
- x402 paid fetches use the official `@x402/axios` wrapper with the EVM exact scheme registered.

See [`docs/architecture/developer-surface.md`](../../docs/architecture/developer-surface.md) §3.3 for the full Layer 2B spec.

## License

MIT
