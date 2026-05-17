# CR1 — R2: Packages + Developer Surface Inventory

**Track:** R2 — Packages + Developer Surface
**Scope:** all `packages/*` in the MAS monorepo; npm-published state; consumer graph; test + doc coverage; Phase 1 → Phase 5 trajectory readiness
**Branch:** `cr1/r2-packages-developer-surface` (from `origin/main` @ `f3a7831`)
**Author posture:** read-only audit, VTP discipline (verify-then-pass-one)
**Audit date:** 2026-05-17
**Tone:** audit-prep, domain-neutral

> All "claim verified" markers below mean: the claim was checked against a live command (npm view, grep, git status, etc.) at audit time. "Drift" means a claim was checked and found to disagree with reality.

---

## 1. Master package inventory

11 packages total. **4 publishable** (publishConfig.access=public). **7 internal** (private:true).

| Package | npm published? | Registry version (latest) | Last publish | Public scope? | Repo path | Test coverage | README state | Phase tag |
|---|---|---|---|---|---|---|---|---|
| `@skillos/sdk` | ✅ yes | `0.2.1` | 2026-05-11 18:37 UTC | public | `packages/sdk` | 0 unit tests | 175 lines, install + 30-line example | Phase 1 active, Phase 2 substrate-ready API surface |
| `@skillos/mcp` | ✅ yes | `0.1.0` | 2026-05-11 21:56 UTC | public | `packages/mcp` | 0 unit tests | 103 lines, install + Claude Desktop config | Phase 1 active |
| `@skillos/cli` | ✅ yes | `0.1.0` | 2026-05-11 21:58 UTC | public | `packages/cli` | 0 unit tests | 119 lines, install + 30-second walkthrough | Phase 1 active |
| `@skillos/skills` | ✅ yes | `0.1.0` | 2026-05-11 19:05 UTC | public | `packages/skills` | n/a (skill pack, no JS) | 121 lines, distribution channels documented | Phase 1 active (mdskills.ai listing pending) |
| `@skillos/ai-coach` | ⛔ private | n/a (0.3.0 in tree) | n/a | n/a | `packages/ai-coach` | 0 unit tests | 33 lines | Phase 1 internal |
| `@skillos/contracts` | ⛔ private | n/a (0.3.0 in tree) | n/a | n/a | `packages/contracts` | 0 unit tests | 52 lines | Phase 1 internal |
| `@skillos/duel-backend` | ⛔ private | n/a (0.3.0 in tree) | n/a | n/a | `packages/duel-backend` | **8 unit tests** (CI: 7/8) | 35 lines | Phase 1 internal |
| `@skillos/game-types` | ⛔ private | n/a (0.3.0 in tree) | n/a | n/a | `packages/game-types` | 0 unit tests | 14 lines | Phase 1 internal |
| `@skillos/lib-shared` | ⛔ private | n/a (0.3.0 in tree) | n/a | n/a | `packages/lib-shared` | 0 unit tests | 28 lines | Phase 1 internal |
| `@skillos/sp-engine` | ⛔ private | n/a (0.3.0 in tree) | n/a | n/a | `packages/sp-engine` | **2 unit tests** (CI: 2/2) | 31 lines | Phase 1 internal |
| `@skillos/ui` | ⛔ private | n/a (0.3.0 in tree) | n/a | n/a | `packages/ui` | **1 unit test** (CI: 1/1) | 31 lines | Phase 1 internal |

**Verification:** `npm view @skillos/<pkg> versions time --json` at 2026-05-17 confirms all four publish dates; `git log -1 origin/main` confirms tree HEAD at `f3a7831`.

**Source-vs-registry version drift inventory** (claim verified per-package):

| Package | Tree HEAD version | Registry latest | Drift? |
|---|---|---|---|
| `@skillos/sdk` | `0.2.1` | `0.2.1` | aligned |
| `@skillos/mcp` | `0.1.0` | `0.1.0` | aligned |
| `@skillos/cli` | `0.1.0` | `0.1.0` | aligned |
| `@skillos/skills` | `0.2.0` | `0.1.0` | **DRIFT — 0.2.0 unpublished** |
| `@skillos/sdk` (history) | n/a | `0.1.0`, `0.2.1` | **GAP — 0.2.0 never published** |

The `@skillos/sdk` `0.1.0 → 0.2.1` jump (with no `0.2.0` in the registry) suggests a botched mid-publish; no rollback marker, no `deprecated` flag on `0.1.0` either. The `@skillos/skills` 0.2.0 bump exists in the tree (incl. `SKILL.md` frontmatter + `mdskills-submission.json`) but has not been pushed to the registry. VALIDATION.md's Test 1 ("Skill Advisor regen on mdskills.ai") still has `Status: ☐ pending (founder)` — implying the publish is intentionally gated on the founder's catalog-refresh check.

---

## 2. Per-package surface map

### 2.1 `@skillos/sdk` (Phase 1 ✅ shipped, Phase 2 substrate)

**Public exports** (verified at `packages/sdk/src/index.ts`):
- Vanilla: `createSkillOSClient`, `SkillOSApiError`, `SkillOSNotSignedInError`, types `SkillOSClient`, `SkillOSClientConfig`, `SkillOSEnv`, `SkillOSPaths`, `SkillOSComponents`
- React (`/react` subpath): `SkillOSProvider`, hooks `useSkillOSAgent`, `useSkillOSAuth`, `useSkillOSDataSuffix`, `useSkillOSLeaderboard`, `useSkillOSScore`, `useSkillOSSponsor`, `useSkillOSTournaments`, related types
- Agent: `createSkillOSAgentClient`, types `SkillOSAgentClient`, `SkillOSAgentClientConfig`, `AgentSignInResult`, `AgentScoreSubmitInput`, `AgentScoreSubmitResult`, `AgentProfilePatchInput`
- Contracts: `builderCodeToDataSuffix`, `ERC20_APPROVE_ABI`, `getChainAddresses`, `SPONSORSHIP_MODULE_ABI`, `usdcAtoms`, type `ChainAddresses`

**Internal architecture**: `vanilla.ts` (openapi-fetch wrapper) → `react.tsx` (provider + 8 hooks composed atop vanilla) → `agent.ts` (SIWA + ERC-8128 path) → `contracts.ts` (inlined minimal contract surface, no workspace dep on `@skillos/contracts`). Subpath imports tree-shake cleanly because `sideEffects:false`. The vanilla `'@buildersgarden/siwa/siwa'` and `'@buildersgarden/siwa/signer'` imports are deliberate subpath usage — the barrel was found brittle (memory entry `reference_buildersgarden_siwa_barrel_trap`).

**Build behavior**: `prepare: npm run build` runs at `npm ci` time, which triggers `prebuild → generate-types` → live HTTP fetch of `https://api.skillos.network/openapi.json`. Memory entry `project_packages_sdk_circular_build_dep` confirms this is a known fragility, queued as X8 axis-6 fix candidate.

**Backend dependencies** (verified via source grep):
- `api.skillos.network` — all read paths via openapi-fetch
- `@buildersgarden/siwa` — SIWB nonce + verify (subpath `/siwa`, `/signer`, `/erc8128`)
- `viem` (peer) — typed addresses, `Address` / `Hex`
- `wagmi` (peer) — `useSignMessage`, `useAccount`, `useWalletClient`, `useConnect`
- `@tanstack/react-query` (peer) — `useQuery`, `useMutation` for hook state

**Consumer list** (verified — strict `from ['"]@skillos/sdk[/]...'` grep across `apps/`):
- 7 apps consume via React subpath (`@skillos/sdk/react`): 2048, clicker, match3, minesweeper, sponsor, sudoku, wordle
- 1 app (2048) additionally consumes from root subpath (`@skillos/sdk`) for `builderCodeToDataSuffix`
- `@skillos/mcp` consumes `createSkillOSClient` + `createSkillOSAgentClient`
- `@skillos/cli` consumes `createSkillOSClient` + agent client
- `@skillos/ui` consumes (devDep only — useSoloRetry shim type) — NOTE: ui's package.json declares `@skillos/sdk` as both devDep and peerDep, no runtime dep; verified
- `apps/api` does NOT consume the SDK (intentional — see §2.2)

### 2.2 `@skillos/mcp` (Phase 1 ✅ shipped)

**Public exports**: `bin: skillos-mcp` (binary entry only). Library subpath `@skillos/mcp/server` exposes `buildServer()` and constants but the README treats this as internal — no documented consumer.

**Tools registered** (verified at `packages/mcp/src/server.ts`): 8 tools — `list_tournaments`, `get_tournament`, `get_leaderboard`, `fund_pool`, `submit_score`, `agent_register`, `fetch_match_replay`, `fetch_cohort_snapshot`. All registered in stable alphabetical order to keep `tools/list` deterministic for LLM clients that fingerprint server capabilities (verified at server.ts line 36).

**Transports**: stdio (default — Claude Desktop / Cursor / Codex) and Streamable HTTP per the 2025-06-18 MCP spec. Selected via `--transport stdio|http`.

**Backend dependencies**:
- `api.skillos.network` via `@skillos/sdk`
- x402 paywalled endpoints via `@x402/axios` + `@x402/core` + `@x402/evm` (T2/T3 tiers)
- On-chain writes via `viem.writeContract` directly (no library helpers — per memory entry `project_x4_siwa_library_signer_brittleness`)
- ERC-8004 registry minimal ABI lifted from `@buildersgarden/siwa/dist/registry.js`

**Consumer list**: zero internal consumers; intended for external MCP clients (Claude Desktop, Cursor, Codex, agent runtimes). No production install verification recorded in this repo at audit time.

### 2.3 `@skillos/cli` (Phase 1 ✅ shipped)

**Public exports**: `bin: skillos`. Library exports are not declared — pure CLI.

**Subcommands** (verified at `packages/cli/src/index.ts`): `init`, `login`, `tournament`, `score`, `sponsor`, `agent`, `data` (7 top-level subcommands; full list per README is broader once subcommands are flattened).

**Framework**: Citty (UnJS) for command structure.

**Backend dependencies**:
- `@skillos/sdk` for all read paths + agent client
- `viem` direct for on-chain writes (`tournament fund`, `agent register`)
- `siwe` for SIWB message construction (auth)
- `@x402/axios` for `data fetch` paid GETs

**Session storage** (verified at README §Sessions): `~/.skillos/config.json` + `~/.skillos/session.json`, both written `0600`. SIWB bearer cached one per env/wallet; SIWA receipt cached when `--agent`. Auto-expire at 24h.

**Consumer list**: zero internal consumers (correct — CLI is a leaf product).

### 2.4 `@skillos/skills` (Phase 1 ✅ shipped 0.1.0, ⏳ 0.2.0 unpublished)

**Package shape**: metadata-only skill pack — `main: null`, `files: null` in registry. Tarball ships `SKILL.md`, `prompts/`, `references/`, `templates/`, `VALIDATION.md`, `mdskills-submission.json`. No JS, no TypeScript build.

**Prompts** (verified at `packages/skills/prompts/`): `suggest-integration.md`, `wire-builder-code.md`, `select-tier.md`, `verify-attribution-live.md`, `error-recovery.md` (5 prompts).

**References**: `auth-patterns.md`, `common-patterns.md`, `error-recovery.md`, `sdk-integration-30-line.md`, `testnet-endpoints.md`, `tournament-flow.md` (6 references).

**Templates**: `skill-game-scaffold/` — full Vite + React 18 + TS bootstrap (verified via `ls`: vite.config.ts, tsconfig.json, src/, index.html, package.json).

**Compatibility manifest** (verified at `mdskills-submission.json`): `agents: [claude-code, claude-desktop, cursor, codex, gemini-cli, windsurf, continue-dev, amp, opencode]`. Peer: `@skillos/sdk: ^0.2.1`.

**Distribution status**:
- npm: 0.1.0 published; 0.2.0 staged but not pushed
- base/skills: `npx skills add skillos/skillos-skills` claimed in README; not independently verified at audit time
- mdskills.ai: VALIDATION.md Test 1 (`Status: ☐ pending (founder)`) — listing submission still pending
- CCGS: `npx mdskills install youngstar-eth/skillos` claimed in README; not independently verified

**Consumer list**: zero in-repo consumers (correct — skill pack is for external AI coding agents).

### 2.5 Private packages (consumed by per-game apps and orchestrator)

| Package | Public exports | Internal architecture | Consumed by (apps) | Cross-pkg consumers |
|---|---|---|---|---|
| `@skillos/ai-coach` | `generateCoachFeedback`, `generateRecap`, `checkPlausibility`, `generateSoloCoachFeedback`, `generateSoloRecap` + 6 model constants + types | 5 sub-pipelines under `src/` (coach, recap, anticheat, solo-coach, solo-recap). Anthropic SDK client. | 2048, clicker, match3, minesweeper, sudoku, wordle (6 — phantom dep, see §5) | `@skillos/duel-backend` |
| `@skillos/contracts` | barrel re-exports from `abi`, `addresses`, `game-slug`, `match-id` | Source-of-truth for Base Sepolia + Base mainnet (null) addresses and minimal ABI fragments. | 2048, clicker, match3, minesweeper, orchestrator, sponsor, sudoku, wordle (8) | `@skillos/duel-backend`, `@skillos/lib-shared`, `@skillos/ui` |
| `@skillos/duel-backend` | barrel re-export of 18+ submodules across `settle`, `cron`, `api/*` | Server-only — pulls in `next`, `@vercel/functions`. Owns settle, decide-winner, cron handlers, all `api/*` route handlers for per-game Next.js apps. | 2048, clicker, match3, minesweeper, orchestrator, sponsor, sudoku, wordle (8) | n/a |
| `@skillos/game-types` | duel system types: `Duel`, `MatchObject`, `DuelStatus`, `PlayerSlot`, `SubmitResponse`, `ApiError` | Single file (`src/index.ts`). | 0 direct app consumers (used only transitively) | `@skillos/duel-backend`, `@skillos/lib-shared`, `@skillos/ui` |
| `@skillos/lib-shared` | barrel: `supabase`, `seed`, `attestation`, `rpc`, `http` | Server-only — `node:crypto`, Next.js server runtime, service-role Supabase clients. Header comment explicitly forbids client-component imports. | 2048, orchestrator (2 — others declare but don't import) | `@skillos/duel-backend` indirectly (via game-types) |
| `@skillos/sp-engine` | `awardSP`, `awardSPBreakdown`, `levelForSP`, `spForNextLevel`, constants `BASE_SP`, `MULTIPLIER`, `LEVEL_THRESHOLDS`, anchor helpers (`canonicalize`, `hashSnapshot`, `buildSnapshot`), types | Pure functions, no I/O. Uses `node:crypto` for SHA-256 in anchor.ts. | orchestrator (1) | `@skillos/duel-backend` |
| `@skillos/ui` | 16 components/hooks: `Providers`, `Header`, `WalletButton`, `Timer`, `PopupHint`, `AddressDisplay`, `ModeChooser`, `DuelComingSoon`, `DuelResultCard`, `SoloResultCard`, `SkillOSWordmark`, `ReadyMarker`, `EmbedWalletFallback`, `wagmiConfig`, `Providers`, hooks `useBasename`, `useIsEmbedded`, `useMiniAppReady`, `useSoloRetry`, helper `selectDuelResultBranch`, model constants | Client-side React. `farcaster/miniapp-sdk` + wagmi connectors. | 2048, clicker, match3, minesweeper, sponsor, sudoku, wordle (7) | none |

### 2.6 `apps/api` — intentionally standalone

Verified via `grep -rE "@skillos/" apps/api`: every `@skillos/*` mention in apps/api source is in a **comment**, not an import. Two comments call this out explicitly:
- `apps/api/src/lib/duel/anthropic-client.ts`: `// the @skillos/ai-coach workspace dep so this app stays a standalone deploy`
- `apps/api/src/lib/games.ts`: `// apps/api avoids the SDK` … `// Equivalent to @skillos/sdk's builderCodeToDataSuffix — kept inline`

`apps/api` is deployed via `scripts/prepare-bundle.sh` + `vercel deploy --prebuilt` (memory entry `reference_apps_api_prebuilt_deploy_only` — verified at `apps/api/scripts/prepare-bundle.sh`). The workspace-symlink approach breaks Vercel's NFT bundler, so the API vendors its own copies of `games.ts` and the Anthropic client. This is an intentional architectural choice, not drift.

**Test surface**: `apps/api/test/{agents-matches,charge-retry-fee,games,x402-client}.test.ts` (4 files). CI runs only `games.test.ts`; the other three are NOT in the `test-ts` CI matrix (verified at `.github/workflows/ci.yml` line 72).

---

## 3. Developer experience assessment

### 3.1 `@skillos/sdk` DX

- **30-line integration test**: README ships a 30-line Next.js layout + a Tournaments client component. Code is syntactically complete and matches the live API of `useSkillOSAuth`/`useSkillOSTournaments` (verified at `react.tsx`). External tester would need to additionally bring their own `wagmiConfig`.
- **Error message quality**: `SkillOSApiError` carries `{ status, code, message, details? }`. Codes follow the API error envelope (e.g., `AUTH_BEARER_EXPIRED`, `AUTH_NONCE_CONSUMED`, `NOT_FOUND`). README documents the recovery pattern. `SkillOSNotSignedInError` thrown synchronously before any HTTP request.
- **TypeScript types completeness**: Request/response types are generated from the live OpenAPI spec at `npm run generate-types`. Hooks are typed via `paths`/`components` from `api.gen.ts`. **Risk**: `prebuild` triggers a live HTTP fetch on every install — see §5 drift inventory.
- **Subpath strategy**: 3 entries (`.`, `./react`, `./vanilla`) plus `./package.json`. The default entry re-exports both vanilla and React surfaces, which is convenient but couples non-React consumers to React unless they reach for the `/vanilla` subpath (documented).
- **`use client` directive injection**: handled by a post-build mjs script (`scripts/post-build.mjs`), not by tsup. Verified — keeps tsup's directive-hoisting warnings quiet.
- **Test coverage**: 0 unit tests in the package. The CI workflow does not run anything against `packages/sdk`. The 30-line integration test described in the README is documentation, not executable CI.

### 3.2 `@skillos/mcp` DX

- **Tool count**: 8 (matches §2.2). Read tools need no auth; write tools need `SKILLOS_PRIVATE_KEY`; agent tools additionally need `SKILLOS_AGENT_ID`.
- **Claude Desktop install test**: README's JSON snippet is correct (verified — `command: npx`, `args: ['-y', '@skillos/mcp']` against the registry name). No automated install-verification test exists in this repo; the README does not record a "successful Claude Desktop install verified" entry.
- **x402 integration**: `fetch_match_replay` ($0.01 T2) and `fetch_cohort_snapshot` ($0.10 T3) wired via `@x402/axios` with the EVM exact scheme registered. README documents both. The two tier endpoints exist on `apps/api`-side; out-of-scope for R2.
- **Streamable HTTP**: default-binds to `127.0.0.1` (verified at `src/index.ts` line 64). README explicitly warns against `--host 0.0.0.0` without TLS + auth.
- **Test coverage**: 0 unit tests. No registered tool exercises a CI fixture.

### 3.3 `@skillos/cli` DX

- **Commands**: 7 top-level + flattened subcommands. README's 30-second walkthrough is correct against the citty command definitions.
- **`init` flow**: writes `~/.skillos/config.json` with `0600` permissions.
- **`login` flow**: caches a SIWB bearer for humans or a SIWA receipt for `--agent` mode. 24h server TTL respected.
- **x402 fetch state**: `skillos data fetch` uses `@x402/axios`, identical wiring to MCP `fetch_*` tools.
- **Wallet hygiene**: README explicitly warns against reusing trustedSigner / sponsor / deployer / production-agent wallets — consistent with memory entry `reference_secret_handling_split`.
- **Test coverage**: 0 unit tests. No CI exercise of any subcommand.

### 3.4 `@skillos/skills` DX (skill pack v0.2)

- **Skill manifest quality**: `SKILL.md` frontmatter declares both `when_to_invoke` and `when_NOT_to_invoke` (verified). Includes 6+ trigger conditions and 4 refusal conditions. Domain-neutrality discipline preserved — public-facing copy frames as skill gaming, no substrate language.
- **Permissions block**: present in v0.2.0 (verified). Each permission (`filesystem_read`, `filesystem_write`, `shell_execution`, `network_access`) has `purpose` + `scope` keys. Bounded scopes: `filesystem_write` restricted to `app/`, `src/`, `components/`; `shell_execution` whitelisted (no `cast send`, no `git push`); `network_access` whitelisted to RPC, Blockscout, BaseScan, api.skillos.network, api.base.dev.
- **mdskills.ai listing state**: VALIDATION.md Test 1 explicitly pending (founder). README claims the v0.2.0 target is to raise Skill Advisor score from 3.2 → 7+; no actual post-regen score in this repo at audit time.
- **base/skills compat**: claimed in README as `npx skills add skillos/skillos-skills`. Not independently verified.
- **CCGS path**: claimed in README as `npx mdskills install youngstar-eth/skillos`. Not independently verified.
- **Scaffold template**: `templates/skill-game-scaffold` includes Vite + React 18 + TS bootstrap, dated 2026-05-17 per file mtimes.

### 3.5 Cross-cutting test infrastructure observations

- **No `test` task in `turbo.json`** (verified). Tests are invoked directly in CI via `npx tsx --test`.
- **CI runs 12 of 14 test files** (verified at `.github/workflows/ci.yml`): 8 in duel-backend, 2 in sp-engine, 1 in ui, 1 in apps/api. **Not in CI**: `apps/api/test/{agents-matches,charge-retry-fee,x402-client}.test.ts`.
- **`packages/sp-engine` test script lies**: package.json `test: "tsx --test src/engine.test.ts"` only runs one of two test files; `anchor.test.ts` is invoked only by CI's explicit listing, not by `npm test`.
- **Test runner mix**: 13 files use `node:test` (via tsx); only `apps/api` declares vitest as a dev dep (but its CI tests are also invoked via `tsx --test`).
- **None of the 4 publishable packages have unit tests in their own tree** (verified).

---

## 4. Phase trajectory readiness

The CR1 spec asks Phase 1 / Phase 2 / Phase 5 readiness. The codebase's phase framing is:

- **Phase 1** — testnet (Base Sepolia), skill-gaming dogfood, current. Architecture doc `docs/architecture/developer-surface.md` is the canonical reference.
- **Phase 2** — mainnet, audit-gated, Q3 2026 per `docs/strategy/round-spec.md`.
- **Phase 5** — substrate / multi-vertical (AI benchmarks, coding contests, recruitment) — referenced obliquely in `docs/architecture/developer-surface.md` §2.4 ("Domain Neutrality Invariant") and `docs/strategy/communication-frame-v2.md` as "Phase 5-aligned". No explicit Phase 5 doc.

### 4.1 Phase 1 — dev surface dogfooded by own apps? 3rd party integrations possible?

**Dogfood status**: ✅ partial — and predominantly via workspace protocol (`@skillos/X: "*"`), not via the published npm tarballs.

| Layer | Internal consumer count | External consumer count (verified) |
|---|---|---|
| `@skillos/sdk` (React subpath) | 7 in-repo apps | **0** outside the monorepo |
| `@skillos/sdk` (vanilla subpath) | 1 in-repo (apps/2048) — though demo only | 0 |
| `@skillos/sdk` (agent client) | 0 in-repo runtime consumers | 0 |
| `@skillos/mcp` | 0 in-repo | 0 (no audit-time verification of any Claude Desktop install) |
| `@skillos/cli` | 0 in-repo | 0 |
| `@skillos/skills` | 0 in-repo | 0 (mdskills.ai listing pending) |

**External-consumer drift check**: the `skillbase-apex` marketing site (`/Users/inancayvaz/skillbase-apex`) has zero `@skillos/*` declared dependencies. The two `@skillos/sdk` mentions are **decorative strings** inside landing-page motion components (`components/skillos/landing/motion.tsx`, `components/skillos/how/data.ts`) — not real imports. `skillbase-demo-video` also has no `@skillos/*` deps.

**3rd party integration possibility today**:
- `@skillos/sdk` 0.2.1 is technically installable. Peer requirements are documented (wagmi/viem/react/RQ + Base Account optional). A greenfield Next.js 14/15/16 app could integrate per the README's 30-line example, modulo the live-API-fetch trap in `prebuild` (memory entry `project_packages_sdk_circular_build_dep` — outage = SDK won't install).
- `@skillos/mcp` 0.1.0 should drop into Claude Desktop via the published `npx -y @skillos/mcp` command, but no live install verification exists in this repo. The 4 wallet-required tools assume the consumer has a testnet EOA.
- `@skillos/cli` 0.1.0 is `npm install -g` ready; same SIWB/SIWA flow as the SDK.

### 4.2 Phase 2 — 3rd party SDK rollout (Unity WebGL / Roblox / Phaser / gb-studio)

**Current SDK shape vs Phase 2 targets**:

| Target | What exists today | Gap |
|---|---|---|
| **Unity WebGL** | Vanilla `@skillos/sdk/vanilla` is framework-agnostic but ESM-only and depends on `openapi-fetch` + browser fetch | No JSLib bridge, no Unity package, no documented signing flow for the Unity → browser handoff |
| **Roblox** | None | Roblox is Luau-only — would need a separate HTTP-only client (REST + signing helpers), since `@skillos/sdk` is TS/JS |
| **Phaser** | Vanilla subpath would work in principle (it's just `<canvas>` + JS) | No Phaser-specific docs, no example app, no plugin |
| **gb-studio** | None | gb-studio compiles to Game Boy ROMs — out of scope until a companion HTTP-relay service is defined |

Vanilla client is the right architectural foundation (tree-shakeable, no React, no wagmi peer required), but:
- Phase 2 mainnet write paths require the SDK to ship mainnet contract addresses; today the `MAINNET` constant in `src/contracts.ts` is `null`, and the SDK refuses to construct mainnet calldata until populated (verified at lines 30-32 of contracts.ts).
- T1/T2/T3 score tiers: the SDK type allows `tier: 'T0' | 'T1' | 'T2' | 'T3'` and the README is honest — "T0 only in v0.1. T1+ returns 501 until Phase 2" (verified against MCP submit_score docstring too).
- No "engine adapter" pattern yet — the SDK assumes the consumer wraps it; no per-engine binding crate.

### 4.3 Phase 5 — substrate-grade data emission (T0-T3, replay artifacts, deterministic verification hooks)

**T0-T3 tier compliance** (verified at `docs/architecture/developer-surface.md` lines 215-225):
```
T0 score-only         — minimum
T1 score + seed + duration
T2 score + seed + duration + input log (replay-verifiable)
T3 T2 + state hashes per move (full deterministic replay)
```

| Substrate requirement | Code state | Notes |
|---|---|---|
| T0 emission via SDK | ✅ shipped | `useSkillOSScore` + `agentClient.scores.submit({ tier: 'T0' })` both routable |
| T1+ emission via SDK | ⏳ 501 | API rejects today; SDK accepts the type but call fails until Phase 2 plausibility lands (memory entry `project_phase2_mainnet_blocker_plausibility`) |
| Replay artifacts via developer surface | ✅ shipped (read-only) | MCP `fetch_match_replay` (T2, $0.01 x402) + CLI `data fetch` reach the same endpoints |
| Deterministic verification hooks | ⏳ planned | `@skillos/sp-engine`'s `buildSnapshot`/`hashSnapshot` + `canonicalize` is the substrate primitive; not yet exposed via the public SDK |
| Domain neutrality preserved | ✅ partial | Architecture doc §2.4 invariant exists; SDK exports use `submitScore`, `tournament`, `participant` — but internal types reference `Duel` / `MatchObject` / `Player1`. The public SDK API stays neutral; the workspace `@skillos/game-types` is duel-specific |

### 4.4 Substrate-grade emission via internal packages

`@skillos/sp-engine` exposes canonicalization + snapshot hashing as a workspace export but is NOT published. If Phase 5 substrate consumers (AI labs, benchmark hosts) need deterministic replay verification, this would have to either:
1. become a separate `@skillos/replay` published package, or
2. fold into `@skillos/sdk`'s public surface (currently private).

No decision recorded in audit-time docs. Open question for §6.

---

## 5. Drift inventory

Memory-vs-reality checks, each tagged with the verification command + result.

### D1 — `@skillos/skills` registry version stale

- Memory: `project_post_yc_npm_granular_token_active` says "all packages" publishable, last token active until ~2026-08-09.
- Reality: tree has `@skillos/skills@0.2.0` in `package.json` + `mdskills-submission.json`; registry latest is `0.1.0` (published 2026-05-11 19:05 UTC).
- Verified: `npm view @skillos/skills versions --json` → `["0.1.0"]`. Tree: `node -e "console.log(require('./packages/skills/package.json').version)"` → `0.2.0`.
- Diagnosis: intentional gate — `VALIDATION.md` Test 1 marked pending (founder). The 0.2.0 bump is staged but waiting on mdskills.ai catalog refresh check before publish.

### D2 — `@skillos/sdk` registry has `0.1.0` and `0.2.1`, no `0.2.0`

- Memory: nothing covers this.
- Reality: `npm view @skillos/sdk versions --json` → `["0.1.0", "0.2.1"]`. No `0.2.0` ever published.
- Diagnosis: botched mid-publish, or an intentional version-skip (e.g., `0.2.0` cancelled before tarball upload). No `deprecated` flag on `0.1.0` — both versions are installable today.

### D3 — Public GitHub mirror promised in READMEs, currently private

- Memory: `project_skillos_rebrand_state` notes the rebrand `skillbase` → `skillos`; doesn't claim mirror is public.
- README claims (verified at `packages/sdk/package.json` → `repository.url = git+https://github.com/youngstar-eth/skillos.git`; `packages/skills/README.md` line 121 → `Public mirror via subtree split at github.com/youngstar-eth/skillos`).
- Reality: `gh repo view youngstar-eth/skillos --json visibility` → `"PRIVATE"`. `isPrivate: true`.
- Diagnosis: published packages link to a private GitHub repo. External developers who run `npm view @skillos/sdk` and click through the repository URL will land on a 404. This is a Phase 1 dogfood friction point.

### D4 — Phantom dep: 6 game apps import `@skillos/ai-coach` without declaring it

- Memory: not covered.
- Reality: `apps/{2048,clicker,match3,minesweeper,sudoku,wordle}` all import `@skillos/ai-coach` (verified by source grep — `apps/2048/src/components/AICoach.tsx`, `apps/2048/src/components/AIRecap.tsx`, etc.). None declare it in `package.json` dependencies.
- Diagnosis: works in monorepo because npm hoists `@skillos/ai-coach` from `packages/ai-coach`. Breaks under `pnpm`, breaks under `npm install --no-hoist`, breaks if the package goes external. Lint rule could catch this (no current eslint plugin configured).

### D5 — Declared-but-not-imported: `@skillos/game-types` everywhere, `@skillos/lib-shared` in 5 apps

- Memory: not covered.
- Reality: `apps/{2048,clicker,match3,minesweeper,sudoku,wordle}` all declare `@skillos/game-types` in `package.json` dependencies but do not import it directly (verified — 0 source imports). `@skillos/lib-shared` is declared by `apps/{clicker,match3,minesweeper,sudoku,wordle,sponsor}` but only imported by `apps/{2048,orchestrator}`.
- Diagnosis: vestigial declarations from copy-paste app scaffolds. Both packages are pulled in transitively, so declaring them is harmless — but cleaning them up tightens the dep graph and reveals the real ownership map.

### D6 — `packages/sp-engine` `npm test` script runs only 1 of 2 test files

- Memory: not covered.
- Reality: `package.json` → `test: "tsx --test src/engine.test.ts"`. The file `src/anchor.test.ts` exists but is not invoked by `npm test`. CI runs both via explicit listing in `.github/workflows/ci.yml`.
- Diagnosis: local `npm test` is a misleading subset of CI. Easy fix: `test: "tsx --test src/*.test.ts"`. Not blocking; CI catches the gap.

### D7 — `apps/api` tests partially covered in CI (3/4 not run)

- Memory: not covered.
- Reality: 4 test files exist (`agents-matches.test.ts`, `charge-retry-fee.test.ts`, `games.test.ts`, `x402-client.test.ts`). CI only runs `games.test.ts`.
- Diagnosis: deliberate? `charge-retry-fee.test.ts` is from the X15.3-X15.7 sprint window (recent). Possibly waiting on vitest harness setup. CR1 R4 (cron/data) may already know more.

### D8 — `@skillos/sdk` `prepare` triggers live API fetch on every install

- Memory: `project_packages_sdk_circular_build_dep` flags this for X8 axis-6.
- Reality verified: `packages/sdk/scripts/generate-types.ts` fetches `https://api.skillos.network/openapi.json` on every `prebuild`, and `prepare: npm run build` runs at `npm ci` time. If `api.skillos.network` is down, the SDK won't install.
- Diagnosis: known fragility. The X1 lesson (vendored OpenAPI spec) would resolve it. Open question §6.

### D9 — Test runner declared inconsistently

- Memory: not covered.
- Reality: only `apps/api` declares `vitest` (^2.1.9); CI uses `tsx --test` (Node's built-in test runner). `vitest` is installed but not invoked.
- Diagnosis: drift between intent and execution. Worth deciding before introducing more tests.

### D10 — CLAUDE.md Next.js version stale

- Memory: `project_claudemd_nextjs_version_stale` flags it.
- Reality: spot-check of `apps/2048/package.json` shows `next: ^16.2.4` (verified). CR1 R1 will catch this — flagging here for cross-track awareness; out of R2 scope.

---

## 6. Open questions for founder

1. **`@skillos/sdk` 0.2.0 gap.** Was this an intentional skip or a botched publish? If botched, do we want to publish a `0.2.0` tag pointing at the same tarball as `0.2.1` so range-pinners (`^0.2.0`) don't trip on its absence? (Likely fine to leave, but a one-paragraph decision in `docs/decisions/` would freeze the answer.)

2. **`@skillos/skills` 0.2.0 publish.** Should we go ahead and publish `0.2.0` to npm now, then run mdskills.ai catalog refresh against the published tarball? Today the SKILL.md frontmatter version (`0.2.0`) does not match the published registry version (`0.1.0`), so an agent that picks up the README will see a self-inconsistent version pair.

3. **Public GitHub mirror.** README claims a public mirror at `github.com/youngstar-eth/skillos`. Repo is currently private. Either:
   - (a) flip the repo to public before any external developer hits the npm URLs, or
   - (b) drop the public-mirror claim from READMEs until the mirror lands, or
   - (c) subtree-split each public package to its own public repo (e.g., `youngstar-eth/skillos-sdk`) — heaviest but most idiomatic.

4. **`packages/sdk` live-API build dep.** Memory entry already flags this for X8 axis-6. Confirming this is still the plan? Alternatives: vendor the openapi.json into the repo and regenerate via PR (CI-friendly, no install-time HTTP).

5. **Phantom + vestigial deps.** Do we want a one-PR cleanup pass to (a) add `@skillos/ai-coach` to the 6 game apps that import it, (b) remove `@skillos/game-types` from app deps where it's only consumed transitively, (c) remove `@skillos/lib-shared` from the 5 apps that declare-but-don't-import? Risk: minimal in monorepo, high value if/when any of these get cracked out to standalone repos for Phase 2.

6. **`@skillos/sp-engine` substrate publication.** Phase 5 ambitions depend on deterministic replay verification. The canonicalization + snapshot-hashing primitives live in this private workspace package today. Decision needed: roll into `@skillos/sdk`, publish as its own `@skillos/replay` package, or keep private until a substrate consumer materializes?

7. **Phase 2 non-React adapters.** Unity WebGL, Roblox, Phaser, gb-studio are mentioned in this R2 spec — is there an existing Phase 2 sprint placeholder? `docs/architecture/developer-surface.md` §3.6 references the Game Launcher (Phase 3+) but no adapter strategy yet.

8. **Apps/api test coverage gap.** 3 of 4 test files outside CI. Add them now or defer until a vitest-on-tsx alignment decision?

9. **Test runner unification.** Stay on Node's built-in test runner (current de-facto majority), or migrate to vitest (declared in apps/api but not actively used)? The decision affects future test ergonomics across all packages.

---

## 7. Findings count summary

- 11 packages inventoried (4 published, 7 internal)
- 4 publishable packages registry-verified
- 7 apps consume workspace packages via 7-package mean dep declaration
- 0 external production consumers of any published package
- 10 drift findings (D1–D10) recorded against memory + claims
- 9 open questions queued for founder

---

## 8. Appendix — verification commands used

```
npm view @skillos/sdk versions time --json
npm view @skillos/mcp versions time --json
npm view @skillos/cli versions time --json
npm view @skillos/skills versions time --json
npm view @skillos/sdk@0.2.1 --json
npm view @skillos/skills@0.1.0 --json
grep -rE "from ['\"]@skillos/<pkg>" apps/ packages/ --include='*.ts' --include='*.tsx'
gh repo view youngstar-eth/skillos --json visibility
cat .github/workflows/ci.yml
node -e "console.log(require('./packages/<pkg>/package.json'))"
```
