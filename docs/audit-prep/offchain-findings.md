# Off-Chain Audit — Findings Register (Track B, Pass 1)

**Branch:** `ur/track-b-offchain`
**Scope:** apps/api (write paths + signer + middleware), apps/orchestrator (cron settle/create/reconcile/anchor/indexers), packages/duel-backend (cron implementation), packages/lib-shared (signer mirror).
**Method:** static read; no code changes. Each finding cites file:line. Detailed cluster reports under `docs/audit-prep/_raw/`.
**Severity scale:** Critical | High | Medium | Low | Info.

Counts after cross-cluster dedup: **2 Critical · 9 High · 14 Medium · 7 Low · 7 Info** (39 distinct findings).

---

## Critical (mainnet blockers)

### C1 — `POST /v1/agents/matches/start-solo` is unauthenticated and moves real funds per call
**Cluster cross-refs:** B-05, C-3, D-F2.
**Files:** `apps/api/src/routes/agents-matches.ts:42-149` (no `requireSiwaAuth()`); module top-comment at lines 2-7 acknowledges "public for testnet demo era."
**What every call does:** reserves `duel_runs` row → inserts `x15_payment_attempts` row → kicks off `waitUntil()` background worker that (a) settles x402 ($1.05 USDC pulled from AGENT wallet to X402_RECEIVER), (b) broadcasts on-chain `chargeRetryFee` if `priorSolo > 0`, (c) runs the Anthropic-billed game loop, (d) broadcasts `submitSoloScore` with the STUDIO key + a per-game Builder Code dataSuffix.
**Mitigation:** in-memory per-IP rate limiter keyed on first hop of `x-forwarded-for` (spoofable), falls back to literal `'local'` when both `x-forwarded-for` and `x-real-ip` are absent (`agents-matches.ts:75`) → all anonymous callers share one bucket.
**Mainnet blast radius:** at N=5 concurrent Lambda instances × 60 req/min × $1.05/req ≈ **$945/hour** of operator-funded outflow with no caller identity.
**Recommendation:** gate behind `requireSiwaAuth()` and rekey the rate-limit bucket to `agent-matches-start-solo:${agentAddress}`. Add a startup-time `AGENT_PRIVATE_KEY` balance preflight modelled on `preflightSponsorBalance` (`packages/duel-backend/src/cron/tournaments.ts:273-309`).

### C2 — In-memory rate limit is cosmetic on Vercel; every state-modifying route is N×-bypassable
**Cluster cross-refs:** D-F1, B-04 (Hop), C-3 (mitigation).
**Files:** `apps/api/src/lib/rate-limit.ts:18` (`const buckets = new Map<…>()`); used at `routes/scores.ts:178`, `routes/agents.ts:78`, `routes/agents-matches.ts:76`.
**Why ineffective:** the Map is per-Lambda. Cold start resets quota; Vercel's auto-scaled N warm instances multiply the effective per-key cap by N. Module comment at lines 3-8 acknowledges the debt ("Production-grade requires Upstash/Redis; deferred to Phase 2 polish.")
**Routes affected:** `POST /v1/scores` (STUDIO gas per call), `POST /v1/agents/scores` (STUDIO gas), `POST /v1/agents/matches/start-solo` (AGENT USDC + gas — stacks with C1).
**Recommendation:** migrate to Upstash REST counter before any real-USDC route deploys. Pair with the nonce-store-unify work (project memory `project_phase2_nonce_store_unify`).

---

## High

### H1 — No boot-time cross-check between derived signer address and on-chain `trustedSigner`
**Cluster cross-ref:** A-1.
**Files:** `apps/api/src/lib/contracts-vendored/attestation.ts:23-30` (`getSignerAccount`), `wallet-client.ts:46-49` (`getWalletClient`), `packages/lib-shared/src/{attestation.ts:29-41,rpc.ts:54-68}`.
**Gap:** the derived `privateKeyToAccount(STUDIO_PRIVATE_KEY).address` is cached at first use and never compared against `publicClient.readContract({ functionName: 'trustedSigner' })` on TournamentPool v2.1 or ChallengeEscrow. Grep `functionName.*trustedSigner` across `apps/`, `packages/`, `scripts/` → zero runtime hits. The contract ABI declares it (`abi.ts:94`) and the deploy script reads it (`SetTournamentPoolSigner.s.sol:38-39`); no app-runtime path does.
**Historical:** `reports/ultrareview-20260501.md:68` Task 2.1 records the exact failure caught hours before the v2.1 cutover. Without an assertion, the same mismatch would cause every `submitSoloScore` to revert with `BadSignature` in prod.
**Recommendation:** lazy first-call assertion inside `getWalletClient()` reading `trustedSigner()` once per cold start; assert equality; expose on `/v1/health`. Same posture for `ChallengeEscrow.feeVault()`.

### H2 — `/v1/agents/scores` does NOT re-check on-chain `ownerOf`; stale-NFT impersonation window = receipt TTL (24 h)
**Cluster cross-ref:** B-01.
**File:** `apps/api/src/middleware/agent-auth.ts:38-45` — constructed as `siwaMiddleware({ verifyOnchain: false, … })`.
**Behavior:** the SIWA library's `verifyAuthenticatedRequest` (`@buildersgarden/siwa/dist/erc8128.js:283-313`) only calls `registry.ownerOf(agentId)` when `verifyOnchain === true`. Ownership IS checked at receipt issuance (`siwa.ts:92-113`) and then trusted for the receipt's full 24 h.
**Threat:** an agent NFT sale/transfer/slashing inside the window leaves the prior signer authorized for up to 24 h. The audit-question framing ("ownerOf cross-check exists, and is fresh") is materially false for write endpoints.
**Recommendation:** flip `verifyOnchain: true`, or gate the recheck to writes where `(now - receipt.iat) > N minutes`, or implement a TTL'd server-side ownerOf cache.

### H3 — T0 tier signs whatever the client claims; no plausibility, no anti-cheat
**Cluster cross-ref:** B-02.
**Files:** `apps/api/src/routes/scores.ts:189-195` and `agents.ts:85-94` (T0-gate); the signer at `scores.ts:201-208` / `agents.ts:100-107`.
**State:** both routes 400 with `TIER_NOT_IMPLEMENTED` on `tier !== 'T0'`, so T1+ is gated. But T0 itself signs `BigInt(body.score)` with `STUDIO_PRIVATE_KEY` and broadcasts. No bounds check, no historical comparison, no game-side seed-replay verify.
**Severity rationale:** known Phase-2 hard-blocker (memory `project_phase2_mainnet_blocker_plausibility`); listed here because the prompt asked whether the gate is total. Verified total via call-graph: only three call sites of `signSoloSubmitAttestation` exist (`scores.ts:201`, `agents.ts:100`, `runner.ts:305`), and the runner has no tier concept → also T0 by construction.
**Recommendation:** keep T1+ at 400 until plausibility lands; document in audit scope cover-letter as "must fix before mainnet."

### H4 — Settle silent-swallow at `packages/duel-backend/src/cron/tournaments.ts:977` (memory mis-pathed)
**Cluster cross-ref:** C-2.
**Memory correction:** memory entry `project_settle_tournaments_silent_swallow_phase2` claims the bug is at `apps/api/src/routes/tournaments.ts ~line 739`. **REFUTED** — that file is 279 lines total and contains only read handlers. The actual substring-match swallow is at `packages/duel-backend/src/cron/tournaments.ts:977` inside `settleOneTournament`:
```
if (msg.includes("TournamentAlreadySettled")) { … mark DB settled … return; }
```
**Risk class:** identical to the X9 createTournament bug already fixed via `decodeRevertErrorName` (`tournaments.ts:194-203`, reused at 480-481). A revert from an unrelated path whose viem-ABI-decoded message happens to include the substring will be silently treated as already-settled and the DB row marked `settled_at = now` with `settle_tx_hash = NULL`. Asymmetric failure: false-positives mark un-settled tournaments as settled.
**Recommendation:** replace with `errorName === "TournamentAlreadySettled"` selector check (one-line semantic change). Add a unit test that simulates a non-revert error whose `.message` embeds the substring and asserts the catch re-throws. Memory entry must be updated to the correct path.

### H5 — x402 facilitator settlement is trusted without on-chain receipt verification
**Cluster cross-ref:** D-F3.
**File:** `apps/api/src/lib/x402-client.ts:298-322`.
**Gap:** server records `response.transaction` as canonical x402 settle hash without `publicClient.waitForTransactionReceipt({ hash })`, without verifying the USDC `Transfer(from=agent, to=X402_RECEIVER, value=AGENT_MATCH_RETRY_ATOMIC)` log, and without checking `response.network === BASE_SEPOLIA_CAIP2` even though that field is part of the response type.
**Threat:** a compromised facilitator returning `200 { success: true, transaction: 0xdeadbeef… }` for a non-existent tx would:
- mark `x15_payment_attempts.status='x402_settled'`,
- progress to `chargeRetryFee` (gated only on `priorSolo > 0` per `agents-matches.ts:252`),
- spend Anthropic budget on the run loop.
**Recommendation:** add `waitForTransactionReceipt` after settle response, assert (a) `status === 'success'`, (b) `Transfer` log shape, (c) network. Reject + `needs_manual_review` on mismatch.

### H6 — x402 paywall middleware mounted on `'*'`; receiver env-misconfig takes the whole API down
**Cluster cross-ref:** D-F4, D-F11.
**Files:** `apps/api/src/app.ts:59` (`app.use('*', getX402Middleware())`); `apps/api/src/lib/x402.ts:128-133`.
**Behavior:** lazy build is correct in shape (no boot crash on missing env). But the first request to ANY route after deploy invokes the lazy build, and if `X402_RECEIVER_ADDRESS` is unset, `readReceiver()` throws (`x402.ts:45-50`). Hono routes the throw through `errorEnvelope`, returning 500 for every route (health checks, OpenAPI doc, redirect to /docs included) — not a tagged 402 challenge nor a 503 on paywalled paths only.
**Operator impact:** any rotation of `X402_RECEIVER_ADDRESS` that misfires takes the entire API down, not just the paid tier.
**Recommendation:** scope the middleware mount to `/v1/data/*` instead of `'*'`. Catch receiver-read errors inside `getX402Middleware()` and return a tagged 503 on paywalled paths only.

### H7 — `x15_payment_attempts` schema-vs-code drift; insert payload doesn't match migration columns
**Cluster cross-ref:** D-F5.
**Files:** migration `supabase/migrations/v4_20260515_x15_payment_attempts.sql:54-105` defines two CHECK-constrained columns (`x402_status` line 72, `charge_status` line 87); code at `routes/agents-matches.ts:202-220` writes to a single `status` column (does not exist). Same drift in `lib/duel/charge-retry-fee.ts:205-215`.
**Memory says:** a follow-up migration `v4_20260515b_x15_payment_attempts_canonical_lock.sql` collapsed to single-status and was applied to the live DB clizuqvtkekzxiflbsyr on 2026-05-15. That file is **NOT in this branch's `supabase/migrations/`** — `ls` shows only `v4_20260515_x15_payment_attempts.sql` and `v4_20260515c_duel_runs_end_reason.sql`. The X15.5 apex rename PR is per memory still OPEN.
**Effect today:** every `chargeRetryFee` and every `x402_settled` write to `x15_payment_attempts` may either fail-and-warn (if branch DB matches the two-column migration) or succeed silently against an off-branch single-status schema. Either way: the operator's audit ledger is unreliable, and the refund/dispute path (already manual — see H8) has no source-of-truth ledger to refund against.
**Recommendation:** land the canonical-lock migration in `supabase/migrations/` of this branch OR rewrite the code paths to the two-column schema. Add CI integration smoke that performs a real INSERT against a live (test) DB and asserts the row landed.

### H8 — No refund path; x402-captured-but-service-failed leaves agents out-of-pocket
**Cluster cross-ref:** D-F7.
**Files:** `agents-matches.ts:174-178` ("agent's x402 USDC is NOT refunded on failure — operator reconciles manually (X16 will automate)"); `charge-retry-fee.ts:21-23` (same posture).
**Failure mode in production today (memory `project_x15_chargeretryfee_first_paid_retry_race`):** x402 settles → `chargeRetryFee` reverts with `ERC20InsufficientAllowance` (Alchemy ≠ public RPC view race) → API marks `needs_manual_review = true` → no code path reverses the x402 settlement → no user-facing dispute endpoint → no documented operator runbook for the manual refund.
**Recommendation:** (a) ship a `POST /v1/agents/payment-attempts/{id}/dispute` SIWA-authed endpoint that sets `review_notes='disputed'`; (b) operator runbook for `needs_manual_review` rows; (c) long-term (X16) auto-refund tx from receiver back to agent — requires receiver wallet to hold a key (currently receive-only per memory, so this needs a wallet-topology change).

### H9 — No reconciliation cron for orphan `x15_payment_attempts` rows
**Cluster cross-ref:** D-F6.
**Cron inventory:** `apps/orchestrator/vercel.json:4-11` defines six crons; none target `x15_payment_attempts`. `reconcile-duels` operates on stuck `duel_runs`, not payment-attempt rows.
**Orphan failure modes:** Lambda 5-minute timeout mid-orchestration → row stuck at `x402_settled`. DB transient on a status UPDATE → row stuck at `pending`. `runSoloMatch` swallows error after agent already charged → `x15_payment_attempts.status='anchored'` but `duel_runs.status='error'`. None of these have automatic recovery today.
**Recommendation:** add `/api/cron/reconcile-payment-attempts` on hourly cadence. Re-fetch `getTransactionReceipt(x402_tx_hash)` to confirm settlement; flag rows >24 h in non-terminal status for manual ops.

---

## Medium

### M1 — `feeVault` (X19b-rotated) is registry-driven but never runtime-verified
**Cluster cross-ref:** A-2.
**Files:** `contracts/deployments/wallets-base-sepolia.md:23` (registry, sole source of truth post-X19b); zero hard-coded occurrences in `*.ts/*.js/*.sol/*.json`.
**Gap:** correct posture (registry not constant) but no `/v1/health` exposure of the on-chain `feeVault()`. Mainnet flip will rotate again; nothing surfaces a drift between registry and on-chain.
**Recommendation:** expose on `/v1/health` alongside `trustedSigner` and `owner` for both contracts.

### M2 — `AGENT_PRIVATE_KEY` env-var **name** leaks via API error envelope
**Cluster cross-ref:** A-4.
**Files:** `apps/api/src/lib/contracts-vendored/attestation.ts:43` (throw site); `agents-matches.ts:90-98` (propagation via `ApiError(502, 'RESERVE_FAILED', err.message)`).
**Behavior:** value never leaks. Env-var **name** does — Pattern #18 records production briefly returning `502 RESERVE_FAILED { "AGENT_PRIVATE_KEY is not set" }` to anonymous callers (post-PR #94 / X15.6 window). For an audit-firm threat model, the leaked name is reconnaissance signal (existence + precise spelling + soft-failure trigger).
**Recommendation:** at the catch site, swap `err.message` for a static `'Failed to reserve match'`. Log original message server-side. One-line conditional.

### M3 — Rotation runbook for off-chain keys is missing; module-level singletons survive warm-starts
**Cluster cross-ref:** A-6.
**Files:** on-chain primitive at `contracts/script/SetTournamentPoolSigner.s.sol:36-46`; cache singletons at `attestation.ts:21` (`cachedAccount`) and `wallet-client.ts:43-44` (`cachedStudio`, `cachedAgent`).
**Gap:** the singletons cache the parsed `Account` object, not the `process.env` lookup. A rotation that updates Vercel env without redeploy leaves warm Lambdas signing/broadcasting from the old key until the next cold start. ADR 0003 line 171 explicitly defers the AGENT key rotation procedure to "X19b.1" with no current draft.
**Recommendation:** author `docs/runbooks/key-rotation.md` covering both STUDIO and AGENT, with a step for either (a) forced redeploy to flush singletons or (b) refactor the singletons to revalidate. (b) is audit-friendly — rotation shouldn't require a ceremony.

### M4 — Wallet topology drift between `.env.example` files; no canonical manifest
**Cluster cross-ref:** A-5.
**Files:** `apps/api/.env.example:65,93,119` lists STUDIO + AGENT + X402_RECEIVER. Every other app's `.env.local.example` lists STUDIO only. Source consumption matches (only apps/api uses AGENT and X402_RECEIVER), so the diff is correct but undocumented.
**Risk:** Pattern #18 was triggered by exactly this kind of latent topology lag — adding AGENT usage to a new path without rolling the corresponding env var across the right Vercel projects. `turbo.json:13-19` lists STUDIO in `build.env` but omits the other two (today correct; latent if a future build-time read appears).
**Recommendation:** lint a `docs/audit-prep/wallet-env-manifest.md` against tree grep; derive `.env.local.example` files from it.

### M5 — `walletAddress` is server-derived (✅) but no on-chain liveness check on `tournamentId` before signing
**Cluster cross-ref:** B-03.
**Files:** `scores.ts:176` (reads context, not body), `agents.ts:75-76` (same); Zod schemas at `schemas/auth.ts:126-158` and `schemas/agents.ts:9-45` have **no `walletAddress`/`player` field** — verified, can't be overridden.
**Gap:** no validation that `body.tournamentId` corresponds to an extant, unsettled, in-window tournament. Server signs and broadcasts; revert surfaces as 409. Operator pays gas on every revert; attacker grinds nonce pool cheaply.
**Recommendation:** one `publicClient.readContract({ functionName: 'getTournament', args: [id] })` pre-check before signing. Cheap (one RPC) and saves operator gas.

### M6 — `usedNonces` random per-request; client-supplied `soloRunId` not server-deduped → retry double-credits
**Cluster cross-ref:** B-04, B-06, B-10.
**Files:** `scores.ts:199`/`agents.ts:98` (fresh random nonce per request); contract dedupes on `nonce` only (`TournamentPool.sol:477-482`), `soloRunId` is signed-into-digest but not the replay-protection key.
**Effect:** a client retry of the same logical submission generates two distinct nonces; contract accepts both; `soloSubmissionCount` increments twice; `matchCountDelta` applies twice (`TournamentPool.sol:489, 499`). On mainnet this drives effective score → ranking → prize share (`_computeEffectiveScore` at `TournamentPool.sol:773`).
**Recommendation:** accept `Idempotency-Key` header on both `/v1/scores` and `/v1/agents/scores`. Store `(idempotency_key → tx_hash, body_hash)` in Supabase with 24 h TTL. Return prior `txHash` on retry if body matches; 409 if body differs. Alternatively, server-dedupe `soloRunId` via unique index.

### M7 — Two diverging signer-digest copies; v2 vs v2.1 address constant drift latent
**Cluster cross-ref:** B-08.
**Files:** `packages/lib-shared/src/attestation.ts:186-228` (uses `TOURNAMENT_POOL_V2_ADDRESS`); `apps/api/src/lib/contracts-vendored/attestation.ts` (uses v2.1 constant). Today same address per `addresses.ts:36-47` comment.
**Status:** lib-shared copy not currently imported by apps/api submit path; divergence dormant. A careless future PR routing lib-shared into the submit path silently signs against the wrong contract if v2.1 is ever redeployed.
**Recommendation:** delete `buildTournamentSoloSubmitDigest` from `packages/lib-shared/src/attestation.ts` (or canonicalize via `@skillos/contracts`) before mainnet.

### M8 — `dataSuffix` encoding correct; no automated post-broadcast drift detection
**Cluster cross-ref:** B-09.
**Coverage:** unit tests at `apps/api/test/games.test.ts:25-118` pin canonical map and assert the 712+22=734 math invariant (not viem's encoding). `charge-retry-fee.test.ts:148-150` asserts the suffix appears in a mock `writes[1].dataSuffix`. **Missing:** no integration test that calls `walletClient.writeContract` with a real ABI and asserts `tx.input.length === 734`; no post-broadcast spot-check that reads back `tx.input` and asserts the trailing 22 hex chars. The X10 PR #82 chain-verification was a manual one-shot on `0xd371ba4c…`, not re-run in CI.
**Recommendation:** gate behind `DATA_SUFFIX_DRIFT_CHECK=true` env var — when set, the route calls `getTransaction({ hash: txHash })` after broadcast and asserts `tx.input.endsWith(dataSuffix.slice(2))`. Run it in CI smoke; leave off in prod.

### M9 — ERC-8128 nonce store falls back to library default (per-Lambda in-memory singleton)
**Cluster cross-ref:** B-13.
**File:** `apps/api/src/middleware/agent-auth.ts:38-45` does NOT pass `nonceStore` to `siwaMiddleware`. Library default at `@buildersgarden/siwa/dist/erc8128.js:207-225` is an in-process `Map<string, expiry>`.
**Effect:** an attacker who captures an ERC-8128 signed request can replay to a different Lambda instance (concurrent or cold-started). ERC-8128 signatures bind body hash + headers, so the replay is limited to identical bodies — but a paid-retry replay is a double-submit equivalent of M6.
**Recommendation:** inject a Supabase-backed nonce store. Re-use the `apps/api/src/lib/siwa-nonce-store.ts` table with a different namespace prefix (memory `project_phase2_nonce_store_unify`).

### M10 — Receipt secret has 24 h TTL with no revocation list; same for SIWB JWTs
**Cluster cross-ref:** B-14.
**Files:** `apps/api/src/lib/agent-receipt.ts:26` (`TTL_MS = 24 h`); `jwt.ts:20` (same).
**Gap:** stateless HMAC/JWS tokens; on receipt/JWT leak, only mitigations are (a) wait 24 h, (b) rotate the secret — which invalidates ALL agents/users simultaneously. Comment at agent-receipt.ts:7-11 acknowledges rotation as the only revocation lever.
**Recommendation:** `receipts_revoked` table or Redis set keyed by `(agentId, iat)` (or `(sub, jti)` for JWTs). One extra query per write.

### M11 — Settle iteration runs on STUDIO key for trustedSigner + broadcaster + sponsor + anchor; no ETH preflight
**Cluster cross-ref:** C-4.
**Files:** `packages/lib-shared/src/rpc.ts:54-68` (single `getWalletClient` reused everywhere); `packages/duel-backend/src/cron/tournaments.ts:329-331` (sponsor = STUDIO); `tournaments.ts:962-970` (settle broadcaster = STUDIO); `apps/orchestrator/src/app/api/cron/anchor-sp-snapshot/route.ts:111-118` (anchor = STUDIO).
**Gap:** the X15.3 wallet-split documented in memory `project_x15_agent_wallet_split` only separated AGENT from STUDIO. STUDIO still does four jobs. The USDC preflight `preflightSponsorBalance` (`tournaments.ts:273-309`) covers create; no ETH preflight covers any cron. A drained STUDIO ETH balance silently no-ops every cron broadcast until operator tops up.
**Recommendation:** (a) mirror `preflightSponsorBalance` with an ETH balance preflight at the entry of `runSettleTournaments` and `runCreateTournaments` (threshold = `gasEstimate × pendingCount × safetyFactor`); (b) post-mainnet, split a dedicated `SETTLE_BROADCASTER_PRIVATE_KEY` from the attestation signer (audit-prep should at minimum acknowledge this conflation in scope).

### M12 — Cron run-lock is per-minute window; `maxDuration:300` runs can overlap with next-minute tick
**Cluster cross-ref:** C-6.
**Files:** `packages/duel-backend/src/cron/run-lock.ts:50-96` (`currentMinuteWindow` uses `setUTCSeconds(0,0)`); `apps/orchestrator/src/app/api/cron/settle-tournaments/route.ts` (`maxDuration:300`).
**Gap:** acquireCronLock serializes runs in the same minute window; a slow settle run spanning multiple minutes can overlap with the next-minute cron's lock acquisition. Also: between receipt-confirmed and DB-UPDATE (`tournaments.ts:962→998`), a kill leaves on-chain settled but `v2_tournaments.settled_at = NULL`. Next tick's pre-flight `reason: 'already_settled'` recovery (`tournaments.ts:855-864`) auto-recovers `settled_at` but **never backfills `settle_tx_hash`** — DB rows recovered via this path have permanently null tx hash; forensic recovery requires `getLogs` (Blockscout-style as in `project_match3_5_13_audit_backfill_x9_forensic`).
**Recommendation:** extend lock to "running-singleton" semantics (insert `started_at` at entry, delete at exit; acquire-or-skip on `WHERE completed_at IS NULL`). On pre-flight recovery, backfill `settle_tx_hash` via `getLogs` filtered by `topic[1] = onChainId`.

### M13 — `PATCH /v1/agents/profile` writes to in-memory `Map`; auth correct, persistence broken
**Cluster cross-ref:** C-8.
**File:** `apps/api/src/routes/agents.ts:177` (`const profileStore = new Map<…>()`); comment at lines 166-168 acknowledges v0.1.
**Audit framing:** not an access-control bug (`requireSiwaAuth()` correctly registered at line 201). OpenAPI advertises a PATCH that "updates" — clients can't distinguish "write succeeded" from "function cold-started and forgot." Will surface as user-facing data-loss bug reports.
**Recommendation:** ship the X4.5 Supabase migration (`skillos_agent_profiles`) before mainnet, OR explicitly mark as "documented v0.1 known-limitation" in the audit scope cover.

### M14 — x402 amount semantics unverified at API boundary
**Cluster cross-ref:** D-F8, D-F9.
**Files:** `x402.ts:67-73` registers `ExactEvmScheme`; `x402-client.ts:262, 274-286` sets `amount`; server never re-checks `response.amount === AGENT_MATCH_RETRY_ATOMIC`. Receiver isolation: code reads `X402_RECEIVER_ADDRESS` via `getAddress` checksum (`x402-client.ts:75-83`) but does NOT assert distinctness from `STUDIO_ADDRESS`/`AGENT_ADDRESS`/deployer addresses. `wallets-base-sepolia.md` registry omits `X402_RECEIVER_ADDRESS` entirely.
**Recommendation:** (a) add `validateWalletTopology()` boot check that asserts receiver ≠ STUDIO/AGENT/deployer; (b) document receiver in the registry; (c) integration smoke that sends a $1.06 EIP-3009 sig and expects facilitator rejection.

---

## Low

### L1 — Cron secret compared via `===`, not `timingSafeEqual`
**Cluster cross-ref:** C-1.
**Files:** all six cron route guards at `apps/orchestrator/src/app/api/cron/*/route.ts` line 21. Compare to `packages/duel-backend/src/api/admin/{flags,reconcile}.ts` which already use `node:crypto.timingSafeEqual`.
**Risk:** with high-entropy 32-byte secret over WAN, timing channel is practically not exploitable. Flagged for **internal consistency** (auditors will flag inconsistency on first pass).
**Recommendation:** lift comparator into `apps/orchestrator/src/lib/auth.ts`; call from each guard. Single-PR change.

### L2 — Cron auth degrades to "accept all" in non-prod if `CRON_SECRET` is missing
**Cluster cross-ref:** C-7.
**Files:** lines 18-19 in each cron guard.
**Behavior:** correct for documented intent (`!secret && NODE_ENV !== 'production'` → allow). Risk surface: a Preview deployment with `NODE_ENV !== 'production'` writes to the same Base Sepolia contracts as prod. A bare GET to a preview URL's `/api/cron/settle-tournaments` would happily settle.
**Recommendation:** startup-time invariant: if `BASE_SEPOLIA_RPC_URL` points at prod chain, `CRON_SECRET` must be set regardless of `NODE_ENV`. Or: bind preview to a separate dev contract.

### L3 — Bearer rate-limit returns HTTP 400 instead of 429; OpenAPI declares 429
**Cluster cross-ref:** B-11.
**Files:** `scores.ts:178-186` throws `ApiError(400, 'RATE_LIMITED', …)`; `scores.ts:163-166` OpenAPI declares 429. Agent route `agents.ts:78-82` uses 429 correctly. SDK `packages/sdk/src/api.gen.ts` expects 429.
**Recommendation:** allow 429 in the `ApiError` status enum; emit 429 on `/v1/scores`. Spec-match win.

### L4 — `apps/2048/src/app/api/admin/system-health/route.ts:42` hard-codes canonical signer address
**Cluster cross-ref:** A-3.
**Risk:** rotation drift — a future trustedSigner rotation silently misses this constant; the admin health endpoint reports balance for the wrong wallet. Gated behind `ADMIN_API_TOKEN` (lines 90-104), so no public exposure.
**Recommendation:** derive from `STUDIO_PRIVATE_KEY` via `privateKeyToAccount(...).address`, or read `trustedSigner()` on-chain.

### L5 — anchor-sp-snapshot dual-host race acknowledged but unresolved
**Cluster cross-ref:** C-11.
**File:** `apps/orchestrator/src/app/api/cron/anchor-sp-snapshot/route.ts:18-23` (comment).
**Status:** legacy host (apps/2048) and orchestrator can both fire in the same second; second tx reverts cleanly; row left with `anchor_tx_hash NULL` requiring SQL DELETE. Deliberate post-migration pattern.
**Recommendation:** confirm legacy host disabled before audit kickoff. Otherwise add `v2_cron_runs`-style lock.

### L6 — Indexer cron cadence drift; permissionless `TournamentCreated` rows backfilled up to 24 h late
**Cluster cross-ref:** C-12.
**Files:** `index-tournaments-created/route.ts` and `index-sponsor-events/route.ts` — daily cadence (Vercel Hobby plan constraint).
**Memory:** `project_post_yc_tournament_created_indexer` — permissionless `createTournament` orphans `v2_tournaments` row for up to 24 h.
**Recommendation:** Vercel Pro upgrade or external scheduler before mainnet.

### L7 — `x402` receiver address validated for hex shape only on middleware side; no `getAddress()` checksum
**Cluster cross-ref:** D-F12.
**Files:** `x402.ts:39-58` (no checksum); `x402-client.ts:82` (does checksum).
**Effect:** non-checksummed receiver in env serves a non-checksummed `payTo` in 402 challenges. Wire-compatible (EIP-55 case-insensitive) but harder to debug.
**Recommendation:** add `getAddress(raw)` to `x402.ts:57`.

---

## Info (confirmations / no action / acknowledged debt)

### I1 — Keys never appear in git history or deploy artifacts
**Cluster cross-ref:** A-7, A-8.
- `git log --all -S "STUDIO_PRIVATE_KEY"` returns only references by name (sprint retros, ADRs, env.example, README).
- `git log --all -p | grep '^\+.*PRIVATE_KEY\s*=\s*0x[a-fA-F0-9]{30,}'` → zero matches.
- `.env.local` never added to index.
- `apps/api/vercel.json:11` `includeFiles` enumerates `node_modules/*` only — no `.env*`, no `secrets/`.
**Recommendation:** add `gitleaks`/`trufflehog` to CI as belt-and-suspenders before audit kickoff.

### I2 — Off-chain digest mirror is byte-for-byte correct against `_verifySoloSubmitSignature`
**Cluster cross-ref:** B-INDEX, contract verifier at `TournamentPool.sol:733-748`.

### I3 — `BigInt(body.score)` coercion is safe; Zod caps at `Number.MAX_SAFE_INTEGER`
**Cluster cross-ref:** B-07.
**Caveat:** Zod allows arbitrary non-negative integer for `matchCountDelta`; contract caps at `MATCH_COUNT_CAP = 10` (`TournamentPool.sol:75-76`). Server-side bound is a server-side fix.

### I4 — Tier gate is total
**Cluster cross-ref:** B-02 (verified via call graph).
**Three call sites of `signSoloSubmitAttestation`:** `scores.ts:201`, `agents.ts:100`, `runner.ts:305`. The runner has no tier concept so it operates at T0 by construction; the two HTTP routes 400 on `tier !== 'T0'` before reaching the signer. No internal-caller-bypass surface.

### I5 — Match3 chronic outage RCA fix verified shipped
**Cluster cross-ref:** C-5.
**File:** `packages/duel-backend/src/cron/tournaments.ts:273-309` (`preflightSponsorBalance`), called at line 386-393 inside `runCreateTournaments`. Iteration halts on insufficient balance (correct halt-all-on-fail). Deterministic iteration order keeps match3 last; failure pattern is RCA-friendly (single log line). **Sibling gap:** no preflight in `runSettleTournaments` (settle pays gas not USDC) and no ETH preflight anywhere (see M11).

### I6 — Error envelope is well-disciplined; no stack/env/address leakage
**Cluster cross-ref:** C-9.
**File:** `apps/api/src/middleware/errorEnvelope.ts:24-38`. Default branch returns generic `'An unexpected error occurred'` to client; full error to `console.error` only. Only theoretical leak surface is Zod issues echoing malformed input; bearer parsing throws ApiError with fixed string (`middleware/bearer.ts:18-25`).
**Recommendation:** one-line comment in `errorEnvelope.ts` codifying the convention.

### I7 — viem transport-level retry IS configured; memory partially obsolete
**Cluster cross-ref:** C-10, B-12.
**File:** `apps/api/src/lib/contracts-vendored/wallet-client.ts:31-41` — `transport: http(url, { retryCount: 3, retryDelay: 250, timeout: 30_000 })`; `writeRpcUrl()` falls back Alchemy → shared → public RPC.
**Memory correction:** `project_paid_retry_broadcast_post_yc` is partially out of date — Option A (2-line transport config) has shipped. Options B (`submit_tx_hash` schema) and C (poller worker) remain backlog. **Still missing:** no `v2_score_submissions` durable table, no broadcast-failure DLQ, no mempool-stuck handling. If broadcast succeeds at viem level but the Lambda dies before HTTP response returns, the client has no tx hash and the API has no record. Memory should be updated to reflect Option A as DONE and re-prioritize B+C against H9 (orphan reconcile cron).

---

## Memory corrections produced by this audit

| Memory entry | Status | Correction |
|---|---|---|
| `project_settle_tournaments_silent_swallow_phase2` | mis-pathed | Bug is at `packages/duel-backend/src/cron/tournaments.ts:977`, NOT `apps/api/src/routes/tournaments.ts:739`. Same pattern, wrong file. Update the path. |
| `project_paid_retry_broadcast_post_yc` | partially obsolete | Option A (viem transport retry+timeout+fallback) shipped at `wallet-client.ts:31-41`. Update to "Options B+C still pending: durable `v2_score_submissions` table + poller worker + Idempotency-Key." |
| `project_x15_8_payment_attempts_schema_lock` | branch-state gap | `v4_20260515b_x15_payment_attempts_canonical_lock.sql` applied to clizuqvtkekzxiflbsyr on 2026-05-15 but **NOT in this branch's `supabase/migrations/`**. Reconcile before next deploy from this branch lineage. |

---

## Pre-mainnet blocker ordering

Ranked by (severity × tractability). Trivial-to-fix Highs come first.

| # | Finding | Effort | Why now |
|---|---|---|---|
| 1 | C1 — auth on `/v1/agents/matches/start-solo` | Low (lift `requireSiwaAuth`) | Open state-modifying endpoint moving real funds |
| 2 | H4 — selector-decode in settle catch | Low (replicate `decodeRevertErrorName`) | Substring-match anti-pattern still surviving |
| 3 | H1 — boot-time trustedSigner cross-check | Low (one RPC read) | Was a near-miss in v2.1 cutover |
| 4 | H2 — `verifyOnchain: true` on agent-auth | Low (flip a boolean) | 24 h stale-NFT impersonation window |
| 5 | H5 — x402 settle receipt verification | Medium (one waitForReceipt + log assertion) | Trust-on-faith of facilitator response |
| 6 | H7 — `x15_payment_attempts` schema reconciliation | Low (port migration to branch OR rewrite inserts) | Audit ledger is unreliable today |
| 7 | C2 — Upstash-backed rate limiter | Medium (replace Map with Upstash REST) | Cosmetic on serverless; unlocks H1/C1 |
| 8 | H6 — scope x402 middleware to `/v1/data/*` | Low (change `'*'` to scoped paths) | Receiver env-misconfig takes whole API down |
| 9 | H9 — orphan payment-attempt reconcile cron | Medium | Pairs with H7 to close audit ledger |
| 10 | M5/M6 — tournamentId preflight + Idempotency-Key | Medium | Reduces operator gas burn + double-credit |
| 11 | M11 — ETH balance preflight in cron + STUDIO role-split plan | Low (preflight) / Medium (split) | Operator outage class |
| 12 | M8 — `DATA_SUFFIX_DRIFT_CHECK` post-broadcast spot-check | Low | Builder Codes attribution regression detection |
| 13 | H8 — refund/dispute path | High | Mainnet user-facing posture |
| 14 | H3 — T1+ plausibility | Out of scope (Phase 2) | Document in audit cover-letter |

The five items C1, H4, H1, H2, H5, H6, H7 are all sub-day fixes individually. They are the highest-leverage pre-audit hardening list.
