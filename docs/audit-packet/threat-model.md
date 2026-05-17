# SkillOS Threat Model — Audit-Firm Engagement Packet

**Date:** 2026-05-17 (Phase 1 wrap declared)
**Scope:** Full-stack (Option C) — 9 components × 6 STRIDE categories
**Status:** Pre-mainnet — Phase 1 wrap final sprints in progress (Cluster 1), Phase 2 pre-mainnet hardening queued (Cluster 2)
**Sources:** UR Pass 1 offchain-findings (May 16), CR1 R1-R4 + SYNTHESIS (May 17), v2.1 Foundry test suite (207 tests)
**Domain:** Base Sepolia testnet protocol — mainnet activation gated on audit firm sign-off + Cayman entity + Cluster 2 closure

---

## Executive summary

SkillOS is a permissionless skill-gaming substrate operating on Base Sepolia testnet. Phase 1 ships a verifiable on-chain attestation primitive with sweepstakes-safe storage architecture, role-distinct wallet topology, and class-agnostic (human + agent) participation. This threat model catalogs the attack surface across 9 components and 6 STRIDE categories with current mitigation status, pending sprint coverage, and residual risk acknowledgment.

**Architectural invariants (binding, contract-enforced where possible):**

1. **Sweepstakes safety at storage layer:** `feeCollected` and `prizePool` accumulators live in segregated storage slots. Prize pools are sponsor-funded only via `sponsorPool()`. Foundation treasury never funds prize pools.
2. **Class-agnostic substrate:** Agents and humans submit through the same arena under the same attestation primitive (T0-T3 tier framework; T0 live, T1+ deferred to Phase 2).
3. **Permissionless sponsorship:** Anonymous wallets fund any pool via `sponsorPool()`. ERC-5192 Soulbound receipts emitted. No gatekeeping at protocol layer.
4. **Builder Code attribution (ERC-8021):** Per-game dataSuffix appended to every attributed transaction. Chain-verified for both agent and human paths (X10 + X10b sprints).
5. **Role-distinct wallet topology:** Deployer ≠ owner ≠ trustedSigner ≠ feeVault. Rotation discipline binding for mainnet cutover.

**Pre-audit hardening progress (UR Pass 1 + CR1):**

- 2 Critical findings: 1 resolved (C1 SIWA auth gate, PR #109), 1 in Phase 2 sprint (C2 rate limiter)
- 9 High findings: 6 queued in P2-Pre-A1/A2, 3 in P2-Pre-Contract / X11 / X19
- 207 Foundry tests across 8 contracts; 0 Critical / 0 High in contracts post-UR Pass 1 Track A
- All 24 public Supabase tables RLS-enabled
- 350-commit history secret scan: 0 true positives
- 42 distinct drift instances cataloged (memory-as-spec drift §2.6), all mitigation-tracked

---

## Component inventory

| # | Component | Surface | Phase tag |
|---|---|---|---|
| 1 | Smart contracts | TournamentPool v2.1 + SponsorshipModule + SponsorReceiptSBT + SkillbaseAnchor + ChallengeEscrow (deployed Base Sepolia, 8 contracts total: 6 deployed, 2 undeployed) | P1 ✓ live, P2 v2.2 deploy pending |
| 2 | API auth layer | SIWB (human) + SIWA (agent) at `api.skillos.network` + x402 paid-data tiers | P1 ✓ live |
| 3 | Cron broadcast | 6 daily orchestrator crons triggering `createTournament` / `settle` / `submitSoloScore` / `anchor` / `reconcile` / `index` | P1 ✓ live |
| 4 | Frontend | 6 game apps (`*.skillos.games`) + sponsor app + agent-runner CLI + apex marketing | P1 ✓ live |
| 5 | Dependency chain | 4 published npm packages (`@skillos/*`) + workspace internals + transitive deps | P1 ✓ live |
| 6 | Supabase data layer | Prod project `clizuqvtkekzxiflbsyr`, 24 public RLS-enabled tables, 19 migration files | P1 ✓ live |
| 7 | GitHub Actions | 2 workflows (ci.yml + agent-runner.yml) + secrets in repo settings | P1 ✓ live |
| 8 | DNS | `skillos.network` apex + `*.skillos.games` subdomains + legacy `skillbase.games` aliases | P1 ✓ live (cutover incomplete) |
| 9 | Wallet topology | 8 role-distinct wallet positions; **chain-verified May 18**: Owner `0x3A4F9eB7...` ≠ STUDIO `0xA24f9122...` (distinct EOAs); feeVault is contract-internal in v2.1 (no separate EOA; v2.2 X11 introduces dev/platform recipient split) | P1 ✓ live (verified) |

---

## STRIDE matrix — component by component

### Component 1 — Smart contracts

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | ECDSA signature forgery on `submitScore` | **Mitigated** | trustedSigner ECDSA verify; nonce in calldata | trustedSigner rotation discipline mainnet |
| S | Signature replay on same nonce | **Mitigated** | nonce stored in `usedNonces` mapping | Foundry test coverage |
| S | trustedSigner key compromise (largest SPF) | **Partial** | Single EOA `0xA24f9122...` (testnet) | **Mainnet rotation** + P2-Pre-B role-split (broadcaster decoupling) + P3 threshold trustedSigner if needed |
| T | Reentrancy on retry fee + score submit | **Mitigated** | OpenZeppelin ReentrancyGuard + checks-effects-interactions; 207 Foundry tests | — |
| T | Storage collision feeCollected ↔ prizePool | **Mitigated** | Separate storage slots (foundational invariant) | Audit firm verifies via Foundry invariant test |
| T | Owner front-running `emergencyWithdraw` (M-3) | **Pending** | Owner role concentrated | P2-Pre-Contract: Timelock + bucket-scoped withdrawal |
| T | Unbounded loop in `ArcadePool.refundIfEmpty` (M-1) | **Pending** | Loop bounded by participants count (no upper limit) | P2-Pre-Contract: PullPayment pattern |
| T | EIP-191 vs EIP-712 signature schema split (M-2) | **Pending** | Both schemas accepted today (smart wallet compat) | P2-Pre-Contract: consolidate EIP-712 + ERC-6492 unwrap |
| R | Score submission without on-chain trace | **Mitigated** | `ScoreSubmitted` event emission with sender + game + score + tier | — |
| R | Sponsor funding without proof | **Mitigated** | ERC-5192 SoulboundReceipt minted on `sponsorPool()` | — |
| R | Anti-Cheat flagScore (Haiku-direct, no audit trail) | **Partial** | Phase 1 testnet active on duel path (currently inactive via DuelComingSoon); no confidence gate, no human appeal | P2 X20 rebuild — Option F (deterministic formula + Haiku off-chain advisory queue, no irreversible LLM verdicts on-chain) |
| I | On-chain data is public by design | **Acknowledged** | No PII on-chain | — |
| I | MockSanctionsOracle returns hardcoded responses (testnet) | **Acknowledged** | Phase 1 testnet only | P3: Chainalysis swap via fresh `SponsorshipModule` deploy (immutable address rotation) |
| D | Gas griefing on `settle` (no per-call gas limit) | **Acknowledged** | Cron broadcaster carries cost | Cron settle throughput refactor (X17, P2) |
| D | Score submission spam against retry fee path | **Acknowledged** | 1 USDC retry fee per call (economic barrier) | — |
| E | Owner role concentration | **Mitigated (partial) — verified May 18** | Owner = `0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE`, **DISTINCT EOA from STUDIO/trustedSigner** (`owner()` eth_call). Concentration lower than originally documented; `setFeeVault` authority still single-EOA. | **X11.5 Multi-sig at mainnet boot** (P2, new sprint) — Owner role transitions cleanly to Safe Wallet without conflating with STUDIO rotation |
| E | trustedSigner concentration (broadcaster for 4-5 jobs, MB-11) | **Pending** | Single EOA carries `createTournament` (15), `submitSoloScore` (8), `settle` (1) on TournamentPool v2.1 + `settle` (8), `walkover` (1) on ChallengeEscrow | P2-Pre-B: STUDIO broadcaster role-split + ETH preflight in cron |
| E | Compromised legacy AGENT wallet `0x1569A95e...` (unrevoked authorizations) | **Pending** | Unrevoked authorization on ChallengeEscrow + 1 chargeRetryFee call mixed with X15.3 split (R3 Q-W2) | P2-Pre-Contract / X11: formal revoke before mainnet |

---

### Component 2 — API auth layer

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | SIWB signature forgery | **Mitigated** | viem `verifyMessage` + ERC-6492 wrapper for undeployed smart wallets; atomic nonce consume before crypto | — |
| S | SIWA signature forgery (per-request ERC-8128) | **Mitigated** | ERC-8004 lookup + ERC-8128 per-request sig + nonce | — |
| S | SIWA stale-NFT 24h window (H2) | **Pending** | `verifyOnchain: false` on agent-auth — stale NFT acceptable up to 24h after delisting | P2-Pre-A1: flip `verifyOnchain: true` |
| S | Bearer token tampering | **Mitigated** | JWT signature verify with `JWT_SECRET` | — |
| S | SIWA receipt tampering | **Mitigated** | ERC-8128 cryptographic receipt structure | — |
| T | Request body mutation in transit | **Mitigated** | HTTPS enforced; no body integrity beyond auth signature on submitScore | — |
| T | Score plausibility check absent at submit (H3) | **Pending** | T0 signs whatever client submits; T1+ returns 501 | MB-9 / X14: T1+ plausibility gate (mainnet blocker) |
| R | API call without trace | **Mitigated** | Structured JSON logs per request | — |
| R | Bearer token no revocation list (M10) | **Pending** | JWT stateless 24h TTL; rotation invalidates ALL agents/users simultaneously | P2: `receipts_revoked` table |
| I | Sensitive data in error messages (dev mode) | **Partial** | Production error sanitization in place | Audit firm sweep |
| I | x402 payment receipt details exposed | **Acknowledged** | Facilitator-side data; SkillOS does not store | x402 facilitator trust (H5) — verify on-chain receipt before serving |
| D | C2 — in-memory rate limiter cosmetic on Vercel (mainnet blocker) | **Pending** | Per-Lambda `Map()` — N-instance bypass, cold-start resets | P2-Pre-A2: Upstash KV REST |
| D | Heavy auth burst (no protection beyond rate limit) | **Acknowledged** | Per-route Vercel cold-start limits | P2-Pre-A2 covers |
| D | H5 — x402 facilitator trusted without on-chain receipt verification | **Pending** | Compromised facilitator returns fake tx hash | P2-Pre-A2: `waitForReceipt` + log assertion + amount validation |
| D | H6 — x402 paywall middleware mounted on `'*'` | **Pending** | Env-misconfig downs whole API | P2-Pre-A1: scope to `/v1/data/*` |
| E | C1 — `/v1/agents/matches/start-solo` unauthenticated (RESOLVED) | **Resolved** | PR #109 May 17 — `requireSiwaAuth` middleware applied; curl unauth → 401 verified | — |
| E | Bearer token after rotation no revocation | **Pending** | Stateless JWT 24h TTL | Same as M10 |

---

### Component 3 — Cron broadcast

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | Unauthorized cron trigger | **Mitigated** | `CRON_SECRET` env var auth on 6 Vercel cron routes | L1: timing-safe-compare instead of `===` (P2-Pre-C) |
| S | Preview-deploy cron auth degrades to "accept all" (L2) | **Pending** | Startup invariant absent | P2-Pre-C: startup-time auth invariant assertion |
| T | Cron payload manipulation | **Acknowledged** | Internal-only calls; no untrusted input | — |
| T | State race during cron execution | **Mitigated** | DB-level idempotency via tournament_id unique key | Cron settle throughput refactor (X17) |
| R | Cron run without log | **Mitigated** | Vercel cron logs + `v2_cron_runs` Supabase table (RLS-enabled D top-3a apply) | — |
| I | `CRON_SECRET` leak via env var | **Mitigated** | Env-scoped to functions; no log emission | Periodic rotation per Phase 2 hardening |
| D | Wallet topology balance depletion silently failing crons | **Resolved** | X9.1 preflight check (PR #80) — fail-loud at sweep start | Mainnet alerting layer (Phase 2 monitoring) |
| D | RPC fallback to public `sepolia.base.org` (SPF-10) | **Pending** | When `BASE_SEPOLIA_WRITE_RPC_URL` unset, public RPC outage breaks cron + indexer | P2: paid RPC mandate |
| D | Schedule × ops collision (cron iteration order × wallet balance, X9 case study) | **Resolved** | X9 strict revert decode + X9.1 preflight balance check | Mainnet: alerting layer |
| E | `CRON_SECRET` = only auth on 6 cron routes triggering on-chain state (SPF-7) | **Acknowledged** | Cron broadcaster blast radius = arbitrary tournaments + settle + submit | P2 additional gates (e.g., on-chain timelock for high-impact operations) |
| E | STUDIO broadcaster role concentration (MB-11) | **Pending** | 4-5 jobs in single EOA | P2-Pre-B role-split (see Component 9) |

---

### Component 4 — Frontend (game apps + sponsor + agent-runner)

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | Wallet-connect spoofing | **Mitigated** | Signed message + nonce per session | — |
| S | Domain spoofing / phishing | **Partial** | TLS + GoDaddy CA G2 cert on apex; legacy `skillbase.games` dual-aliased | P2-Pre-C: brand cutover + `skillos.games` apex redirect |
| T | Client-side score tampering | **Mitigated** | Server-side T0 signature gate; T1+ plausibility deferred (MB-9) | — |
| T | Replay artifact tampering (Phase 5 substrate concern) | **Acknowledged** | Phase 5 data-layer absent today (no human-side move trace, no replay storage) | Phase 4-5 substrate initiative |
| R | User action without log | **Mitigated** | Vercel deploy logs + Supabase audit trail | — |
| I | Source maps in production | **Pending** | Default Next.js behavior; verification pending | P2-Pre-C audit |
| I | localStorage / sessionStorage leaks | **Pending** | Wallet libraries store session data client-side | P2-Pre-C audit |
| I | Hardcoded canonical signer in `apps/2048/src/app/api/admin/system-health/route.ts:42` (L4) | **Pending** | Static address in source | P2-Pre-C: extract to env var |
| D | Client-side rendering pressure | **Acknowledged** | Solo games lightweight (browser-runnable bounded session) | — |
| E | Limited frontend admin surface | **Acknowledged** | No admin frontend; ops via CLI + GitHub Actions | — |

---

### Component 5 — Dependency chain

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | Typosquatting at npm install | **Mitigated** | No auto-install of untrusted packages; CI lockfile-locked | — |
| S | Supply-chain attack (malicious package update) | **Pending** | No SBOM today | P2: SBOM + Dependabot |
| T | Tree-shake bypass / dead code activation | **Mitigated** | Vercel bundle minify + standard tree-shake | — |
| T | Postinstall script abuse | **Acknowledged** | npm lifecycle scripts audited periodically | P2 audit |
| R | Dependency provenance gap | **Pending** | No signed package attestation today | P2: SBOM |
| I | Leaked secrets in dependency code | **Mitigated** | 350-commit history scan May 17 — 0 true positive | Periodic rescan |
| I | SDK `prebuild` triggers live API fetch (R2 D8) | **Pending** | `prepare: npm run build` → `https://api.skillos.network/openapi.json` fetch at install | P2-Pre-D: vendor `openapi.json` |
| D | Vulnerable transitive dependency | **Partial** | Manual `npm audit` periodic | P2: automated `npm audit` CI gate |
| D | API outage during SDK install (circular dep) | **Pending** | SDK install requires live API | P2-Pre-D vendor + offline install |
| E | Postinstall scripts with elevated permissions | **Acknowledged** | Standard npm scope | P2 audit |

---

### Component 6 — Supabase data layer

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | Service-role key impersonation | **Pending** | `SUPABASE_SERVICE_ROLE_KEY` distributed across 7+ Vercel projects (SPF-9) | P2: staging project + scoped service keys where possible |
| S | User session forgery | **Mitigated** | Supabase auth + RLS policies | — |
| T | Direct DB write via service-role bypass | **Acknowledged** | Service-role bypasses RLS by design | Service-role exposure minimization P2 |
| T | Migration tampering | **Mitigated** | Branch protection + CI; X19 schema reconciliation in flight | CODEOWNERS on `supabase/migrations/` (founder-pinned per X19 lock) |
| T | Schema drift items (9 across 4 classes, X19) | **Pending** | UR Pass 1 X19 scope confirmed | X19 sprint (3-5 days) — 4-class breakdown documented |
| R | V1 orphan tables (6+ tables, Q-34 = drop all) | **Pending** | Live tables with no current consumer | Phase 2 forward migration: drop |
| R | Migration registry vs file drift | **Pending** | 22 registry rows vs 19 files on disk | X19 sprint |
| I | PII in Supabase | **None by design** | Wallet addresses only; no email/name/PII | — |
| I | Service-role key in env var | **Acknowledged** | Distributed across 7+ projects, single rotation invalidates all | P2: per-project scoping where possible |
| D | Connection pool exhaustion | **Acknowledged** | Low traffic testnet | Mainnet: connection pooler + monitor |
| D | RLS policy DoS | **Mitigated** | Well-formed policies on all 24 tables (D top-3a apply complete) | — |
| E | Service-role key leak | **Pending** | High-impact single secret | P2: scope per surface where possible |
| E | RLS bypass via Postgres extension | **Acknowledged** | Standard extensions enabled (pg_stat, pgcrypto, uuid-ossp) | Phase 2 audit |

---

### Component 7 — GitHub Actions

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | Workflow injection via untrusted PR | **Mitigated** | No `pull_request_target` with secrets; agent-runner scheduled + workflow_dispatch only | — |
| S | Branch protection bypass | **Mitigated** | Branch protection enforced on `main`; PR-only since May 8 | — |
| T | Workflow file tampering | **Partial** | Branch protection + CODEOWNERS proposed for `supabase/migrations/` | P2-Pre-C: expand CODEOWNERS to `.github/workflows/` |
| T | Secret access scope creep | **Pending** | Per-workflow secret usage map (R3 §4) | P2-Pre-C: per-workflow secret audit |
| R | Workflow run trail | **Mitigated** | GitHub audit log + Actions run history | — |
| I | Secret leak via workflow log echo | **Mitigated** | GitHub auto-masks; no manual echo of secrets in CI | Periodic CI log review |
| I | Workflow permissions broader than needed | **Pending** | Default `GITHUB_TOKEN` scope | P2-Pre-C: narrow `permissions:` per workflow |
| D | foundry-toolchain GitHub API rate limit | **Documented** | 60/h anonymous → 1000/h with token | CI workflow hardening: add `GITHUB_TOKEN` env to foundry-toolchain step |
| D | Workflow cancellation | **Acknowledged** | Scheduled only; no DoS attack vector | — |
| E | Workflow permissions overly broad | **Pending** | See Information disclosure | P2-Pre-C |

---

### Component 8 — DNS

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | Domain hijacking | **Mitigated** | GoDaddy 2FA enabled | Registrar lock verification (P2-Pre-C) |
| S | Subdomain takeover (dangling CNAME) | **Pending** | `skillos.games` apex parking page (R3 D10); legacy `skillbase.games` dual-aliased | P2-Pre-C: apex redirect + alias cleanup |
| S | Apex marketing brand drift (HD-3) | **Pending** | `skillos.games` resolves to AWS+GoDaddy parking, not Vercel | P2-Pre-C: CNAME to skillos.network |
| T | DNS hijack at registrar | **Mitigated** | Registrar lock + 2FA | — |
| T | Legacy `skillbase.games` cutover incomplete (MD-5) | **Pending** | Every game project keeps legacy alias + `QUICK_AUTH_DOMAIN` env drift | P2-Pre-C: 2-phase cutover (env update first, then alias drop) |
| R | DNS change without audit | **Mitigated** | GoDaddy audit log | — |
| I | WHOIS data exposure | **Acknowledged** | Business address public; no GDPR concern | — |
| D | Registrar lock | **Pending** | Lock verification | P2-Pre-C confirm |
| D | DDoS at DNS layer | **Acknowledged** | Vercel-level CDN protection; no dedicated DDoS scrubbing | P2 audit (Cloudflare consideration) |
| E | DNS registrar account compromise | **Acknowledged** | Highest single-attacker blast radius (full domain control) | 2FA + recovery code discipline |

---

### Component 9 — Wallet topology

| STRIDE | Threat | Status | Mitigation | Plan |
|---|---|---|---|---|
| S | Private key impersonation via env var leak | **Pending** | Keys in Vercel env vars per project (not KMS/HSM) | Mainnet KMS/HSM consideration P2-Pre-B |
| S | Wallet rotation drift | **Mitigated** | X19b rotation discipline May 14; Q-W1 manifest fix May 17 (PR #119) | Pre-deploy assertion (P2-Pre-Contract) |
| S | Mainnet wallet history contamination | **Disclosed** | Current testnet `0xA24f9122...` (nonce 529) cannot be reused on mainnet | Mainnet rotation: fresh fiat onramps, zero on-chain connection between role-distinct addresses |
| T | Wallet env-var typo at deploy time | **Partial** | Manual env var sync per Vercel project | P2-Pre-B: wallet-env manifest + boot-time cross-check (H1) |
| R | Wallet action without trace | **Mitigated** | On-chain by design | — |
| I | Private key in env var (not KMS/HSM) | **Pending** | Standard Vercel env var scope | Mainnet: KMS/HSM evaluation |
| I | Wallet env-var-name leak (M2) | **Pending** | Distinct env var names per wallet leaks role topology | P2-Pre-B: opaque env var naming |
| D | Wallet balance depletion silent fail | **Resolved** | X9.1 preflight check | Mainnet: alerting |
| D | Wallet rate-limit at RPC layer | **Acknowledged** | Public RPC fallback SPF-10 | Paid RPC mandate P2 |
| E | STUDIO_PRIVATE_KEY broadcaster (SPF-1, largest single chain SPF) | **Pending** | 4-5 jobs in single EOA: `createTournament` (15), `submitSoloScore` (8), `settle` (1+8), `walkover` (1), `chargeRetryFee` (mixed with X15.3 split) | **P2-Pre-B: STUDIO broadcaster role-split.** Owner role separately covered by X11.5 multi-sig. |
| E | AGENT_PRIVATE_KEY (SPF-2, X15.3 split broadcaster) | **Pending** | Arbitrary `chargeRetryFee` calls; USDC drain | P2-Pre-B: runbook |
| E | Legacy AGENT wallet (SPF-5, unrevoked authorizations) | **Pending** | Pre-X15.3 split wallet still has ChallengeEscrow authorization | P2-Pre-Contract: revoke |
| E | Manifest-declared trustedSigner stale (SPF-6, HD-2) | **Resolved (manifest fix)** | Manifest `0xf35c284D9a...` (zero history) ≠ on-chain `0xA24f9122...` (active) — PR #119 corrects | P2-Pre-Contract: pre-deploy assertion script (manifest ↔ chain) |

---

## Trust assumptions (audit firm acceptance requested)

These assumptions are explicit and binding for the testnet phase. Mainnet activation requires re-evaluation:

1. **Public Base Sepolia RPC `sepolia.base.org` is operational and not adversarial.** Used as RPC fallback when `BASE_SEPOLIA_WRITE_RPC_URL` is unset (SPF-10, mitigation P2: paid RPC mandate).

2. **Anthropic API serving Coach + Recap + Anti-Cheat is not adversarial.** Used by 4 surfaces with shared `ANTHROPIC_API_KEY` (SPF-8). Compromise = AI features degrade or output adversarial content.

3. **Vercel platform is not adversarial.** Serves 12 projects under `simpl3s-projects` scope; holds all production secrets in env vars.

4. **Supabase platform is not adversarial.** Single prod project `clizuqvtkekzxiflbsyr` holds all live data; service-role keys distributed across 7+ Vercel projects.

5. **GitHub platform is not adversarial.** Holds source code, CI secrets, Actions runtime.

6. **GoDaddy registrar is not adversarial.** Holds DNS authority for `skillos.network`, `skillos.games`, `skillbase.games`.

7. **CDP (Coinbase Developer Platform) x402 facilitator is not adversarial at HTTP layer.** On-chain receipt verification pending P2-Pre-A2 (H5 mitigation).

8. **MockSanctionsOracle returns acceptable responses for testnet purposes.** Phase 3 swap to Chainalysis via fresh `SponsorshipModule` deploy (immutable address rotation).

9. **Phase 1 testnet AntiCheat scope is limited and acknowledged.** Solo path: bounds + play-window check only, no on-chain flag. Duel path: Haiku-direct on-chain `flagScore` (currently inactive via DuelComingSoon placeholders). Formula plausibility was design intent never built. Pre-mainnet rebuild architectural per X20 sub-sprints F0-F4: deterministic formula primary + class enforcement (X14) + Haiku off-chain advisory queue. No irreversible LLM verdicts on-chain at mainnet launch.

10. **`STUDIO_PRIVATE_KEY` testnet broadcaster is acceptable for Phase 1 testnet.** Mainnet requires fresh fiat-onramp wallet with zero on-chain connection to testnet roles.

---

## Residual risk summary

Threats acknowledged but explicitly accepted at testnet phase, with Phase 2 mitigation path documented:

| Component | Residual risk | Phase to mitigate |
|---|---|---|
| Smart contracts | Owner + trustedSigner concentration risk **(downgraded May 18 — verified DISTINCT EOAs on v2.1; remaining concentration is `setFeeVault` authority on single Owner EOA)** | **X11.5 Multi-sig at mainnet boot (P2)** + mainnet trustedSigner rotation; legacy single-EOA boot risk no longer applicable post-verification |
| Smart contracts | MockSanctionsOracle (testnet) | P3 Chainalysis swap |
| Smart contracts | T1+ plausibility deferred (testnet only T0 active) | P2 X14 |
| API auth | Bearer JWT stateless (no revocation list) | P2 receipts_revoked table |
| API auth | In-memory rate limiter cosmetic | **P2-Pre-A2** (mainnet blocker) |
| Cron broadcast | STUDIO single-EOA broadcaster concentration | P2-Pre-B role-split |
| Cron broadcast | Public RPC fallback | P2 paid RPC |
| Frontend | Hardcoded canonical signer in admin route (L4) | P2-Pre-C |
| Frontend | Legacy `skillbase.games` dual-aliasing | P2-Pre-C cutover |
| Dependency chain | No SBOM | P2 Dependabot |
| Dependency chain | SDK install-time API fetch (circular dep) | P2-Pre-D vendor |
| Supabase | 9-item migration drift | P2 X19 (in flight) |
| Supabase | Service-role key distribution | P2 scoping |
| GitHub Actions | Workflow permissions broader than needed | P2-Pre-C |
| DNS | Apex parking + legacy alias drift | P2-Pre-C |
| Wallet topology | Private keys in env vars (not KMS/HSM) | Mainnet KMS/HSM evaluation |
| Wallet topology | Mainnet wallet rotation runbook | P2-Pre-B |

---

## Cross-cutting controls (mitigation reuse across components)

1. **HTTPS everywhere** — TLS termination at Vercel edge for all 12 projects.
2. **Branch protection** — `main` requires PR + CI green; bypass requires admin role.
3. **CI workflow with 97.8% pass rate** — merge gate, prevents broken main.
4. **207 Foundry test suite** — contract invariant proof.
5. **All 24 public Supabase tables RLS-enabled** — D top-3a apply complete.
6. **Builder Code attribution (ERC-8021)** — chain-evidenced transaction provenance for 8/8 surfaces post-X10b merge.
7. **Class-agnostic protocol design** — agents and humans not architecturally distinguishable at protocol layer (substrate optionality preserved).
8. **Sweepstakes-safe storage segregation** — `feeCollected` ⊥ `prizePool` at contract storage level.

---

## Methodology notes

- **STRIDE category placement** is best-fit. Some threats span multiple categories (e.g., trustedSigner compromise is both S and E); placed in primary category.
- **Status taxonomy** (Mitigated / Partial / Pending / Resolved / Acknowledged): Mitigated = full control in place; Partial = some control, residual risk; Pending = no current control, Phase 2 sprint queued; Resolved = control shipped during pre-audit prep; Acknowledged = accepted risk, no action planned.
- **Plan column** references either Phase 2 pre-mainnet sprint IDs (P2-Pre-A1/A2/B/C/D/Contract/Standards), existing backlog sprint IDs (X11, X14, X16, X17, X19, X20), or "P3 / mainnet" for deferred items.
- **Source references** map back to: UR Pass 1 offchain-findings (C1, C2, H1-H7, M1-M14, L1-L4), CR1 R1-R4 inventory reports (D-1 through D-14 per track), CR1 SYNTHESIS (HD-1 through HD-7, MD-1 through MD-28, MM-1 through MM-3 drift instances).

---

## Audit firm packet — additional artifacts available on request

- UR Pass 1 audit-prep reports (R4 file lands on disk post-PR-merge)
- CR1 R1-R4 inventory reports + SYNTHESIS
- Foundry test suite (207 tests, 8 contracts, dual-profile configuration per ADR-0002)
- Architecture supplements v1.2 / v1.3 / v1.4 (Phase transitions + invariants + sprint sequencing)
- Wallet topology diagram (forthcoming, this packet companion artifact)
- 4-jurisdiction legal analysis (US federal, US state gambling, Turkish, Cayman)

---

**End of threat model.**
