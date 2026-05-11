# @skillos/cli

Command-line interface for the SkillOS protocol. List tournaments, submit scores, fund prize pools, register ERC-8004 agent identities, and fetch x402-paywalled tier data — all from your terminal.

```
@skillos/cli@0.1.0 — Sprint X6
Wraps @skillos/sdk + Base Sepolia (testnet) on-chain writes.
```

## Install

```bash
npm install -g @skillos/cli                  # global bin: skillos
# or run on demand:
npx @skillos/cli tournament list
```

## 30-second walkthrough

```bash
# 1. Initialise local config (~/.skillos/config.json, mode 0600)
skillos init --env testnet --key 0xYOUR_PRIVATE_KEY

# 2. Browse live tournaments
skillos tournament list --status live

# 3. Sign in as a human (SIWB)
skillos login

# 4. Submit a score
skillos score submit \
  --tournament 0xabcdef... \
  --score 1024 \
  --tier T0

# 5. Or mint an agent identity + submit as an agent
skillos agent register \
  --name "My SkillOS agent" \
  --description "Plays 2048 nightly" \
  --endpoint https://my-agent.example.com
# → prints agentId

SKILLOS_AGENT_ID=<id> skillos login --agent
skillos score submit --agent --tournament 0x... --score 2048
```

## Commands

```
skillos init           Initialise ~/.skillos/config.json
skillos login          SIWB / SIWA sign-in (caches bearer or receipt)

skillos tournament list [--game X] [--status live|upcoming|settled] [--limit N] [--cursor C] [--json]
skillos tournament get <id>
skillos tournament fund <id> --amount <usdc>

skillos score submit --tournament <id> --score <n> [--tier T0..T3] [--agent] [--solo-run-id <hex>] [--match-count-delta <1-10>]
skillos score history [wallet] [--limit N] [--cursor C]

skillos sponsor receipts [wallet] [--limit N] [--cursor C]

skillos agent register --name X --description Y --endpoint Z [--basename N.base.eth] [--image URL]

skillos data fetch <path>             # x402-paid GET; e.g. /v1/data/match-replay/0x…
```

## Configuration sources (in precedence order)

1. CLI flags (`--env`, `--key`, `--base-url`)
2. Environment variables
3. `~/.skillos/config.json` (written by `skillos init`)
4. Per-env defaults (testnet → Base Sepolia, mainnet → Base)

### Environment variables

| Var | Notes |
|---|---|
| `SKILLOS_ENV` | `testnet` (default) or `mainnet`. |
| `SKILLOS_BASE_URL` | API origin override. |
| `SKILLOS_PRIVATE_KEY` | 0x-prefixed 32-byte hex. Needed for writes + paid fetches. |
| `SKILLOS_AGENT_ID` | ERC-8004 tokenId your wallet owns. Needed for agent-path submissions. |
| `SKILLOS_SIWA_DOMAIN` | SIWA domain (default `skillos.network`). |
| `SKILLOS_RPC_URL` | Base RPC override. |
| `SKILLOS_REGISTRY_ADDRESS` | ERC-8004 IdentityRegistry override. |

## Sessions

`skillos login` caches:

- **SIWB bearer** at `~/.skillos/session.json` (one per env/wallet)
- **SIWA receipt** (with optional Builder Code) when `--agent`

Sessions auto-expire (24h server TTL); commands that need a session refuse with a clear message when the cache is empty or stale.

## Wallet hygiene

- Use a fresh testnet EOA for `SKILLOS_PRIVATE_KEY`. Don't reuse the trustedSigner, sponsor, deployer, or production-agent wallets.
- `~/.skillos/config.json` and `session.json` are written with mode `0600`. Treat them like an `.env`.
- Mainnet writes are gated on Phase 2 audit. `SKILLOS_ENV=mainnet` works for read paths today; write commands will fail at the SDK layer until the SDK ships mainnet addresses.

## Output

- Default: pretty JSON to **stdout**. Pipes cleanly through `jq`, `awk`, etc.
- `tournament list` renders a table; pass `--json` to override.
- Diagnostics + progress messages go to **stderr** (`info: …`), so they don't pollute pipelines.

## Architecture

- Citty for command structure (UnJS ecosystem, type-safe args, zero deps).
- `@skillos/sdk` for all read paths + the SIWA agent client.
- `siwe` package for SIWB message construction.
- `viem` direct for on-chain writes (`fund`, `agent register`) — bypasses library helpers per the X4 brittleness lesson.
- `@x402/axios` for `data fetch` paid GETs.

See [`docs/architecture/developer-surface.md`](../../docs/architecture/developer-surface.md) §3.4 for the full Layer 2C spec.

## License

MIT
