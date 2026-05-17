# CR1 R3 — Infrastructure + Contracts + Auth

**Scope.** Honest inventory of all backend infrastructure, smart contracts, and authentication layers powering SkillOS along Phase 1 → Phase 5 trajectory. Read-only audit. VTP-discipline (verify against live state, never trust transitively).

**Audit window.** 2026-05-17, branch `cr1/r3-infra-contracts-auth` off `origin/main` @ f3a7831.

**Mode.** No fund movements, no state changes, no secret values disclosed. Findings cross-referenced against memory entries and CLAUDE.md; drifts surfaced loudly.

---

## 1. Smart contract registry

All deployments are on **Base Sepolia (chain 84532)**. No mainnet contracts; no cross-chain deployments.

| Contract | Address | Deployer | Verified | Source | Foundry tests | Phase tag |
|---|---|---|---|---|---|---|
| ChallengeEscrow | `0x52e5E45456DeC882048b430a968Cda6061575be0` | `0x84F4610e…7960C` | ✅ Blockscout (via_ir=true, cancun) | `contracts/src/ChallengeEscrow.sol` | 25 | F2 / X19a default-profile |
| TournamentPool v2.0 | `0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1` | `0x3a4F9eB7…5EEe` | ✅ Blockscout (via_ir=false) | `contracts/src/TournamentPool.sol` (point-in-time from commit `9e0b593`, frozen in `contracts/audit-sources/`) | 91 (shared) | F4 / legacy (in-flight only) |
| TournamentPool v2.1 | `0x52049b812780134d2F69D6c20C2ef881D49702da` | `0x3a4F9eB7…5EEe` | ✅ Blockscout (via_ir=false) | `contracts/src/TournamentPool.sol` | 91 (shared) | F4.1 (2026-04-29, `fundPrizePool` permissionless) |
| MockSanctionsOracle | `0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC` | `0x3a4F9eB7…5EEe` | ✅ Blockscout | `contracts/src/MockSanctionsOracle.sol` | 0 (mock) | F4.1 (testnet-only) |
| SponsorReceiptSBT | `0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768` | `0x3a4F9eB7…5EEe` | ✅ Blockscout | `contracts/src/SponsorReceiptSBT.sol` | 16 | F4.1 (ERC-5192) |
| SponsorshipModule | `0xD76670adB574A4C8D06dfF47127e7143d780ff87` | `0x3a4F9eB7…5EEe` | ✅ Blockscout | `contracts/src/SponsorshipModule.sol` | 11 | F4.1 |
| DevAttributionNFT | (computed at deploy via `DeploySponsorStack.s.sol:61`, **not exported in `packages/contracts/src/addresses.ts`**) | `0x3a4F9eB7…5EEe` | unverified-this-audit | `contracts/src/DevAttributionNFT.sol` | 19 | F4.1 (v2.2-pinning) |
| SkillbaseAnchor | **undeployed** (script ready: `contracts/script/DeploySkillbaseAnchor.s.sol`) | — | — | `contracts/src/SkillbaseAnchor.sol` | 17 | Phase 5 prep (SP-ledger anchor) |
| ArcadePool | **undeployed**, **no deployment script** | — | — | `contracts/src/ArcadePool.sol` | 22 | Untagged / dead code candidate |

**Foundry config drift.** `contracts/foundry.toml` has two profiles:

| Profile | via_ir | evm_version | Used by |
|---|---|---|---|
| `default` | **true** | cancun | ChallengeEscrow + future deploys |
| `phase1-legacy` | **false** | cancun | TournamentPool v2.0/v2.1, MockSanctionsOracle, SponsorReceiptSBT, SponsorshipModule (so bytecodes match Blockscout verifications) |

CLAUDE.md still says *"optimizer 200 runs, no via_ir"* (line ~27) — pre-dates X19a.2 dual-profile split. **Document drift, not bytecode risk.** All on-chain bytecodes match their declared profile per Blockscout query.

**Phase-tag distribution.** 6 deployed (F2 + F4 + F4.1 stack), 2 sourced-but-undeployed (Phase 5 + dead-code candidate). 8 contracts total; aggregate **201 Foundry test cases**.

**ERC-8004 / ERC-8128.** No on-chain SkillOS contract references ERC-8004. The registry SkillOS uses is the **public Base Sepolia ERC-8004 registry at `0x8004A818BFB912233c491871b3d84c89A494BD9e`** (per `apps/api/src/lib/siwa.ts:30-32`), via the `@buildersgarden/siwa` subpath import. The agent-identity layer is API-layer + on-chain registry, not a SkillOS-owned contract.

---

## 2. Vercel topology

**Scope:** `simpl3s-projects` (Vercel team). 12 projects discovered.

| Project | Custom prod domain | Last prod deploy | Framework | Root Dir | Notes |
|---|---|---|---|---|---|
| `mas-2048` | `2048.skillos.games` (+ skillbase.games alias) | ~2h ago | Next.js | `apps/2048` | x402/CDP env-var divergent (see §10) |
| `mas-wordle` | `wordle.skillos.games` (+ alias) | ~2h ago | Next.js | `apps/wordle` | **Install cmd `npm install --prefix` truncated** |
| `mas-sudoku` | `sudoku.skillos.games` (+ alias) | ~2h ago | Next.js | `apps/sudoku` | — |
| `mas-minesweeper` | `minesweeper.skillos.games` (+ alias) | ~2h ago | Next.js | `apps/minesweeper` | — |
| `mas-clicker` | `clicker.skillos.games` (+ alias) | ~2h ago | Next.js | `apps/clicker` | — |
| `mas-match3` | `match3.skillos.games` (+ alias) | ~2h ago | Next.js | `apps/match3` | — |
| `skillbase-sponsor` | `sponsor.skillos.games` (+ alias) | ~2h ago | Next.js | `apps/sponsor` | — |
| `skillbase-orchestrator` | (`.vercel.app` only) | ~2h ago | Next.js | `apps/orchestrator` | Install cmd `npm install --prefix=../..` (correct monorepo passthrough) |
| `api` | `api.skillos.network` | ~2h ago | **Other** (prebuilt CLI deploys only) | `.` | Confirms memory `reference_apps_api_prebuilt_deploy_only.md` |
| `skillbase-apex` | `skillos.network`, `www.skillos.network`, `skillbase.games`, `www.skillbase.games` | ~22h ago | Next.js | `.` | Thin env (Supabase publishable only + VERCEL_AUTOMATION_BYPASS_SECRET) |
| `simpl3` | `simpl3.ai` | 13d ago | Next.js | `.` | Zero env vars — confirms editorial corp site |
| `node_modules` | — | never deployed | — | — | **Junk project** — likely from accidental `vercel link` in repo root; cleanup candidate |

**Env-var inventory** (names + categories only — no values):

| Project | SECRET (private key / API key / JWT / service role) | CONFIG (URLs, addresses, chain ids) | PUBLIC (`NEXT_PUBLIC_*`) |
|---|---|---|---|
| 5 games (wordle/sudoku/minesweeper/clicker/match3) | `CRON_SECRET`, `ADMIN_API_TOKEN`, `ANTHROPIC_API_KEY`, `STUDIO_PRIVATE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SCORE_SIGNER_PRIVATE_KEY`, `TESTNET_DEFAULT_PRIZE_POOL` | `QUICK_AUTH_DOMAIN` (still `*.skillbase.games` — drift §10), `NEXT_PUBLIC_URL` | `NEXT_PUBLIC_SUPABASE_{URL,ANON_KEY,PUBLISHABLE_KEY}`, `NEXT_PUBLIC_{ARCADE_POOL,USDC,CHAIN_ID}` |
| `mas-2048` (divergent) | `CDP_API_KEY_SECRET`, `CDP_API_KEY_ID`, `ADMIN_API_TOKEN`, `ANTHROPIC_API_KEY`, `STUDIO_PRIVATE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `CDP_PAYMASTER_URL`, `X402_PAY_TO`, `X402_NETWORK`, `X402_FACILITATOR_URL` | `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS` |
| `skillbase-sponsor` | `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | — | `NEXT_PUBLIC_{SANCTIONS_ORACLE, SPONSOR_RECEIPT_SBT, SPONSORSHIP_MODULE, TOURNAMENT_POOL_V21, USDC, CHAIN_ID}_ADDRESS` |
| `skillbase-orchestrator` | `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `STUDIO_PRIVATE_KEY` | `SPONSOR_INDEXER_DEPLOY_BLOCK` | per-contract `_ADDRESS` set incl. `SKILLBASE_ANCHOR` |
| `api` | `AGENT_PRIVATE_KEY`, `STUDIO_PRIVATE_KEY`, `ANTHROPIC_API_KEY`, `SIWA_RECEIPT_SECRET`, `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | `X402_FACILITATOR_URL`, `X402_RECEIVER_ADDRESS`, `ERC8004_REGISTRY_ADDRESS`, `BASE_SEPOLIA_WRITE_RPC_URL`, `APEX_WATCH_BASE_URL`, `X20_DEMO_TOURNAMENT_ID` | — |
| `skillbase-apex` | `VERCEL_AUTOMATION_BYPASS_SECRET` | — | `NEXT_PUBLIC_SUPABASE_{URL,ANON_KEY}` |
| `simpl3` | — | — | — |

Wallet keys (`*_PRIVATE_KEY`) per memory `reference_secret_handling_split.md` live on `api`, `mas-*`, and `skillbase-orchestrator` only. Apex carries no signing material — invariant preserved.

---

## 3. Supabase topology

**Project ref:** `clizuqvtkekzxiflbsyr` (named "2048" in Supabase UI, but is the canonical SkillOS prod per memory). Region `ap-northeast-2`, Postgres 17.6.1.104. The other org project `yuaxnjmnfosfibtubrwl` is the unrelated Simpl3 corp-site DB.

**Schemas (table counts):**

| Schema | Tables |
|---|---|
| `auth` | 23 |
| `public` | 24 |
| `realtime` | 9 |
| `storage` | 8 |
| `supabase_migrations` | 1 |
| `vault` | 1 |

**Migrations.** 19 migration files on disk in `supabase/migrations/`; 22 migration rows in `supabase_migrations.schema_migrations` (3 older migrations applied before the file-tracked era: `ai_layer`, `leaderboard`, `aggregates_nulls_not_distinct`). Most recent: `v4_20260517_enable_rls_v2_tables.sql` (today; D-top-3a RLS baseline).

**RLS state (public schema).** **All 24 tables have RLS enabled** post-v4_20260517. 0 tables RLS-disabled. 16 tables carry an explicit policy; 8 tables have RLS enabled with **no policy** (= deny-by-default; service-role-only access):

- `v2_tournaments`, `v2_tournament_entries`, `v2_sp_snapshots`, `v2_sponsor_indexer_state`, `v2_cron_runs`, `v2_tournament_indexer_state`, `skillos_auth_nonces`, `skillos_siwa_nonces`

This is the intended posture: cron-written tables and nonce stores are not user-readable; only service-role reaches them.

**Installed extensions (`pg_extension`):** `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`. **`pg_cron` is NOT installed** and **`pg_net` is NOT installed** — confirming that all SkillOS cron is *external* (Vercel cron handlers + GitHub Actions `agent-runner`), not in-database.

**Edge functions.** **Zero edge functions deployed.** All compute lives on Vercel.

**Cron orchestration.** External, two surfaces:
- Vercel cron routes per app (`/api/cron/*`) gated by `CRON_SECRET`, broadcast by `STUDIO_PRIVATE_KEY` — the canonical write surface per CLAUDE.md invariant 6.
- GitHub Actions `agent-runner.yml` workflow_dispatch (cron line commented; see §4).

---

## 4. GitHub Actions topology

### Workflows in `youngstar-eth/skillos`

| File | Trigger | Schedule | Jobs | Last-100 success rate |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | `pull_request`, `push` (main) | — | typecheck, test-ts, test-foundry, lint (parallel) | ~97.8% (90 / 92 runs) |
| `.github/workflows/agent-runner.yml` | `workflow_dispatch` only | `0 2 * * *` (commented out — daily 02:00 UTC; awaiting 7-day stability window before activation) | 1 matrix job × 5 games (wordle, sudoku, match3, minesweeper, clicker) | ~85.7% (6 / 7) |

### Workflows in `youngstar-eth/skillos-apex`

**None.** Apex relies on Vercel git-push auto-deploy with no CI gate.

### Secret-reference map (workflow → secret name; values not accessed)

| Workflow | Secret | Category |
|---|---|---|
| `agent-runner.yml` | `SKILLOS_BASE_URL` | Config |
| `agent-runner.yml` | `AGENT_PK_{WORDLE,SUDOKU,MATCH3,MINESWEEPER,CLICKER}` | Per-game agent private keys |
| `agent-runner.yml` | `AGENT_ID_{WORDLE,SUDOKU,MATCH3,MINESWEEPER,CLICKER}` | Per-game agent IDs |
| `ci.yml` | (none — no secrets referenced) | — |

CLAUDE.md says *"No CI today: `.github/workflows/` does not exist"* — this is the **most visible drift in the audit**: both workflows exist, both have ≥85% pass rate over the last 100 runs, and the CI workflow gates merges to `main`. Phase 2 discipline transition described in CLAUDE.md is partially shipped already.

---

## 5. DNS + domain topology

| Domain | A / CNAME | TLS issuer | Cert window | Notes |
|---|---|---|---|---|
| `skillos.network` (apex) | `76.76.21.21` (Vercel anycast) | Let's Encrypt R12 | 2026-05-09 → 2026-08-07 | Apex marketing landing |
| `www.skillos.network` | CNAME → apex | Let's Encrypt R12 | same | — |
| `api.skillos.network` | CNAME `cname.vercel-dns.com` → `76.76.21.164` / `66.33.60.34` | Let's Encrypt R13 | 2026-05-10 → 2026-08-08 | `api` Vercel project |
| `agent.skillos.network` | NXDOMAIN | — | — | Not yet configured |
| `2048,wordle,sudoku,minesweeper,match3,clicker,sponsor`.`skillos.games` | `76.76.21.21` | Let's Encrypt R12/R13 | ~2026-05-09 → 2026-08-07 | All 7 subdomains on Vercel anycast |
| **`skillos.games` (apex)** | `76.223.105.230`, `13.248.243.5` (**AWS — Route 53 / Global Accelerator**) | **GoDaddy CA G2** (parking page) | 2026-05-09 → 2026-08-07 | **NOT on Vercel** — no project claims this apex |
| `skillbase.games` (apex, legacy) | `216.150.16.193`, `216.150.16.1` (not Vercel) | Let's Encrypt R12 | 2026-04-17 → 2026-07-16 | **Still resolves**; aliased to `skillbase-apex` Vercel project |
| `*.skillbase.games` (legacy subs) | (alias-only via `skillbase-apex` + per-game projects) | Let's Encrypt | varies | Dual-aliased on every game/sponsor project; rebrand not fully cut over |
| `skillbase.network` | NXDOMAIN | — | — | Successfully retired ✅ |
| `api.skillbase.network` | NXDOMAIN | — | — | Successfully retired ✅ |

**Registrar.** `whois` for both `.network` and `.games` redacts the registrar field by privacy policy; only `status: ACTIVE` is exposed publicly.

---

## 6. External integration topology

### Anthropic API

| Consumer | Model | Model ID | Surface | API key |
|---|---|---|---|---|
| `packages/ai-coach` | Claude Sonnet 4.6 | `claude-sonnet-4-6` | Coach (strategic feedback) | `ANTHROPIC_API_KEY` |
| `packages/ai-coach` | Claude Haiku 4.5 | `claude-haiku-4-5` | Recap (narrative) | `ANTHROPIC_API_KEY` |
| `packages/ai-coach` | Claude Haiku 4.5 | `claude-haiku-4-5` | Anti-Cheat (classifier) | `ANTHROPIC_API_KEY` |
| `apps/api/src/lib/duel/*` | Sonnet 4.6 + Haiku 4.5 (per move) | mixed | Duel-agent loop (X20 marathon) | `ANTHROPIC_API_KEY` |

Single shared `ANTHROPIC_API_KEY` across all consumers. No `claude-3-*`, no `claude-4-7-*` referenced. Per-call cost introspection requires Anthropic console access (out of this audit's scope).

### x402 facilitator

| Consumer | Facilitator URL | Mode | Receiver |
|---|---|---|---|
| `apps/api` (pay-wall data + agent retry) | `https://x402.org/facilitator` (testnet) | EIP-3009 + HTTP settlement; **v2 wire (`amount` field)** | `X402_RECEIVER_ADDRESS` |
| `apps/2048` | `https://x402.org/facilitator` (testnet fallback) | HTTP | — |

No CDP facilitator (`https://api.cdp.coinbase.com/platform/v2/x402`) wired in repo — that swap is Phase 2 work per memory `reference_x402_server_install.md`. No `@x402/paywall` client package (server-only install, per memory).

### Base infrastructure

| Consumer | Read RPC | Write RPC |
|---|---|---|
| `apps/api` | `BASE_SEPOLIA_RPC_URL` (default `https://sepolia.base.org`) | `BASE_SEPOLIA_WRITE_RPC_URL` (optional override) |
| `packages/lib-shared`, `packages/cli` | `sepolia.base.org` (hardcoded default) | — |

No Alchemy URLs found in repo. Per memory `reference_alchemy_base_sepolia_endpoint.md`, Alchemy is wired only via the `BASE_SEPOLIA_WRITE_RPC_URL` Vercel env value (not committed) — so the public `sepolia.base.org` is the read fallback / default. **Single-point-of-failure: if `sepolia.base.org` degrades and `BASE_SEPOLIA_WRITE_RPC_URL` is unset for any app, that app's chain reads/writes go dark.**

### Builder Codes API

Builder codes are baked into each game's `layout.tsx`. Confirmed in code:
- `apps/2048/src/app/layout.tsx:48` → `bc_o6szuvg1`
- `apps/clicker/src/app/print.tsx:46` → `bc_m59xxykm`

Memory entry `project_api_server_side_datasuffix_attribution_gap.md` (PR #82, closed 2026-05-14) confirms server-side dataSuffix attribution via raw-input tail decode.

### ERC-8004 / ERC-8128 registry

| Path | Purpose |
|---|---|
| `apps/api/src/lib/siwa.ts:30-32` | Registry address `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Base Sepolia ERC-8004 registry); `ownerOf(agentId)` lookup during `/v1/auth/siwa/verify` |
| `apps/api/src/lib/siwa.ts:18-22` | **Subpath import only** (`@buildersgarden/siwa/siwa`) — barrel import would trigger ERR_MODULE_NOT_FOUND on `@circle-fin` cold-start (memory: `reference_buildersgarden_siwa_barrel_trap.md`) |
| `apps/api/src/lib/agent-receipt.ts` | Receipt payload carries `agentRegistry` + `chainId` for ERC-8128 per-request signing |

---

## 7. Auth flow end-to-end (live, testnet)

Audit performed against `https://api.skillos.network/v1/*` on 2026-05-17. No bearer/receipt actually obtained — signing requires `STUDIO_PRIVATE_KEY` (founder-only).

### Health probe

```
GET https://api.skillos.network/v1/health → 200
  {"version":"0.1.0","commit":"","uptimeSeconds":739,"network":"base-sepolia","chainId":84532}
```
`commit` field is empty — build doesn't bake commit SHA. Minor observability gap.

### SIWB (human / Sign-In-With-Base)

**Step 1 — nonce issuance.** First call sent `{"address": …}` — server returned 400 with a clear ZodError pointing at the canonical `walletAddress` field (input-validation enforced):

```
POST /v1/auth/siwb/nonce  {"address":"0xA24f9122…"}                  → 400 ZodError
POST /v1/auth/siwb/nonce  {"walletAddress":"0xA24f9122…","chainId":84532}
  → 200 {"nonce":"60fd38d960c92d0b13db899c8d8744ec","issuedAt":"2026-05-17T12:41:11.085Z","expiresAt":"2026-05-17T12:46:11.085Z"}
```
**5-minute TTL** (`apps/api/src/lib/auth-store.ts`). REPLACE-pattern documented at `apps/api/src/routes/auth.ts:22-23` — outstanding nonces are invalidated and re-issued (UX-friendly for cancel/retry).

**Step 2 — sign + verify.** `POST /v1/auth/siwb/verify` flow per `apps/api/src/routes/auth.ts:85-120`:
1. SIWE field parse / validate (`parseAndValidate`)
2. Address-vs-message-address equality check
3. **Atomic nonce consume *before* signature crypto** (replay-rejected; CONSUMED / EXPIRED / NOT_FOUND distinguished)
4. `viem.verifyMessage` (ERC-6492 wrapper transparent for Base Account smart wallets)
5. Issue HS256 JWT (24h TTL, `JWT_SECRET`)

Verification not executable from audit without a private key. Architecture inspected only.

### SIWA (agent / Sign-In-With-Agent)

```
POST /v1/auth/siwa/nonce  {"agentId":"0x000…01"}
  → 200 {"nonce":"U-zODXfI3UBbNqKt","issuedAt":"…","expiresAt":"…"} (5-min TTL)
```
SIWA verify flow per `apps/api/src/routes/auth-siwa.ts:80`:
1. Parse SIWA message
2. Call `ownerOf(agentId)` on `ERC8004_REGISTRY_ADDRESS`
3. Verify signature against owner address
4. Issue **HMAC-signed receipt** (24h TTL, `SIWA_RECEIPT_SECRET`) — not a JWT; format `base64url(json).base64url(hmac-sha256)`; payload `{address, agentId, agentRegistry, chainId, signerType}`

### Nonce stores

| Auth | Table | Migration | Pattern |
|---|---|---|---|
| SIWB | `public.skillos_auth_nonces` | `v2_20260510_auth_nonces.sql` | Unique index on `(wallet_address) WHERE consumed = false` → at-most-one outstanding per wallet |
| SIWA | `public.skillos_siwa_nonces` | `v3_20260511_siwa_nonces.sql` | Wallet-address agnostic at issue; consume = `DELETE … RETURNING` |

Memory `project_phase2_nonce_store_unify.md` flags that these two tables should converge under one Upstash Redis namespace before mainnet — open work.

### Bearer / receipt expiry

| Token | Issuer | Algorithm | TTL |
|---|---|---|---|
| SIWB bearer | `apps/api/src/lib/jwt.ts` | HS256 (JWT_SECRET) | 24h |
| SIWA receipt | `apps/api/src/lib/agent-receipt.ts` | HMAC-SHA256 (SIWA_RECEIPT_SECRET) | 24h |

---

## 8. Wallet topology + centralization disclosures

### Role-distinct wallet inventory (Base Sepolia)

| Role | Address | On-chain status (2026-05-17) | Fund source | Mainnet rotation compliance |
|---|---|---|---|---|
| **TournamentPool deployer** | `0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe` | 0.0048 ETH balance; EOA; deployed all 4 sponsor-stack contracts | Fiat onramp #1 (per `wallets-base-sepolia.md`) | ✅ Compliant (role-bounded; deployer ≠ owner ≠ signer) |
| **ChallengeEscrow deployer + owner** | `0x84F4610e2805A35B15388D6c2644f6a23E17960C` | 0.0077 ETH; EOA; deployed ChallengeEscrow, called `setFeeVault` 2026-05-14 | Fiat onramp #2 | ✅ Compliant |
| **trustedSigner (ChallengeEscrow) + cron-broadcaster everywhere** | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` | 0.0293 ETH; EOA. **Broadcasts on TournamentPool v2.1**: `createTournament` (15), `submitSoloScore` (8), `settle` (1). **Broadcasts on ChallengeEscrow**: `settle` (8), `walkover` (1) | Fiat onramp #3 | ⚠️ **Multi-role concentration** — see disclosures below |
| **AGENT broadcaster (chargeRetryFee, X15.3 split)** | `0xf481b744c0CB432baD42babB30616790bbA69c91` | EOA; broadcasts 5 of last 6 `chargeRetryFee` calls on TournamentPool v2.1 | Fiat onramp (per memory `project_x15_agent_wallet_split.md`) | ✅ Compliant (split from STUDIO_PRIVATE_KEY) |
| **Legacy AGENT wallet** | `0x1569A95eaF3bB970E5c03F53f026849864C39fdA` | EOA; ran 1 `chargeRetryFee` (pre-X15.3 split), `createChallenge` + `expireOpen` on ChallengeEscrow | Pre-X15.3 era | ⚠️ Not formally rotated out — still authorized for ChallengeEscrow; consider revoking before mainnet |
| **TournamentPool v2.1 declared `trustedSigner`** | `0xf35c284D9aB07Abb4fc297C2af89B467E30f2273` | 0 ETH; **zero on-chain activity** (no outgoing tx) | Unknown | ❓ Drift — see open-question Q-W1 |
| **feeVault (post-X19b)** | `0x455536e4bC148Eba4621d0AfB8EFD59e0654F596` | 0.0013 ETH; EOA; **no token transfers, no logs** (clean) | Base Sepolia faucet 2026-05-14 (separate origin, not transferred from sibling) | ✅ Compliant — invariant restored 2026-05-14 (was previously colliding with trustedSigner per memory `project_x19b_fee_vault_separated.md`) |
| **Test-user wallet (founder?)** | `0x1b2630a35aCAaCbFE23E68A6F18cFfE00A15Ecf6` | Used `createChallenge` on ChallengeEscrow once | Unknown | Out of scope (player wallet) |

### Centralization disclosures (audit-firm input)

**Top 5 single points of failure** ranked by blast radius:

1. **`STUDIO_PRIVATE_KEY` = `0xA24f9122…` is the cron-broadcaster for everything.** Its compromise lets an attacker (a) create arbitrary tournaments, (b) submit arbitrary scores with valid attestations, (c) settle ChallengeEscrow duels, (d) call `walkover`. This single EOA is the **largest single point of failure on chain**. The "role-distinct wallet" invariant in `wallets-base-sepolia.md` describes the *contract-config* axis (each contract stores its own signer address) but not the *broadcaster* axis — at the broadcaster axis, one wallet is doing five jobs.
2. **`CRON_SECRET` is the only auth on Vercel cron routes.** Per CLAUDE.md invariant 6, cron is the only writer of tournament state — anyone who can present a valid `CRON_SECRET` can trigger `createTournament` + `settle` + `submitSoloScore` flows. No rate limiting visible at this audit layer.
3. **Anthropic API key shared across all surfaces.** Single `ANTHROPIC_API_KEY` powers Coach, Recap, Anti-Cheat, and Duel-loop. A key leak revokes all four surfaces simultaneously — and rotation requires re-deploying every Vercel project that holds the env var.
4. **`SUPABASE_SERVICE_ROLE_KEY` distributed across 7+ Vercel projects.** RLS posture is correct (24/24 tables enabled) but service-role bypasses RLS entirely; one leaked service-role key = full DB exfil. Memory entry `project_skillos_no_staging_supabase.md` flags the absence of a staging project — mainnet plan must add preview branches or staging before launch.
5. **`sepolia.base.org` public RPC dependency.** When `BASE_SEPOLIA_WRITE_RPC_URL` is unset, the app falls back to the public Base RPC. A public-RPC outage (Sprint X9 mirror-drill style) breaks indexer + cron broadcasts.

**Lesser disclosures, still worth flagging:**

- DevAttributionNFT address is **not exported in `packages/contracts/src/addresses.ts`** — frontend can't read it consistently; ops-fragile.
- ArcadePool source exists, is tested (22 cases), but has no deployment script — dead-code candidate.
- TournamentPool source includes v2.2 fee-share constants (`DEV_BPS = 7000`, `PLATFORM_BPS = 3000`) but deployed v2.1 doesn't execute the split — upgrade gap.
- Legacy `0x1569A95e…` agent wallet still has unrevoked authorizations on ChallengeEscrow.

---

## 9. Phase trajectory readiness

### Phase 1 (current — testnet)

**Operational?** Yes. All 6 games live on `*.skillos.games` Vercel anycast, the API is live (`v1/health` 200), Supabase RLS baseline applied today, CI workflow green, agent-runner workflow live, ChallengeEscrow + TournamentPool v2.1 + sponsor stack all verified on Blockscout.

**Single points of failure documented** (see §8). Most acute: cron broadcaster concentration.

### Phase 2 (next — mainnet, audit-gated)

| Mainnet-readiness item | State |
|---|---|
| External audit firm engaged | ❌ Pending — Sprint X8 internal pre-mainnet ultrareview (12-axis) is sized as input to firm |
| Cayman entity | ❌ (out of scope of this audit) |
| Wallet rotation plan written | ⚠️ Partial — per-role rotation pattern proven by X19b feeVault, but broadcaster-concentration risk not yet addressed |
| AntiCheat rebuild | ❌ Pending (Haiku 4.5 wired but rebuild scoped for Phase 2) |
| Class-fairness invariants | ⚠️ Encoded at contract layer (agents + humans on same arena) but live monitoring not yet on-chain |
| v2.2 contract (fee-share 70/30) | ❌ Source-prepared (`DEV_BPS`, `PLATFORM_BPS`) but undeployed |
| `/v1/scores` plausibility (T1+) | ❌ Per memory `project_phase2_mainnet_blocker_plausibility.md` — T0-only ships in X2; real-USDC tournaments need T1+ |
| Nonce store unification (Upstash) | ❌ Per memory `project_phase2_nonce_store_unify.md` |
| Staging Supabase project | ❌ Per memory `project_skillos_no_staging_supabase.md` — single project today |
| CI workflow | ✅ Shipped (CLAUDE.md drift; reality leads documentation) |

### Phase 3 (decentralization)

**Centralization vectors that must be replaced before this phase makes sense:**

1. `STUDIO_PRIVATE_KEY` cron broadcaster → multi-sig or threshold-signing scheme; or move score-attestation to ZK proof / opt-in classifier rather than centralized signer.
2. Supabase as state-of-record for tournament/duel results → on-chain event sourcing with off-chain projection (TournamentCreated indexer per memory `project_post_yc_tournament_created_indexer.md` is the start).
3. SponsorshipModule sanctions oracle is currently `MockSanctionsOracle` — Phase 2 swaps to Chainalysis (immutable address rotation via fresh module deployment).

### Phase 5 (substrate)

**SkillbaseAnchor.** Source ready, tests written (17), deployment script ready, **not deployed**. Awaits cron integration (anchor SP snapshots daily) + `STUDIO_ANCHOR_ADDRESS` env var.

**Cross-class data flywheel infra:** SP snapshots already in `v2_sp_snapshots` (20 rows), marked deny-by-default RLS (service-role only). Anchor-tx hashes already structured into the schema. Substrate prep is on track for the data side; the on-chain anchor is the missing piece.

---

## 10. Drift inventory (memory + CLAUDE.md vs reality)

| # | Source claim | Reality | Severity |
|---|---|---|---|
| D1 | CLAUDE.md: *"No CI today: `.github/workflows/` does not exist"* | `ci.yml` + `agent-runner.yml` both exist; 90+ CI runs in last 100; 97.8% pass rate | **HIGH** — documentation lags reality by ~Sprint or more |
| D2 | CLAUDE.md: *"optimizer 200 runs, no via_ir"* | Dual-profile: `default` (via_ir=true) for ChallengeEscrow + future; `phase1-legacy` (via_ir=false) for v2.1 stack. Confirmed on Blockscout per address | **MEDIUM** — wording stale post-X19a.2 ADR-0002 |
| D3 | Memory `project_x15_agent_wallet_split.md`: *"STUDIO_PRIVATE_KEY (trustedSigner + submitSoloScore broadcaster), AGENT_PRIVATE_KEY (chargeRetryFee broadcaster)"* | Confirmed by on-chain trace: `0xA24f9122…` = STUDIO; `0xf481b744…` = AGENT. **Plus** unrevoked legacy `0x1569A95e…` with stale auth on ChallengeEscrow | **MEDIUM** — legacy agent wallet auth not formally revoked |
| D4 | `contracts/deployments/sponsor-stack-base-sepolia.json` declares `trustedSigner: 0xf35c284D9a…` | On-chain: `0xf35c284D…` has **0 transactions, 0 ETH, no token transfers** — never broadcasts anything. Actual signer producing accepted submitSoloScore signatures appears to be `0xA24f9122…` (which broadcasts the txs containing those signatures) | **HIGH** — config-vs-runtime drift; see Q-W1 |
| D5 | Memory `project_skillos_rebrand_state.md`: *"GitHub: skillbase→skillos; skillbase-apex→skillos-apex; local folders unchanged"* | GitHub rebrand confirmed (DNS for `skillbase.network` is NXDOMAIN). **But:** Vercel project names still `skillbase-apex`, `skillbase-sponsor`, `skillbase-orchestrator`; `skillbase.games` still resolves and is dual-aliased on every game project; `QUICK_AUTH_DOMAIN` env on 5 games still says `*.skillbase.games` | **MEDIUM** — rebrand cutover ~70%; legacy domain still live |
| D6 | Vercel scope claim (memory) | Confirmed: `simpl3s-projects` is the team scope, 12 projects total (incl. junk `node_modules` project) | OK |
| D7 | Memory `project_phase2_mainnet_sprint_x8_ultrareview.md`: Phase 2 ultrareview = 12-axis | Phase 2 ultrareview scope intact; this CR1-R3 audit feeds axis-6 (infra / contracts / auth) | OK |
| D8 | `mas-wordle` install command per Vercel inspect: `npm install --prefix` (no path arg) | Build still succeeds (status Ready) — Vercel may be ignoring the malformed override and using default. Other apps either default or use `npm install --prefix=../..` (orchestrator) | **MEDIUM** — undocumented config; if ever respected, could break the build |
| D9 | `mas-2048` env shape differs significantly from the other 5 games (CDP/x402 wiring + `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS`; missing `CRON_SECRET`, `TESTNET_DEFAULT_PRIZE_POOL`, `SCORE_SIGNER_PRIVATE_KEY`, `QUICK_AUTH_DOMAIN`, etc.) | Either canonical post-X15 template that other games must catch up to, or X20 pilot-only divergence | **MEDIUM** — env-var-shape drift |
| D10 | `skillos.games` apex marketing landing | Apex resolves to AWS Route 53 IPs (`13.248.243.5`, `76.223.105.230`) with **GoDaddy parking cert** — **not on Vercel**, no project claims it | **HIGH** — root-domain marketing posture is a parking page, not the apex Vercel site (which is on `skillos.network`) |
| D11 | Junk Vercel project `node_modules` under `simpl3s-projects` scope | Exists with no deployment; likely from accidental `vercel link` against repo's `node_modules/` directory | LOW — cleanup candidate |
| D12 | CLAUDE.md Next.js framing (per memory `project_claudemd_nextjs_version_stale.md`) | Stale: all games + 2048 on `next@^16.2.4` not Next 14 | OK — already memory-tracked |

---

## 11. Open questions for founder

- **Q-W1** — `contracts/deployments/sponsor-stack-base-sepolia.json` declares the TournamentPool v2.1 `trustedSigner` as `0xf35c284D9aB07Abb4fc297C2af89B467E30f2273`, but that wallet has zero on-chain history and no balance. Yet `submitSoloScore` calls on the pool are succeeding (8 in the last 30 txs). Either (a) the contract's stored `trustedSigner` is actually something else (e.g., `0xA24f9122…`) and the manifest is stale, or (b) the contract accepts signatures from a different address than declared. Suggest reading the v2.1 contract's `trustedSigner()` view via Foundry `cast call` to confirm canonical on-chain state. (Pre-mainnet blocker — wrong signer = wrong attestation provenance.)
- **Q-W2** — Legacy agent wallet `0x1569A95eaF3bB970E5c03F53f026849864C39fdA` (pre-X15.3 split) still has authorizations on ChallengeEscrow and ran 1 `chargeRetryFee` on TournamentPool v2.1 mixed in with the X15.3 broadcaster. Should it be formally revoked before mainnet, or is it still in active use as a player-side wallet?
- **Q-V1** — `skillos.games` apex points at AWS Route 53 with a GoDaddy parking cert. Intended? Should the apex CNAME to `skillos.network`, to a dedicated Vercel marketing project, or stay parked until the rebrand cutover is announced?
- **Q-V2** — `skillbase.games` still resolves and every game/sponsor Vercel project keeps the legacy alias. When does the dual-domain cost (TLS issuance, registrar renewal, `QUICK_AUTH_DOMAIN` drift) get cut? Risk: dropping `skillbase.games` aliases without first updating `QUICK_AUTH_DOMAIN` on the 5 games breaks Farcaster Quick Auth.
- **Q-V3** — Vercel project `node_modules` (no deploys, no domain) — safe to delete? Likely an accidental `vercel link` against the literal `node_modules/` directory.
- **Q-V4** — `mas-wordle` install command is `npm install --prefix` (no arg). Was this a copy-paste truncation, or intentional? Builds succeed, so Vercel may be ignoring it — but if respected on a future build it would fail.
- **Q-V5** — `mas-2048` env-var shape differs from the other 5 games. Is the x402/CDP wiring the canonical post-X15 game template (and other games owe an update), or is 2048 a pilot-only branch?
- **Q-C1** — CLAUDE.md still says *"No CI today"*, but `ci.yml` is the merge gate for `main` with 97.8% pass rate. Update CLAUDE.md to reflect Phase 2 discipline transition already in flight?
- **Q-C2** — CLAUDE.md still says *"no via_ir"* — supersede with reference to `docs/adr/0002-dual-profile-pipeline-split.md`?
- **Q-S1** — `agent-runner.yml` has its daily `0 2 * * *` cron line commented with intent "enable after 7-day stability". Was the stability window achieved? If so, follow-up PR to uncomment?
- **Q-S2** — No staging Supabase project (memory `project_skillos_no_staging_supabase.md`). Phase 2 plan should specify whether the mainnet cutover adds (a) a preview-branches setup on the existing project, (b) a separate staging project, or (c) accepts the single-prod risk with strong rollback procedure.

---

**Audit complete.** Read-only; no fund movements; no secret values disclosed; domain neutrality preserved. All claims verifiable from the artifacts cited (Blockscout API JSON, Vercel CLI output, Supabase MCP queries, `dig` output, source file paths). VTP discipline per §3.14 — drift surfaced loudly without speculation.
