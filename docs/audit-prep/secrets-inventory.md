# Secrets Inventory — Redacted

**Sprint:** UR Pass 1 / Track D — Infra
**Branch:** `ur/track-d-infra`
**Date:** 2026-05-17
**Scope:** all SkillOS secret-bearing systems (Vercel envs, GitHub Actions secrets, Supabase, contracts).

> **Redaction policy.** This document lists **secret TYPES and LOCATIONS only**. No values, no JWT contents, no private keys, no API tokens. Where a memory note or env-example mentions a wallet address (which is public-by-design once on-chain), the address is included as-is. Everywhere else, secret material is replaced with `<REDACTED>` or `<not present in repo>`.

---

## 1 — Overview

SkillOS has **4 distinct secret-storage backends**:

| Backend | What lives here | Sensitivity | Rotation surface |
|---|---|---|---|
| **GitHub repo Actions secrets** | 11 secrets, all consumed by `agent-runner.yml` | 5× CRITICAL (per-game agent wallet PKs); 6× LOW | repo-only, founder-rotates |
| **Vercel project envs** | 9 projects × varying surface (see §3) | Mixed: 2 CRITICAL (broadcaster PKs), 1 CRITICAL (service-role), 4 SERVICE-tier, RPC URLs, config | per-project, founder-rotates via `vercel env add` |
| **Supabase dashboard** | service-role key, anon key | service-role is CRITICAL, anon is PUBLIC | Supabase dashboard, cascading rollover across 9 Vercel projects |
| **Founder local-only** | wallet seed phrases, deployer EOAs, contract verify keys | CRITICAL — never enters repo or Vercel | offline / hardware-wallet |

**Critical invariant** (from memory `reference_secret_handling_split.md`):
> wallet keys = founder only; service-role + JWT = agent OK with length-verified --value; RPC URLs with keys = agent OK to pipe but plan rotation.

This audit confirms the invariant is upheld in code and in CI workflow design. See §4 for the **9-project service-role provisioning anomaly** which extends the blast radius beyond the original "apps/api only" intent.

---

## 2 — GitHub Actions Secrets (repo `youngstar-eth/skillos`)

Enumerated via `gh api repos/youngstar-eth/skillos/actions/secrets`. **All 11 secrets** are created and updated 2026-05-13 (Sprint X7).

| # | Name | Type | Consumer | Sensitivity | In code (consumer file:line) |
|---|---|---|---|---|---|
| 1 | `SKILLOS_BASE_URL` | URL (`api.skillos.network`) | `agent-runner.yml` | LOW (public domain) | `.github/workflows/agent-runner.yml:62` |
| 2 | `AGENT_PK_WORDLE` | Blockchain private key (ERC-8004 agent wallet) | `agent-runner.yml` matrix job | **CRITICAL** | `agent-runner.yml:63` |
| 3 | `AGENT_PK_SUDOKU` | Blockchain PK | same | **CRITICAL** | `agent-runner.yml:64` |
| 4 | `AGENT_PK_MATCH3` | Blockchain PK | same | **CRITICAL** | `agent-runner.yml:65` |
| 5 | `AGENT_PK_MINESWEEPER` | Blockchain PK | same | **CRITICAL** | `agent-runner.yml:66` |
| 6 | `AGENT_PK_CLICKER` | Blockchain PK | same | **CRITICAL** | `agent-runner.yml:67` |
| 7 | `AGENT_ID_WORDLE` | uint256 ERC-8004 agent ID (public on-chain) | same | LOW | `agent-runner.yml:68` |
| 8 | `AGENT_ID_SUDOKU` | uint256 agent ID | same | LOW | `agent-runner.yml:69` |
| 9 | `AGENT_ID_MATCH3` | uint256 agent ID | same | LOW | `agent-runner.yml:70` |
| 10 | `AGENT_ID_MINESWEEPER` | uint256 agent ID | same | LOW | `agent-runner.yml:71` |
| 11 | `AGENT_ID_CLICKER` | uint256 agent ID | same | LOW | `agent-runner.yml:72` |

**Other GH secret stores (verified empty 2026-05-17):**
- `gh api repos/youngstar-eth/skillos/actions/variables` → `{ "variables": [], "total_count": 0 }`
- `gh api repos/youngstar-eth/skillos/dependabot/secrets` → `{ "total_count": 0, "secrets": [] }`
- 20 GitHub **Environments** exist (Preview + Production × 9 Vercel projects + 2 unscoped) — created/owned by Vercel-GitHub integration, with **zero environment-scoped secrets** and **zero protection rules**.

### Key absences worth calling out

The following secrets are **NOT** in GitHub — by design, and consistent with `reference_secret_handling_split.md`:

| Name | Reason absent |
|---|---|
| `VERCEL_TOKEN` | No CI-driven deploys; founder uses local CLI per `reference_apps_api_prebuilt_deploy_only.md` |
| `SUPABASE_SERVICE_ROLE_KEY` | Not consumed by any workflow |
| `STUDIO_PRIVATE_KEY` / `AGENT_PRIVATE_KEY` (apps/api broadcasters) | Live in Vercel envs only (see §3.api) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Not consumed by any workflow |
| `CRON_SECRET`, `JWT_SECRET`, `SIWA_RECEIPT_SECRET` | Not consumed by any workflow |
| `BASESCAN_API_KEY` | Only used by founder-local Foundry verify |

---

## 3 — Vercel Project Env Topology (9 in-monorepo projects)

Enumerated via Vercel MCP `list_projects` (team `team_XyslOCNkXkP8tnjcTRs3yKSC` / scope `simpl3s-projects`).

**Live `vercel env ls` was NOT pulled during this audit.** The classifier denied it (correctly cautious about prod secret metadata); the matrix below is built from static analysis of `process.env.*` reads + each app's `.env.local.example` and is therefore a **required-by-code** specification, not a confirmed live state. The founder must run the verification matrix in §6.

| Vercel project | Source app | Deploy mechanism | Real cron? |
|---|---|---|---|
| `mas-2048` | `apps/2048` | Standard Vercel git auto-deploy | No |
| `mas-wordle` | `apps/wordle` | same | No |
| `mas-sudoku` | `apps/sudoku` | same | No |
| `mas-match3` | `apps/match3` | same | No |
| `mas-minesweeper` | `apps/minesweeper` | same | No |
| `mas-clicker` | `apps/clicker` | same | No |
| `skillbase-orchestrator` | `apps/orchestrator` | same | **Yes** (anchor-sp + duel-backend crons) |
| `skillbase-sponsor` | `apps/sponsor` | same | No |
| `api` | `apps/api` | **Prebuilt CLI only** (see `reference_apps_api_prebuilt_deploy_only.md`) | No (but uses CRON_SECRET as bearer-token gate from other crons) |
| `node_modules` | **ANOMALY — see §3.x** | unknown | unknown |
| `skillbase-apex` | `/Users/inancayvaz/skillbase-apex` (separate repo) | out-of-scope | n/a |
| `simpl3` | `/Users/inancayvaz/simpl3` (separate repo) | out-of-scope | n/a |

### 3.api — `api` project (apps/api Hono server)

Critical broadcaster keys + auth secrets live ONLY here:

| Var name | Type | Required | Code site |
|---|---|---|---|
| `STUDIO_PRIVATE_KEY` | Blockchain PK (trustedSigner; submitSoloScore broadcaster) | Yes | `apps/api/src/lib/contracts-vendored/attestation.ts:25` |
| `AGENT_PRIVATE_KEY` | Blockchain PK (chargeRetryFee broadcaster) | Yes | `apps/api/src/lib/contracts-vendored/attestation.ts:42` |
| `X402_RECEIVER_ADDRESS` | Wallet address (x402 float) | Yes | `apps/api/src/lib/x402-client.ts:76`; `x402.ts:43` |
| `SUPABASE_URL` | Project URL (note: bare, NOT `NEXT_PUBLIC_`) | Yes | `apps/api/src/lib/supabase.ts:12`; `auth-store.ts:27`; `siwa-nonce-store.ts:26` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role JWT | Yes | `apps/api/src/lib/supabase.ts:13` (3 readers) |
| `JWT_SECRET` | HS256 bearer-token signing secret | Yes | `apps/api/src/lib/jwt.ts:25` |
| `SIWA_RECEIPT_SECRET` | HMAC for SIWA receipts | Yes | `apps/api/src/lib/agent-receipt.ts:29` |
| `SIWE_DOMAIN` | SIWE domain anchor | Yes | `apps/api/src/lib/jwt.ts:19`; `siwe.ts:22`; `siwa.ts:28` |
| `ERC8004_REGISTRY_ADDRESS` | Contract address | Yes | `apps/api/src/lib/siwa.ts:30` |
| `X402_FACILITATOR_URL` | URL | Yes (with fallback) | `apps/api/src/lib/x402-client.ts:86`; `x402.ts:63` |
| `BASE_SEPOLIA_RPC_URL` | RPC URL (read path) | Yes | `apps/api/src/lib/viem.ts:8`; `wallet-client.ts:26` |
| `BASE_SEPOLIA_WRITE_RPC_URL` | RPC URL (write path; Alchemy testnet per `reference_alchemy_base_sepolia_endpoint.md`) | Yes (with fallback to RPC_URL) | `apps/api/src/lib/contracts-vendored/wallet-client.ts:25` |
| `SPONSOR_INDEXER_DEPLOY_BLOCK` | Block number | Yes | `apps/api/src/lib/viem.ts:31` |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes | `apps/api/src/lib/duel/anthropic-client.ts:14` |
| `CRON_SECRET` | Cron bearer-token gate (shared with orchestrator) | Yes | `apps/api/.env.example:152` |
| `X20_DEMO_TOURNAMENT_ID` | UUID toggle | No | `apps/api/src/lib/duel/runner.ts:294`; `routes/agents-matches.ts:100` |
| `APEX_WATCH_BASE_URL` | URL | No | `apps/api/src/routes/agents-matches.ts:40` |
| `API_VERSION` | Version string | No | `apps/api/src/routes/health.ts:30` |
| `VERCEL_GIT_COMMIT_SHA` | Auto-injected by Vercel | platform-managed | `apps/api/src/routes/health.ts:31` |
| `NEXT_PUBLIC_CHAIN_ID` | Config (note: cross-bundle naming leftover) | Yes | `apps/api/src/lib/contracts-vendored/addresses.ts:23` |
| `NEXT_PUBLIC_USDC_ADDRESS` | Config | Yes | `apps/api/src/lib/contracts-vendored/addresses.ts:49` |

### 3.orchestrator — `skillbase-orchestrator` project

| Var | Type | Code site |
|---|---|---|
| `CRON_SECRET` | Cron bearer-token gate | `apps/orchestrator/src/app/api/cron/{reconcile-duels,settle-tournaments,create-tournaments,index-sponsor-events,index-tournaments-created,anchor-sp-snapshot}/route.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Supabase | transitive: `packages/lib-shared/src/supabase.ts:40-41` |
| `STUDIO_PRIVATE_KEY` | Blockchain PK (anchorSnapshot + settle signing) | transitive: `packages/lib-shared/src/attestation.ts:30` |
| `BASE_SEPOLIA_RPC_URL` | RPC | transitive: `packages/lib-shared/src/rpc.ts:33` |
| `TESTNET_DEFAULT_PRIZE_POOL` | Config | `packages/duel-backend/src/cron/tournaments.ts:122` |
| `SPONSOR_INDEXER_DEPLOY_BLOCK` | Config | `packages/duel-backend/src/cron/sponsors.ts:50` |
| `TOURNAMENT_INDEXER_DEPLOY_BLOCK` | Config | `packages/duel-backend/src/cron/index-tournaments-created.ts:71` |
| `DRY_RUN` | Toggle (reconcile-duels safety) | `packages/duel-backend/src/cron/reconcile-duels.ts:278` |
| `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS` | Contract address (REQUIRED — anchor cron 500s if unset) | `packages/contracts/src/addresses.ts:110-111` |

### 3.games — `mas-{2048,wordle,sudoku,match3,minesweeper,clicker}`

Direct env reads in each game app's own `src/`: only `NODE_ENV` (dev page) and `NEXT_PUBLIC_URL` (share URL).

The substantive secret consumption is **transitive** through `@skillos/duel-backend` route-handler exports re-mounted under each app's `src/app/api/**/route.ts`:

| Var | Type | Code site (transitive) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL | `packages/lib-shared/src/supabase.ts:15,40` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon JWT (public-by-design) | `packages/lib-shared/src/supabase.ts:16` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role JWT | `packages/lib-shared/src/supabase.ts:41` |
| `STUDIO_PRIVATE_KEY` | Blockchain PK | `packages/lib-shared/src/attestation.ts:30` |
| `BASE_SEPOLIA_RPC_URL` | RPC | `packages/lib-shared/src/rpc.ts:33` |
| `ANTHROPIC_API_KEY` | Anthropic API key | `packages/ai-coach/src/client.ts:22` |

**`mas-2048` additionally has:**
| Var | Type | Code site (direct) |
|---|---|---|
| `ADMIN_API_TOKEN` | Bearer token | `apps/2048/src/app/api/admin/system-health/route.ts:92` (not in `.env.local.example` — gap) |
| `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` | Coinbase Developer Platform API key | `apps/2048/src/lib/x402-server.ts:178-179` |
| `CDP_PAYMASTER_URL` | URL | `apps/2048/src/app/api/paymaster/route.ts:34` |
| `X402_NETWORK` / `X402_FACILITATOR_URL` / `X402_PAY_TO` | x402 config | `apps/2048/src/lib/x402-server.ts:22,180,183` |

### 3.sponsor — `skillbase-sponsor` project

Direct env reads: **none**. All transitive.

| Var | Type | Code site (transitive) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` | Supabase | `packages/lib-shared/src/supabase.ts` |
| Multiple `NEXT_PUBLIC_*_ADDRESS` (contract config) | Config | `packages/contracts/src/addresses.ts` |
| `BASE_SEPOLIA_RPC_URL` | RPC | `packages/lib-shared/src/rpc.ts:33` (if any sponsor route calls `getPublicClient`) |

**Vestigial in `.env.local.example` but NOT consumed by sponsor app code:**
- `CRON_SECRET` (sponsor runs no cron — cron lives in orchestrator)
- `SPONSOR_INDEXER_DEPLOY_BLOCK` (consumed only by orchestrator)

The `.env.local.example:23-24` comment claiming "cron writes sponsor_events" is **incorrect** — see Finding F6 in `infra-findings.md` §4.

### 3.x — `node_modules` project ANOMALY

A Vercel project named `node_modules` exists under team `simpl3s-projects` (id `prj_L2HcorTjNPsRn6B3XhX2AXPF7MiK`). **No file in this worktree references it.**

Hypothesis: stray `vercel link` run from inside a `node_modules/` subdirectory (most likely during the apps/api prebuilt-bundle path `.vercel/output/functions/api/index.func/node_modules/`).

**Remediation (out of scope for this audit, for follow-up):** verify `vercel inspect node_modules`, check `vercel domains ls`, then `printf 'y\n' | vercel projects rm node_modules` per `reference_vercel_cli_project_rm.md`.

---

## 4 — Supabase Secrets

**Project ref:** `clizuqvtkekzxiflbsyr` (SkillOS prod, per `project_x4_siwa_migration_target_misapply.md`).

| Key type | Where it lives | Rotation cadence | Last rotation |
|---|---|---|---|
| **service-role JWT** (`SUPABASE_SERVICE_ROLE_KEY`) | 9 Vercel projects (every app except agent-runner) | **No runbook exists** | Unknown — `git log` of `apps/api/src/lib/supabase.ts` and `packages/lib-shared/src/supabase.ts` shows only refactor commits; no commits mention "rotate" or "regenerate". **Almost certainly never rotated since project inception 2026-04-21.** |
| **anon JWT** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | 7 Vercel projects (game apps + sponsor) | Treat as public, rotate on Supabase project rotation | same |
| **Supabase project URL** | 9 Vercel projects | n/a | n/a |
| **Database password** | Supabase dashboard only — NOT in any Vercel env, NOT in any GH secret | founder-managed | unknown |

> **HIGH finding (cross-referenced from infra-findings.md §4):** the service-role key is provisioned to **9 Vercel projects** because the `@skillos/duel-backend` package re-exports route handlers that internally call `getSupabaseService()`. Every consuming app must hold the key. A key rotation requires touching 9 separate Vercel project envs in lockstep, and **no rotation runbook exists**. See infra-findings.md §4 Finding F1 + recommendation R1.

---

## 5 — Contract / Founder-Local Secrets (not in repo, not in Vercel, not in GH)

Documented in memory `contracts/deployments/wallets-base-sepolia.md` (canonical role registry per `project_x19b_fee_vault_separated.md`):

| Role | Wallet address | Where private key lives |
|---|---|---|
| `trustedSigner` (ChallengeEscrow + Phase 2 broadcaster) | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` | Vercel envs (`STUDIO_PRIVATE_KEY` on api + orchestrator + 6 mas-*) |
| `feeVault` (post-X19b) | `0x455536e4…` (truncated per memory) | **Founder local only** — not in Vercel, not in repo. Receives ChallengeEscrow fees. |
| `chargeRetryFee broadcaster` (X15.3 split) | per `project_x15_agent_wallet_split.md` D1 | Vercel env (`AGENT_PRIVATE_KEY` on api only) |
| `X402_RECEIVER_ADDRESS` (x402 float) | per `project_x15_agent_wallet_split.md` | Vercel env (api) — wallet address only; private key founder-local |
| ChallengeEscrow deployer EOA | `0x84F4610e…` (truncated per memory) | **Founder local only** |
| TournamentPool deployer EOA | `0x3a4F9eB7…` (truncated per memory) | **Founder local only** |
| Per-game agent wallets (5) | derived from `AGENT_PK_*` | GitHub Actions secrets (one per game app, see §2 #2-#6) |

**Verify wallet:** `contracts/.env.example` lists `BASESCAN_API_KEY=` and `DEPLOYER_PRIVATE_KEY=`. These are founder-local Foundry deploy envs — not present in any Vercel project, not in any GH secret.

---

## 6 — Verification Matrix for the Founder

The following live state CANNOT be confirmed from repo contents alone. Each row is a `vercel env ls <project>` (or equivalent) that the founder must run before the external auditor kickoff:

| Project | Required vars (must be set on Production) | Source of requirement |
|---|---|---|
| `api` | `STUDIO_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `X402_RECEIVER_ADDRESS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `SIWA_RECEIPT_SECRET`, `SIWE_DOMAIN`, `ERC8004_REGISTRY_ADDRESS`, `BASE_SEPOLIA_RPC_URL`, `BASE_SEPOLIA_WRITE_RPC_URL`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `SPONSOR_INDEXER_DEPLOY_BLOCK`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_USDC_ADDRESS`, `X402_FACILITATOR_URL` | infra-findings.md §3 + apps/api/.env.example |
| `skillbase-orchestrator` | `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STUDIO_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `TESTNET_DEFAULT_PRIZE_POOL`, `SPONSOR_INDEXER_DEPLOY_BLOCK`, `TOURNAMENT_INDEXER_DEPLOY_BLOCK`, `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS`, all `NEXT_PUBLIC_*_ADDRESS` | apps/orchestrator/.env.local.example |
| `mas-2048` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STUDIO_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `ANTHROPIC_API_KEY`, `ADMIN_API_TOKEN`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_PAYMASTER_URL`, `X402_NETWORK`, `X402_FACILITATOR_URL`, `X402_PAY_TO`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_CHALLENGE_ESCROW_ADDRESS`, `NEXT_PUBLIC_TOURNAMENT_POOL_V21_ADDRESS`, `NEXT_PUBLIC_URL` | apps/2048/.env.local.example + grep |
| `mas-{wordle,sudoku,match3,minesweeper,clicker}` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STUDIO_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_CHALLENGE_ESCROW_ADDRESS`, `NEXT_PUBLIC_TOURNAMENT_POOL_V21_ADDRESS`, `NEXT_PUBLIC_URL` | each app's .env.local.example |
| `skillbase-sponsor` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, all `NEXT_PUBLIC_*_ADDRESS` | apps/sponsor/.env.local.example |
| `node_modules` | n/a — verify project is dead and remove | infra-findings.md §3.x |

**Vars that should be ABSENT** (founder verification):
- `X402_TEST_WALLET_PRIVATE_KEY` — must NOT be set on any Vercel project's Production env (testing-only).
- `DEPLOYER_PRIVATE_KEY` — must NOT be set on any Vercel project (founder-local Foundry only).
- `BASESCAN_API_KEY` — must NOT be set on any Vercel project (founder-local verify only).

---

## 7 — Rotation Story (current state)

| Aspect | State |
|---|---|
| Documented Supabase rotation runbook | **MISSING** — no `docs/runbooks/`, no `docs/security/`, no `SECURITY.md` |
| Documented blockchain wallet rotation runbook | partial — `project_x19b_fee_vault_separated.md` covers feeVault; nothing for `STUDIO_PRIVATE_KEY`, `AGENT_PRIVATE_KEY` |
| Documented `JWT_SECRET` / `SIWA_RECEIPT_SECRET` rotation | apps/api/.env.example:46-47 says "never reuse across envs" — that's it |
| Documented `CRON_SECRET` rotation | not documented; single shared secret between api + orchestrator |
| Automated rotation script | **NONE** |
| Last known rotation event | **none observed in git log** for any Vercel-side secret since project inception 2026-04-21 |
| GH Actions secrets rotation | n/a — all 11 created 2026-05-13 in a single Sprint X7 batch, never rotated since |

**Pre-mainnet asks (per infra-findings.md §10):**
- R1 — write `docs/runbooks/secret-rotation-supabase.md` covering the 9-project rollover sequence.
- R2 — fix `SUPABASE_URL` vs `NEXT_PUBLIC_SUPABASE_URL` naming drift (apps/api uses bare; everything else uses `NEXT_PUBLIC_`).
- R5 — add `SECURITY.md` at repo root with the canonical key-handling split (founder-only vs agent-OK).

---

## 8 — Memory Cross-References

The following memory notes informed this inventory and remain authoritative for future-state:

- `reference_secret_handling_split.md` — canonical secret-handling discipline
- `project_x15_agent_wallet_split.md` — STUDIO vs AGENT vs X402_RECEIVER wallet split
- `project_x15_6_agent_private_key_vercel_gap.md` — historic deploy gap where AGENT_PRIVATE_KEY was missing from Vercel
- `project_x19b_fee_vault_separated.md` — feeVault rotation 2026-05-14
- `reference_vercel_env_sensitive_default.md` — Vercel Production envs sensitive-by-default; `vercel env pull` returns "" for them
- `project_post_yc_vercel_root_dir_setting.md` — Root Directory passthrough toggle per project
- `reference_apps_api_prebuilt_deploy_only.md` — apps/api deploys via prebuilt CLI only
- `reference_alchemy_base_sepolia_endpoint.md` — Alchemy used for write path only on apps/api
- `reference_vercel_cli_project_rm.md` — `node_modules` cleanup procedure
- `project_skillbase_trustedsigner.md` — canonical trustedSigner address `0xA24f9122…0975692`
- `project_x4_siwa_migration_target_misapply.md` — Supabase project ref `clizuqvtkekzxiflbsyr` = SkillOS prod

---

**End of inventory.** No values. Only types, locations, and pointers.
