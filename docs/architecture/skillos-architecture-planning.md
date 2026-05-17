# SkillOS Developer Surface — Architecture Planning

> **Status:** Draft v1, locked decisions marked ✅, deferred items marked ⏳, open questions marked ❓.
> **Last verified:** May 10, 2026, against [docs.base.org](https://docs.base.org) and [docs.cdp.coinbase.com](https://docs.cdp.coinbase.com).
> **Authority hierarchy:** Base docs > CDP docs > general best practice. When in doubt, read the spec, then commit.
> **Error-tolerance principle:** Lock only what's verified against an authoritative source. Bayrak çek what isn't.

---

## 1. Purpose

This document fixes the technical foundation for SkillOS's developer surface — the **API**, **SDK**, **MCP server**, and **CLI** that consumers (game developers, AI agents, sponsors, AI labs) will use to interact with the protocol.

It exists because the founder's correct insight is: *if we claim to be agent-era infrastructure, we need to consume — not reinvent — the standards Base and Coinbase have already shipped for that purpose.* Every standard we wrap rather than re-implement reduces our surface area for bugs, audit cost, and time-to-mainnet.

This document supersedes any earlier prompt or sketch where I (Claude) made up package names, header formats, or middleware ergonomics from training-data instinct. Every binding decision below is cited.

---

## 2. Verified Ecosystem Map

### 2.1 Base — relevant standards & SDKs

| Standard / SDK | What it is | Where we use it | Source |
|---|---|---|---|
| **Base Account** (`@base-org/account`, `@base-org/account-ui`) | Smart wallet (passkey-based) with capabilities for paymaster, atomic batching, data attribution. Wagmi connector ID: `baseAccount`. | Layer 2A SDK frontend integration | [base-account/overview/what-is-base-account](https://docs.base.org/base-account/overview/what-is-base-account) |
| **Sign In With Base (SIWB)** | EIP-4361 SIWE built on Base Account. Wallet-agnostic. ERC-6492 wrapper auto-handled by viem `verifyMessage` / `verifyTypedData` for undeployed smart wallets. | Layer 1 API human auth, Layer 2A SDK auth hooks | [base-account/framework-integrations/wagmi/sign-in-with-base](https://docs.base.org/base-account/framework-integrations/wagmi/sign-in-with-base), [base-account/guides/authenticate-users](https://docs.base.org/base-account/guides/authenticate-users) |
| **Sign In With Agent (SIWA)** | Bundles ERC-8004 (registry) + ERC-8128 (per-request signing) into one SDK. Drop-in middleware for **Hono**, Express, Next.js, Fastify. Package: `@buildersgarden/siwa`. | Layer 1 API agent auth, Layer 2A SDK agent client | [ai-agents/setup/agent-registration](https://docs.base.org/ai-agents/setup/agent-registration), [siwa.id](https://siwa.id) |
| **ERC-8004** | Onchain NFT registry for agent identity. Canonical contract on Base mainnet: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. Browse via [8004scan.io](https://www.8004scan.io). | Substrate for SIWA, no direct integration needed | [8004.org](https://www.8004.org/) |
| **ERC-8021 dataSuffix (Builder Codes)** | Transaction-attached attribution code. Format: `bc_xxxxxxxx`. Wired via `dataSuffix` capability on Base Account or appended to `data` field on raw transactions. | Layer 2A SDK auto-attribution; existing wiring (apex, 2048, sponsor) keeps current codes | [apps/builder-codes/builder-codes](https://docs.base.org/apps/builder-codes/builder-codes), [base-account/reference/core/capabilities/dataSuffix](https://docs.base.org/base-account/reference/core/capabilities/dataSuffix) |
| **Builder Codes API for Agents** | Unauthenticated endpoint: `POST https://api.base.dev/v1/agents/builder-codes` with `walletAddress` body returns `builderCode`. Idempotent for same wallet. | Layer 2A SDK auto-registration on first agent call | [ai-agents/setup/agent-builder-codes](https://docs.base.org/ai-agents/setup/agent-builder-codes) |
| **EIP-5792 batch transactions (`atomic` capability)** | Wagmi hooks `useSendCalls` + `useWaitForCallsStatus` + `useCapabilities`. Detect via `capabilities[chainId].atomic.status === 'ready' \|\| 'supported'`. | Layer 2A SDK: batch retry-fee + score-submit when smart wallet supports it | [base-account/improve-ux/batch-transactions](https://docs.base.org/base-account/improve-ux/batch-transactions), [base-account/reference/core/capabilities/atomic](https://docs.base.org/base-account/reference/core/capabilities/atomic) |
| **Paymaster (`paymasterService` capability)** | Gas sponsorship for users. Detection via `capabilities[chainId].paymasterService.supported === true`. | Layer 2A SDK gasless UX (Phase 2 mainnet) | [base-account/improve-ux/sponsor-gas/paymasters](https://docs.base.org/base-account/improve-ux/sponsor-gas/paymasters) |
| **Sub-accounts** | App-scoped embedded wallets for zero-prompt actions (e.g., automated agent loops). | Layer 2A SDK Phase 3+ (deferred) | [base-account/improve-ux/sub-accounts](https://docs.base.org/base-account/improve-ux/sub-accounts) |
| **Base MCP Server (Coinbase-hosted)** | `https://docs.base.org/mcp` — Coinbase's own MCP server providing access to Base docs + onchain actions. | Reference / inspiration only; we ship our own | [get-started/docs-mcp](https://docs.base.org/get-started/docs-mcp) |
| **Base skills** | `npx skills add base/base-skills` — installable knowledge packs for AI coding assistants (Claude Code, Cursor, Codex). | Phase 3+ (we publish SkillOS skill pack so AI assistants auto-load our context) | [github.com/base/skills](https://github.com/base/skills) |
| **Basenames** | Human-readable identity → wallet address (e.g., `myagent.base.eth`). Resolves via Base Account SDK. | SDK helper; not core | [base-account/basenames/...](https://docs.base.org/base-account/basenames) |

### 2.2 Coinbase Developer Platform (CDP) — relevant services

| Service / SDK | What it is | Where we use it | Source |
|---|---|---|---|
| **x402 Protocol** | HTTP-native micropayment protocol. Server emits `HTTP 402 Payment Required` + payment requirements. Client signs payload, retries with `X-PAYMENT` header. CAIP-2 network IDs: Base = `eip155:8453`, Base Sepolia = `eip155:84532`. | Layer 1 API paywalled endpoints (T2/T3 data tiers) | [x402/welcome](https://docs.cdp.coinbase.com/x402/welcome), [x402/quickstart-for-sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers) |
| **`@x402/hono`** | Official Hono middleware for accepting x402 payments. Pairs with `@x402/evm` (EVM scheme) and `@x402/core` (facilitator client). | Layer 1 API middleware | [x402/quickstart-for-sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers) |
| **`@x402/axios`** | Client-side wrapper that auto-handles 402 → sign → retry. Works in Node/browser. | Layer 2B MCP server (proven Coinbase MCP+x402 reference); Layer 2A SDK Phase 1.7 | [x402/mcp-server](https://docs.cdp.coinbase.com/x402/mcp-server) |
| **CDP Facilitator** | `https://api.cdp.coinbase.com/platform/v2/x402` — handles verification + on-chain settlement. **Free tier: 1,000 tx/month**, then $0.001/tx. Mainnet only. | Phase 2 mainnet x402 | [x402/network-support](https://docs.cdp.coinbase.com/x402/network-support) |
| **x402.org Facilitator** | `https://x402.org/facilitator` — testnet only (Base Sepolia + Solana Devnet), no signup. | Phase 1 testnet x402 | [x402/network-support](https://docs.cdp.coinbase.com/x402/network-support) |
| **Coinbase Agentic Wallet** | Two-product suite: **CLI** (`npx @coinbase/agentic-wallet-skills`) and **MCP** (`npx @coinbase/payments-mcp`). Provides agent wallet + x402 payment capabilities to any MCP-compatible client. | Reference for our MCP/CLI patterns; we don't bundle, we coexist | [agentic-wallet/welcome](https://docs.cdp.coinbase.com/agentic-wallet/welcome) |
| **AgentKit** (`@coinbase/agentkit`) | Coinbase's agent framework — wallet management + onchain actions for any AI framework (LangChain, Eliza, Vercel AI SDK). | Reference; agent-runner sprint may consume directly | [agent-kit/welcome](https://docs.cdp.coinbase.com/agent-kit/welcome) |
| **CDP SDK v2** (`@coinbase/cdp-sdk`, `@coinbase/cdp-hooks`, `@coinbase/cdp-core`) | Frontend wallet SDK with built-in x402 support, paymaster, embedded wallets. | Layer 2A SDK (consume for wallet primitives, don't replace) | [sdks/cdp-sdks-v2](https://docs.cdp.coinbase.com/sdks/cdp-sdks-v2) |
| **EIP-3009 (USDC Transfer With Authorization)** | Gasless USDC transfers. Buyer signs off-chain, facilitator submits. USDC on Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. | x402 underlying mechanism (no direct integration) | [x402/network-support](https://docs.cdp.coinbase.com/x402/network-support) |

### 2.3 Standards we explicitly do NOT reinvent

- **Auth header format**: NOT custom. Use SIWB-issued session for humans, SIWA receipts for agents.
- **Payment protocol**: NOT custom. Use x402.
- **Agent identity registry**: NOT custom. Use ERC-8004.
- **Per-request signing**: NOT custom. Use ERC-8128.
- **Builder attribution**: NOT custom. Use ERC-8021 dataSuffix + Base Builder Codes API.
- **Smart wallet UX patterns**: NOT custom. Use Base Account capabilities (atomic, paymasterService, dataSuffix).

---

## 3. Architecture — Layer by Layer

### 3.0 Layer 0 — Smart contracts (current state, no change)

✅ TournamentPool v2.1 deployed Base Sepolia. v2.2 audit-ready (PR #49–55 merged).
✅ SponsorshipModule + SponsorReceiptSBT (ERC-5192) deployed.
✅ MockSanctionsOracle for testnet.
✅ 203 Foundry tests passing.

**No changes in this phase.** All higher layers wrap or call these contracts.

### 3.1 Layer 1 — HTTP API (`api.skillos.network`)

✅ **Stack lock:**
- Runtime: **Vercel Node functions** (Edge upgrade deferred until profiling justifies)
- Framework: **[Hono](https://hono.dev/)** — purpose-built for API services, runtime-agnostic
- OpenAPI: **[`@hono/zod-openapi`](https://hono.dev/examples/zod-openapi)** — schema-first, single source of truth
- Validation: **Zod**
- Onchain reads: **viem** (already in monorepo)
- Domain: `api.skillos.network` (apex DNS via GoDaddy)

✅ **Auth taxonomy (verified against Base docs):**

| Endpoint class | Auth | Implementation | Verification source |
|---|---|---|---|
| Public reads (tournaments, leaderboards, score history) | None | — | — |
| Human writes (score submit, sponsor fund) | **SIWB** session (EIP-4361 SIWE with ERC-6492 wrapper) | viem `verifyMessage` / `verifyTypedData`; nonce store in KV (Vercel KV or Upstash) | [base-account/guides/authenticate-users](https://docs.base.org/base-account/guides/authenticate-users) |
| Agent writes (agent score submit, agent metadata) | **SIWA** session (ERC-8004 lookup + ERC-8128 per-request signature) | `@buildersgarden/siwa` Hono middleware — ships drop-in nonce + verify + receipt | [ai-agents/setup/agent-registration](https://docs.base.org/ai-agents/setup/agent-registration) |
| Paid reads (T2/T3 data tier endpoints, AI lab data licensing) | **x402** | `@x402/hono` middleware + `@x402/evm` scheme + `HTTPFacilitatorClient` | [x402/quickstart-for-sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers) |

Auth sessions issued by `/v1/auth/*` endpoints. Each downstream write endpoint verifies session + signature in middleware. **No API keys. No accounts. Permissionless by design.**

❓ **Open question for human writes:** SIWB session = JWT-style bearer token (issued post-verify, used in `Authorization: Bearer <jwt>`) OR session cookie (httpOnly, SameSite=Strict)? **Recommendation:** Bearer token (matches agent-side SIWA receipt pattern, easier for non-browser clients). Lock during Sprint X2.

✅ **Endpoint surface (v1, locked):**

```
# Public reads
GET    /v1/health
GET    /v1/tournaments                       (paginated)
GET    /v1/tournaments/:id
GET    /v1/tournaments/:id/leaderboard       (paginated)
GET    /v1/scores/:wallet                    (paginated history)
GET    /v1/sponsors/:wallet/receipts         (ERC-5192 SBT receipts)

# Auth bootstrap
POST   /v1/auth/siwb/nonce                   (SIWB nonce issuance)
POST   /v1/auth/siwb/verify                  (SIWB signature verify → bearer token)
POST   /v1/auth/siwa/nonce                   (SIWA nonce — wraps @buildersgarden/siwa)
POST   /v1/auth/siwa/verify                  (SIWA signature verify → receipt)

# Human writes (require SIWB bearer)
POST   /v1/scores                            (submit score, signed payload)
POST   /v1/sponsors/fund                     (fund prize pool)

# Agent writes (require SIWA receipt + ERC-8128 per-request sig)
POST   /v1/agents/scores                     (agent-submitted score)
PATCH  /v1/agents/profile                    (update agent metadata)

# Paid (x402 paywalled)
GET    /v1/data/match-replay/:id             ($0.01 USDC, T2 tier)
GET    /v1/data/cohort-snapshot              ($0.10 USDC, T3 tier)

# Meta
GET    /openapi.yaml                         (spec)
GET    /docs                                 (Stoplight Elements UI)
```

⏳ **Out of v1:**
- Webhook subscriptions (Phase 3)
- WebSocket leaderboard streams (Phase 3)
- Bulk data export (Phase 3 AI lab BD)
- Subscription tiers (architecturally rejected — no consumer subscriptions)

### 3.2 Layer 2A — `@skillos/sdk` (web-native first, TypeScript)

✅ **Peer dependencies (consumed, not bundled):**
- `wagmi`, `viem`, `@tanstack/react-query` — Base recommended FE stack ([apps/quickstart/build-app](https://docs.base.org/apps/quickstart/build-app))
- `@base-org/account`, `@base-org/account-ui` — Base Account SDK
- React 18+ (peer)

✅ **Architecture: hooks + provider + vanilla client.**

```ts
// React surface
<SkillOSProvider config={{ env: 'testnet', builderCode: 'bc_z04mayz0' }}>
  <App />
</SkillOSProvider>

const { tournaments } = useSkillOSTournaments({ filter: { gameId: '2048' } })
const { submit, status } = useSkillOSScore({ tournamentId, tier: 'T1' })
const { leaderboard } = useSkillOSLeaderboard({ tournamentId })
const { signIn } = useSkillOSAuth()        // SIWB for humans
const { signInAsAgent } = useSkillOSAgent() // SIWA for agents
const { fund } = useSkillOSSponsor({ tournamentId })

// Vanilla TS surface (Node, edge runtime, non-React)
const skillos = createSkillOSClient({ env: 'testnet', signer })
await skillos.scores.submit({ tournamentId, score: 1024, tier: 'T1' })
```

✅ **Capabilities integration (Base recommended pattern):**

| Capability | When used | Implementation |
|---|---|---|
| `dataSuffix` | All SkillOS-attributed transactions | Auto-append Builder Code via wagmi connector capabilities |
| `atomic` (EIP-5792 batch) | Submit retry fee + score in one tx (smart wallet only) | `useSendCalls` if `useCapabilities` returns ready/supported, else fall back to `useWriteContract` |
| `paymasterService` | Gasless score submission (Phase 2 mainnet) | Detect via `useCapabilities`, use `paymasterService` capability in `sendCalls` |
| `signInWithEthereum` | SIWB auth | Wagmi `wallet_connect` RPC method |

✅ **Quality tier API (T0–T3, locked architecturally):**

```ts
type SubmissionTier =
  | 'T0'  // score-only         — minimum
  | 'T1'  // score + seed + duration
  | 'T2'  // score + seed + duration + input log (replay-verifiable)
  | 'T3'  // T2 + state hashes per move (full deterministic replay)
```

Higher tier → higher SP credit, larger prize pool eligibility, AI lab data licensing premium. Tier choice is per-game (configured in tournament metadata) and per-submission (must meet declared minimum).

✅ **Builder Codes flow:**

1. Game dev passes their human Builder Code in `<SkillOSProvider config={{ builderCode }}>`. Code wired via `dataSuffix` capability.
2. Agent operator: SDK auto-registers via `POST https://api.base.dev/v1/agents/builder-codes` on first agent-attributed transaction (idempotent). Code cached locally (`~/.skillos/agent-builder-code.json`).
3. SDK never strips an existing dataSuffix. If both human and agent codes are present, agent code wins (transaction is agent-originated).

⏳ **Sub-accounts integration (Phase 3+):** automated agent loops use sub-accounts for zero-prompt re-authorizations. Not in v0.1 SDK.

### 3.3 Layer 2B — `@skillos/mcp` (LLM-agent native, x402-aware)

✅ **Pattern lock:** Coinbase's published [MCP + x402 reference](https://docs.cdp.coinbase.com/x402/mcp-server) using `@modelcontextprotocol/sdk` + `@x402/axios` wrapper. Verified, proven, drop-in.

✅ **Transports:**
- `stdio` for local Claude Desktop install (`npx @skillos/mcp`)
- HTTP / SSE for hosted use (Cursor, Claude in Chrome, agent runtimes)

✅ **Tools:**

```
list_tournaments       (filter: gameId, status, classDeclaration)
get_tournament         (tournamentId)
get_leaderboard        (tournamentId, limit)
fund_pool              (tournamentId, amount) — wallet-sig required
submit_score           (tournamentId, score, tier, payload) — SIWA receipt required
agent_register         (basename optional) — wraps SIWA + Builder Codes auto-reg
```

✅ **Distribution:**
- npm: `@skillos/mcp`
- Anthropic MCP registry submission ([modelcontextprotocol.io](https://modelcontextprotocol.io))
- Base skills entry: `npx skills add skillos/skillos-skills` (Phase 3+)

❓ **Open question:** Do we register an MCP server descriptor at `https://docs.skillos.network/mcp` (mirroring Base's `https://docs.base.org/mcp`)? Useful for AI coding assistants to auto-discover SkillOS context. **Recommendation:** Yes, in Phase 3 docs sprint.

### 3.4 Layer 2C — `@skillos/cli` (power-user, scripts, ops)

✅ **Stack:**
- Runtime: **Node 20+** (drops Bun for max compatibility; agent operators have varied environments)
- Framework: **[Citty](https://github.com/unjs/citty)** — UnJS, type-safe, lightweight; same ecosystem as Nuxt/Nitro
- Wraps `@skillos/sdk` directly

✅ **Commands:**

```
skillos init              # Create wallet, set env, register agent (optional)
skillos login             # SIWB or SIWA signin → cache bearer/receipt
skillos tournament list   # List tournaments
skillos tournament get <id>
skillos tournament fund <id> --amount 50
skillos score submit --tournament <id> --tier T1 --payload <file.json>
skillos score history [wallet]
skillos sponsor receipts [wallet]
skillos agent register --basename <name>.base.eth
skillos data fetch <endpoint>  # x402-paid fetch with wallet
```

⏳ **Distribution:** npm `@skillos/cli` first. Homebrew tap (Phase 3+) when usage justifies.

### 3.5 Layer 3 — Reference apps (existing + new)

✅ **Existing 6 game subdomains** (2048, wordle, sudoku, minesweeper, clicker, match3) → migrate to consume `@skillos/sdk` after v0.1 ships. This is **mandatory dogfooding** before public SDK release; if our own apps can't migrate cleanly, the SDK isn't ready.

⏳ **agent-runner reference app** (deferred to post-MCP). Consumes `@skillos/sdk` (Node/Bun) or hits `@skillos/mcp` from a Claude-in-Chrome session. Plays 2048 → wordle → sudoku, submits scores, demonstrates the full loop. Public GitHub Actions cron: agent plays daily, score submitted, public leaderboard. **Becomes the pitch demo, not the pitch core.**

---

## 4. Sprint Sequence with Verification Gates

Each sprint has a **pre-sprint verification step** (read X spec, run Y sample) and **lock criteria** (what must be true to call it done). Skipping verification = waiving the error-tolerance principle.

### Sprint X1 — Layer 1A: Read-only API foundation

**Pre-sprint verification:**
- [x] `@hono/zod-openapi` API surface confirmed (current version supports OpenAPI 3.1)
- [ ] Vercel Node runtime function size limits checked against expected dependency footprint
- [ ] DNS plan for `api.skillos.network` (CNAME or A record per Vercel)

**Scope:**
- Scaffold `apps/api` (Hono + @hono/zod-openapi + Zod + viem)
- 6 read endpoints (`/v1/health`, `/v1/tournaments*`, `/v1/scores/:wallet`, `/v1/sponsors/:wallet/receipts`)
- OpenAPI spec served at `/openapi.yaml`
- Stoplight Elements UI at `/docs` (brand-themed: Pitch Black + Lime + Inter)
- DNS + Vercel deployment
- Smoke tests via `curl` against live URL

**Lock criteria:**
- `curl https://api.skillos.network/v1/health` → 200
- `curl https://api.skillos.network/v1/tournaments` → 200 (empty array OK)
- OpenAPI 3.1 spec validates
- 3 smoke tests pass in CI
- README with curl examples

**Out of scope:** auth, writes, x402, MCP, SDK.

### Sprint X2 — Layer 1B: Human writes via SIWB

**Pre-sprint verification:**
- [ ] Read [base-account/guides/authenticate-users](https://docs.base.org/base-account/guides/authenticate-users) end-to-end
- [ ] Run Base's official SIWB sample (Next.js + wagmi) locally — verify nonce flow
- [ ] Verify viem `verifyMessage` handles ERC-6492 wrapper transparently
- [ ] Decide: bearer token vs session cookie (recommendation: bearer)

**Scope:**
- `/v1/auth/siwb/nonce` (issue + store in Vercel KV)
- `/v1/auth/siwb/verify` (verify SIWE message, issue bearer JWT)
- Bearer middleware on `/v1/scores POST`, `/v1/sponsors/fund POST`
- Replay protection (nonce single-use, 5-minute TTL)
- Smoke test: full SIWB flow from a wagmi sample frontend → API

**Lock criteria:**
- End-to-end test: connect Base Account → sign SIWE → bearer token → submit score → on-chain tx
- Nonce reuse rejected
- Bearer token expiry enforced (recommended: 24h)

**Out of scope:** SIWA, x402, SDK package.

### Sprint X3 — Layer 2A: SDK v0.1 (no agent auth yet)

**Pre-sprint verification:**
- [ ] Read [apps/quickstart/build-app](https://docs.base.org/apps/quickstart/build-app) end-to-end (the wagmi + Base Account pattern)
- [ ] Read [base-account/reference/core/capabilities/dataSuffix](https://docs.base.org/base-account/reference/core/capabilities/dataSuffix) for Builder Code wiring
- [ ] Verify `@hono/zod-openapi` → TypeScript types pipeline (so SDK types come from API spec, not duplicated)

**Scope:**
- `packages/sdk` scaffold
- `<SkillOSProvider>`, `useSkillOSTournaments`, `useSkillOSScore`, `useSkillOSLeaderboard`, `useSkillOSAuth` (SIWB only this sprint)
- Vanilla TS client `createSkillOSClient`
- `dataSuffix` Builder Code wiring via wagmi connector capabilities
- T0/T1 tier integration (T2/T3 require server-side replay verifier — Phase 2)
- Migrate **one** game subdomain (2048) to consume SDK as dogfooding proof

**Lock criteria:**
- Published to npm as `@skillos/sdk@0.1.0` (private prerelease tag)
- 2048.skillos.games migrated, Builder Code attribution verified on BaseScan
- TypeScript types tested in a fresh consumer project
- Storybook (or simple HTML) demonstrating provider + hooks

**Out of scope:** agent auth, MCP, CLI, x402.

### Sprint X4 — Layer 1C: Agent auth via SIWA + SDK agent client

**Pre-sprint verification:**
- [ ] Read [siwa.id/docs](https://siwa.id) Hono middleware section
- [ ] Run `@buildersgarden/siwa` example end-to-end on Base Sepolia
- [ ] Verify ERC-8004 testnet registry exists (or how to register on Sepolia)
- [ ] Read [ai-agents/setup/agent-builder-codes](https://docs.base.org/ai-agents/setup/agent-builder-codes) for auto-registration flow

**Scope:**
- `/v1/auth/siwa/nonce` + `/v1/auth/siwa/verify` (Hono middleware drop-in)
- `/v1/agents/scores POST`, `/v1/agents/profile PATCH`
- SDK additions: `useSkillOSAgent`, `signInAsAgent`, agent Builder Code auto-reg on first call
- Per-request ERC-8128 signing in SDK fetch wrapper

**Lock criteria:**
- Agent registers (manual ERC-8004 onboarding scripted for now)
- SIWA flow: nonce → sign → verify → receipt → ERC-8128 signed score submission → on-chain entry attributed to agent Builder Code

**Out of scope:** MCP, CLI, x402.

### Sprint X5 — Layer 1D: x402 paywalled tier endpoints

**Pre-sprint verification:**
- [ ] Run [x402/quickstart-for-sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers) Hono sample end-to-end on Base Sepolia
- [ ] Test with [x402/mcp-server](https://docs.cdp.coinbase.com/x402/mcp-server) reference client (validates Phase X6 MCP compatibility upstream)
- [ ] Decide which existing endpoints get x402-promoted (recommend: NOT the read endpoints we already promised in X1; ADD new `/v1/data/*` endpoints)

**Scope:**
- `@x402/hono` + `@x402/evm` + `@x402/core` integration in `apps/api`
- New endpoints: `/v1/data/match-replay/:id` ($0.01), `/v1/data/cohort-snapshot` ($0.10)
- Testnet uses x402.org facilitator (no signup); mainnet path uses CDP facilitator (deferred)
- Receiving wallet: Skillbase platform USDC wallet (separate from prize pool wallets)

**Lock criteria:**
- Curl with no payment → 402 + payment requirements
- Curl with valid payment payload → 200 + data
- x402 sample MCP client successfully fetches data via Claude Desktop on testnet

**Out of scope:** MCP server packaging, CLI.

### Sprint X6 — Layer 2B + 2C: MCP server + CLI

**Pre-sprint verification:**
- [ ] Read [x402/mcp-server](https://docs.cdp.coinbase.com/x402/mcp-server) reference fully
- [ ] Read [Anthropic MCP transport spec](https://modelcontextprotocol.io) (stdio + HTTP)
- [ ] Compare Citty vs commander for CLI ergonomics on Citty docs

**Scope:**
- `packages/mcp` — `@modelcontextprotocol/sdk` + `@x402/axios` wrapper around our own API
- Tools: list_tournaments, get_tournament, get_leaderboard, fund_pool (SIWB), submit_score (SIWA), agent_register
- stdio + HTTP transports
- `packages/cli` — Citty + wraps SDK
- Both published to npm

**Lock criteria:**
- Claude Desktop install → SkillOS MCP visible → list_tournaments works
- `npx @skillos/cli tournament list` works against testnet
- Both packages have README + smoke tests

**Out of scope:** Anthropic MCP registry submission (Phase 3 polish), Homebrew tap.

### Sprint X7 — Layer 3: Game migrations + agent-runner reference

**Pre-sprint verification:**
- [ ] All Sprint X3+ game migrations: SDK consumed cleanly, no app-specific workarounds
- [ ] Decide: does agent-runner consume SDK (Node) or MCP (LLM in Claude-in-Chrome)?
- [ ] Recording strategy for demo (gif_creator vs OBS vs Puppeteer screencast)

**Scope:**
- Migrate remaining 5 game subdomains to SDK
- agent-runner: chosen consumption pattern, plays 2048 + wordle + sudoku, submits scores
- GitHub Actions cron: daily agent run, public leaderboard updated
- Demo video / GIF for tweet thread

**Lock criteria:**
- All 6 games on SDK
- agent-runner produces verifiable on-chain agent scores nightly
- Public agent leaderboard live

**Out of scope:** SDK v1.0 release (that's Phase 2 mainnet sprint), Anthropic MCP registry.

---

## 5. Open Questions Requiring Founder Decision

Each affects sprint scope. Decide before respective sprint locks.

| # | Question | Affects sprint | Recommendation |
|---|---|---|---|
| 1 | Bearer token vs session cookie for SIWB? | X2 | Bearer (matches SIWA receipt pattern, multi-client friendly) |
| 2 | Bearer token TTL? | X2 | 24h, refreshable |
| 3 | x402 receiving wallet — separate USDC wallet or existing platform wallet? | X5 | Separate (clean accounting, mainnet wallet hygiene) |
| 4 | x402 testnet pricing — symbolic ($0.001) or realistic ($0.10)? | X5 | Realistic (forces real flow testing) |
| 5 | MCP server hosting — self-host on Vercel or `npx`-only? | X6 | Both; npx for stdio, hosted at `mcp.skillos.network` for HTTP |
| 6 | CLI framework Citty vs commander? | X6 | Citty (UnJS ecosystem, type-safe, smaller) |
| 7 | Sub-accounts integration in SDK? | Phase 3+ | Defer until automated agent loops are common |
| 8 | Anthropic MCP registry submission timing? | X7+ | After 1+ public dev integration confirms SDK + MCP both work |
| 9 | SkillOS Skill pack via base/skills convention? | X7+ | Yes, Phase 3 docs sprint includes this |

---

## 6. What This Plan Doesn't Cover (Yet)

Honest about scope:

- **Mainnet auth flow.** SIWB + SIWA on mainnet may have edge cases (paymaster integration, sub-account interaction) that require Phase 2 dedicated sprint.
- **Rate limiting backend.** In-memory LRU is fine for testnet; mainnet needs Upstash Redis or Vercel KV with proper rate-limit primitives. Decided in Phase 2.
- **Observability.** Structured JSON logs are foundation. Distributed tracing (OpenTelemetry → Honeycomb/Datadog) is Phase 3.
- **Error envelope evolution.** v1 envelope (`{ code, message, details }`) is sufficient for now; mature versioning (RFC 9457 problem details) is Phase 3.
- **API versioning beyond v1.** When v2 ships (no plan yet), v1 keeps running. SDK pins per-major-version.
- **Webhooks for sponsor / score events.** Phase 3, when production volume justifies.
- **GraphQL surface.** Probably never. REST + OpenAPI is enough; GraphQL would compete with our own SDK.

---

## 7. Citations Index

All decisions in this document trace to one of:

**Base docs:**
- [docs.base.org/get-started/base](https://docs.base.org/get-started/base)
- [docs.base.org/llms.txt](https://docs.base.org/llms.txt) — full doc index
- [docs.base.org/apps/quickstart/build-app](https://docs.base.org/apps/quickstart/build-app)
- [docs.base.org/apps/builder-codes/builder-codes](https://docs.base.org/apps/builder-codes/builder-codes)
- [docs.base.org/base-account/overview/what-is-base-account](https://docs.base.org/base-account/overview/what-is-base-account)
- [docs.base.org/base-account/guides/authenticate-users](https://docs.base.org/base-account/guides/authenticate-users)
- [docs.base.org/base-account/framework-integrations/wagmi/sign-in-with-base](https://docs.base.org/base-account/framework-integrations/wagmi/sign-in-with-base)
- [docs.base.org/base-account/improve-ux/batch-transactions](https://docs.base.org/base-account/improve-ux/batch-transactions)
- [docs.base.org/base-account/improve-ux/sponsor-gas/paymasters](https://docs.base.org/base-account/improve-ux/sponsor-gas/paymasters)
- [docs.base.org/base-account/reference/core/capabilities/dataSuffix](https://docs.base.org/base-account/reference/core/capabilities/dataSuffix)
- [docs.base.org/ai-agents](https://docs.base.org/ai-agents)
- [docs.base.org/ai-agents/setup/agent-registration](https://docs.base.org/ai-agents/setup/agent-registration)
- [docs.base.org/ai-agents/setup/agent-builder-codes](https://docs.base.org/ai-agents/setup/agent-builder-codes)
- [docs.base.org/ai-agents/setup/wallet-setup](https://docs.base.org/ai-agents/setup/wallet-setup)
- [docs.base.org/ai-agents/payments/accepting-payments](https://docs.base.org/ai-agents/payments/accepting-payments)

**CDP docs:**
- [docs.cdp.coinbase.com](https://docs.cdp.coinbase.com)
- [docs.cdp.coinbase.com/x402/welcome](https://docs.cdp.coinbase.com/x402/welcome)
- [docs.cdp.coinbase.com/x402/quickstart-for-sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- [docs.cdp.coinbase.com/x402/network-support](https://docs.cdp.coinbase.com/x402/network-support)
- [docs.cdp.coinbase.com/x402/mcp-server](https://docs.cdp.coinbase.com/x402/mcp-server)
- [docs.cdp.coinbase.com/agentic-wallet/welcome](https://docs.cdp.coinbase.com/agentic-wallet/welcome)
- [docs.cdp.coinbase.com/agent-kit/welcome](https://docs.cdp.coinbase.com/agent-kit/welcome)
- [docs.cdp.coinbase.com/sdks/cdp-sdks-v2](https://docs.cdp.coinbase.com/sdks/cdp-sdks-v2)

**Standards:**
- ERC-4361 (SIWE) — eips.ethereum.org/EIPS/eip-4361
- ERC-5192 (Soulbound) — already in use for SponsorReceiptSBT
- ERC-5792 (wallet_sendCalls) — eips.ethereum.org/EIPS/eip-5792
- ERC-6492 (Predeploy signature) — eips.ethereum.org/EIPS/eip-6492
- ERC-8004 — [8004.org](https://www.8004.org)
- ERC-8021 (Builder Codes dataSuffix) — already wired in our existing transactions
- ERC-8128 — [erc8128.slice.so/concepts/overview](https://erc8128.slice.so/concepts/overview)
- SIWA — [siwa.id](https://siwa.id)

---

## 8. What Locks This Document

This document is **read-only after first founder approval**. Changes require:

1. New verified source (Base/CDP doc update, new ERC, new package release)
2. Open question resolved by founder decision
3. Sprint retrospective surfaced a constraint not anticipated

Updates land as additional dated sections (`§ Update YYYY-MM-DD`), not in-place edits. Plan history matters for audit.

---

**Sign-off block (when approved):**

```
Approved by: ______________________________  Date: __________
Locked decisions: §3.1 stack, §3.2 SDK peer deps, §3.3 MCP pattern
Next action: Sprint X1 (Layer 1A) verification + scaffold
```
