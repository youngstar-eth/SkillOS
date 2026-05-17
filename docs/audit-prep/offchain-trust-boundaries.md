# Off-Chain Trust Boundary Map — apps/api + apps/orchestrator

**Purpose:** for every state-modifying entrypoint, enumerate the auth chain hop-by-hop. Columns: hop, what's verified, what's trusted-on-faith, forgery surface, mitigation file:line.
**Convention:** rows go top-down in execution order. ✅ = no exploit surface at this hop. Hops marked **trust-on-faith** are the audit-firm friction surfaces.
**Companion:** see `offchain-findings.md` for severity-ranked write-ups and `offchain-key-mgmt.md` for the wallet topology referenced below.

---

## 1. `POST /v1/scores` (SIWB / bearer JWT)

Source: `apps/api/src/routes/scores.ts:138-258`. Auth middleware: `apps/api/src/middleware/bearer.ts`.

| # | Hop | Verifies | Trust-on-faith | Forgery surface | Mitigation |
|---|---|---|---|---|---|
| 1 | `Authorization: Bearer <jwt>` header parsing | Header presence + `Bearer\s+(.+)` regex | TLS endpoint untampered | Anyone can present any token (next hop verifies it) | `middleware/bearer.ts:18-33` |
| 2 | JWT signature verify (HS256, `jose`) | Signature against `JWT_SECRET` (≥32 chars per `jwt.ts:24-32`); issuer `iss=skillos.network`; `exp` future; `sub`/`sessionId` present | `JWT_SECRET` not leaked, not reused across envs | Forge requires `JWT_SECRET` exfil | `lib/jwt.ts:23-32, 61-75` |
| 3 | Wallet binding from `sub` claim | `c.set('walletAddress', payload.sub)` | The `sub` claim was server-issued via SIWB (closed loop) | Wallet-from-claim used in attestation; body has no `player`/`walletAddress` field (verified Zod schema) ✅ | `middleware/bearer.ts:48-49`; `routes/scores.ts:176`; schema `schemas/auth.ts:126-158` |
| 4 | Per-wallet rate limit | 60 req/min in-memory LRU keyed `scores:${wallet}` | Single Lambda instance | **Per-instance only — N× bypass** (see findings C2) | `lib/rate-limit.ts:10-49`; `routes/scores.ts:178-186` |
| 5 | Zod body validation | `tournamentId` bytes32 regex; `score` int ≤ MAX_SAFE_INTEGER; `matchCountDelta` int ≥0; `tier` enum; `soloRunId` optional bytes32 | Bytes32 syntactically valid only; no on-chain liveness on `tournamentId` | Server signs+broadcasts against any bytes32; revert burns operator gas (M5) | `schemas/auth.ts:126-158` |
| 6 | Tier gate | `body.tier !== 'T0'` ⇒ 400 `TIER_NOT_IMPLEMENTED` BEFORE signer call | Signer only reached when tier === T0 | None at this layer; T0 has no plausibility (H3) | `routes/scores.ts:189-195` |
| 7 | Random `onChainNonce` | 32 bytes `node:crypto.randomBytes` | Node CSPRNG | Client-supplied `soloRunId` NOT deduped server-side; retry double-credits (M6) | `routes/scores.ts:197-199`; `schemas/auth.ts:138-141` |
| 8 | `signSoloSubmitAttestation({ player: wallet, … })` | EIP-191 sign with `STUDIO_PRIVATE_KEY`; digest binds `(id, player, score, soloRunId, matchCountDelta, nonce, contractAddr, chainId)` | `player = wallet from JWT.sub`, not body ✅; signing key matches on-chain `trustedSigner` (**unverified at boot, see H1**) | None at this layer | `lib/contracts-vendored/attestation.ts:59-108`; `routes/scores.ts:201-208` |
| 9 | `writeContract submitSoloScore(...)` | viem 3× retry, 250 ms backoff, 30 s timeout; Alchemy → shared → public RPC fallback | Premium write RPC reachable | Mempool front-run on `soloRunId`; tx revert ⇒ 409 `CHAIN_REVERT_*`; broadcast failure surfaced to caller (no DLQ — I7) | `lib/contracts-vendored/wallet-client.ts:31-49`; `routes/scores.ts:210-245` |
| 10 | Response | `txHash` returned **before** block inclusion | Caller will not retry with same body | Client retry on transient failure re-broadcasts with fresh random nonce ⇒ double-credit if first eventually mines (M6) | `routes/scores.ts:249-257` |

---

## 2. `POST /v1/agents/scores` (SIWA + ERC-8128)

Source: `apps/api/src/routes/agents.ts:73-161`. Auth: `apps/api/src/middleware/agent-auth.ts:38-45` (`siwaMiddleware`).

| # | Hop | Verifies | Trust-on-faith | Forgery surface | Mitigation |
|---|---|---|---|---|---|
| 1 | `X-SIWA-Receipt`, `Signature`, `Signature-Input`, `Content-Digest` headers | Presence | TLS endpoint | None at this hop | `@buildersgarden/siwa/dist/server-side-wrappers/hono.js:73-78` |
| 2 | HMAC receipt verify | base64url(json).base64url(hmac-sha256) using `SIWA_RECEIPT_SECRET`; constant-time compare; `exp` future | `SIWA_RECEIPT_SECRET` private (≥32 enforced `agent-receipt.ts:30`) | Receipt is bearer-equivalent for 24 h; theft = full impersonation until expiry (M10) | `lib/agent-receipt.ts:26-34, 62-64` |
| 3 | ERC-8128 HTTP signature (RFC 9421) verify | Sig over canonical request bound to `receipt` header; viem `verifyMessage` (EOA + ERC-1271) | In-memory nonce-store (per-Lambda singleton, M9) | Replay to different Lambda instance (cold-start or concurrent) accepted | `@buildersgarden/siwa/dist/erc8128.js:240-281`; default store at lines 207-225 |
| 4 | Signer ≡ receipt address | `verifyResult.address.toLowerCase() === receipt.address.toLowerCase()` | None | None | `@buildersgarden/siwa/dist/erc8128.js:279-281` |
| 5 | **NO on-chain `ownerOf` re-check on writes** | `siwaMiddleware({ verifyOnchain: false })`; ownerOf checked once at receipt issuance | NFT ownership static for receipt TTL | Agent NFT transfer between sign-in and write — prior signer continues acting for ≤24 h (H2) | `middleware/agent-auth.ts:38-45`; library `erc8128.js:283-313` (skipped) |
| 6 | Per-agent rate limit | 60 req/min keyed `agent-scores:${agentAddress}` | Single Lambda | **Per-instance only — N× bypass** (C2) | `routes/agents.ts:78-82` |
| 7 | Zod body validation | `tournamentId` bytes32; `game` enum (6 known); `score`/`matchCountDelta` int ≥0; `tier`; `soloRunId` optional | Body `game` slug is not cross-checked against on-chain `tournament.gameSlug` (M15) | Agent declares `game: 'wordle'` but submits to match3 tournament ⇒ misattributed builder code | `schemas/agents.ts:9-45` |
| 8 | Tier gate | `body.tier !== 'T0'` ⇒ 400 | Same as /v1/scores hop 6 | None | `routes/agents.ts:85-94` |
| 9 | `signSoloSubmitAttestation({ player: agentAddress, … })` | `agentAddress` is **receipt.address**, not body | Same as /v1/scores hop 8 (+ H1) | None at this layer | `routes/agents.ts:75-76, 100-107` |
| 10 | `writeContract submitSoloScore(..., dataSuffix)` | `dataSuffix = dataSuffixForGame(body.game)` — server-side BUILDER_CODES lookup; viem appends after canonical calldata | `BUILDER_CODES` map is canonical (unit-test pinned, M8) | No automated post-broadcast `tx.input` drift detection | `lib/games.ts:43-81`; `routes/agents.ts:109-132` |
| 11 | Response | `txHash` + `agentId` + `agentAddress` | Same as /v1/scores hop 10 | Same | `routes/agents.ts:148-160` |

---

## 3. `POST /v1/agents/matches/start-solo` (PUBLIC — no auth)

Source: `apps/api/src/routes/agents-matches.ts:42-149`. Module top comment lines 2-7: "Public (no auth) for the testnet demo era; X21 adds SIWA + matchmaker queue routes."

| # | Hop | Verifies | Trust-on-faith | Forgery surface | Mitigation |
|---|---|---|---|---|---|
| 1 | Entry | **NONE — no security middleware** | TLS endpoint | Any caller can drive every downstream action | none — see C1 |
| 2 | IP-derived rate limit | `agent-matches-start-solo:${ip}` where `ip = x-forwarded-for[0] ?? x-real-ip ?? 'local'` | `x-forwarded-for` first hop accurate; Vercel overrides at edge | Spoofable header at non-Vercel hops; `'local'` literal fallback when both absent → all anon callers share one bucket | `routes/agents-matches.ts:73-76` |
| 3 | Reserve `duel_runs` row | Zod body (`tournamentId`, `game`) | DB available | DB row insert per request | `lib/duel/runner.ts` (reserveSoloRun) |
| 4 | `x15_payment_attempts` insert (pending) | Same | DB available | Schema-drift bug (H7) — insert may fail or land in wrong columns | `routes/agents-matches.ts:202-220` |
| 5 | `waitUntil(orchestrateAgentRun(...))` | Returns 202 to caller | Background worker has up to maxDuration to complete | Worker timeout orphans the row at `pending`/`x402_settled` (H9) | `routes/agents-matches.ts:108-118` |
| 6 | x402 settle | `signer.address === agentAddress` (`x402-client.ts:251-256`); `response.success === true`; `transaction` starts with `0x` | Facilitator response **not** cross-checked against on-chain receipt (H5); `response.amount` not asserted (M14) | Compromised/lying facilitator returns fake `transaction` hash → `x402_settled` recorded without actual settlement | `lib/x402-client.ts:298-322` |
| 7 | `chargeRetryFee` on-chain | viem `writeContract` with `AGENT_PRIVATE_KEY`; idempotent maxUint256 approve bounded to TournamentPool only | viem receipt wait | Race window: approve receipt visible on public RPC, allowance still 0 on Alchemy (memory `project_x15_chargeretryfee_first_paid_retry_race`); `needs_manual_review` row; **no refund** (H8) | `lib/duel/charge-retry-fee.ts:117-142`; `routes/agents-matches.ts:266-294` |
| 8 | Anthropic-billed game loop | none (server-controlled) | Anthropic API quota | Each unauthenticated call drains LLM budget | `lib/duel/runner.ts` (runSoloMatch) |
| 9 | Final `submitSoloScore` broadcast | Same as `/v1/scores`/`/v1/agents/scores` hop 9 | Same | Errors swallowed in runner — `duel_runs.on_chain_tx_hash` left NULL without surfacing failure to caller | `lib/duel/runner.ts:293-349` (`maybeSubmitOnChain`) |

---

## 4. `GET /v1/data/match-replay/{id}` and `GET /v1/data/cohort-snapshot` (x402 paywall)

Source: `apps/api/src/routes/data.ts:82-116, 167-171`. Middleware: `apps/api/src/lib/x402.ts:128-133` mounted globally at `app.ts:59` (`app.use('*', getX402Middleware())`).

| # | Hop | Verifies | Trust-on-faith | Forgery surface | Mitigation |
|---|---|---|---|---|---|
| 1 | Hono pipeline reaches x402 middleware | none | `getX402Middleware()` lazy build succeeds | First-request build that throws on missing env returns 500 for every route (H6) | `app.ts:59` |
| 2 | x402 middleware path-scope | `requiresPayment(path)` consults registered scheme map | Lazy-built map | None | `lib/x402.ts:67-122` |
| 3 | `PAYMENT-SIGNATURE` header verify (per `@x402/hono`) | Facilitator-side verify of EIP-3009 signature against `payTo=X402_RECEIVER`, asset=USDC on `eip155:84532`, amount=$0.01/$0.10 | Facilitator URL is `X402_FACILITATOR_URL` or `x402.org/facilitator` default | No TLS pinning on facilitator; default URL is public unauthenticated third-party | `lib/x402.ts:21, 62-63` |
| 4 | Payment captured | None on API side beyond shape check | x402 facilitator settled the EIP-3009 transfer | Same as H5 — facilitator response trust | `@x402/hono` internals |
| 5 | Handler execution | Returns stub data (`data.ts:82-116, 147-171`); no DB write | Stub semantics unchanged in Phase 1 | When stub graduates to real backing data, per-payer rate-limit will be needed (D-F10) | `routes/data.ts:82-171` |
| 6 | Caller identity | NONE — payment from address X does not prove API caller controls X (could pay via a contract / multisig / 4337 wallet) (D-F14) | none | "which agents have bought this replay?" is unanswerable from on-chain `from` alone | None today |

---

## 5. `POST /v1/auth/siwb/{nonce,verify}` and `POST /v1/auth/siwa/{nonce,verify}` (unauthenticated by design)

Sources: `apps/api/src/routes/auth.ts`, `apps/api/src/routes/auth-siwa.ts`.

| # | Hop | Verifies | Trust-on-faith | Forgery surface | Mitigation |
|---|---|---|---|---|---|
| **siwb/nonce** | Entry | Zod body | none | Spam DB row writes (no rate-limit on nonce issuance) | `routes/auth.ts:42-53` |
|  | `siwb_nonces` INSERT or REPLACE | DB unique constraint | DB available | Attacker spins nonce ring at line rate (low cost but unbounded) | (no limiter) |
| **siwb/verify** | Entry | Zod body | none | ECDSA verify CPU spam (no rate-limit) | `routes/auth.ts:85-152` |
|  | Nonce consume | atomic UPDATE...RETURNING (`auth-store.ts:74-92`) | DB available; nonce single-use | ✅ atomic | `auth-store.ts:74-92` |
|  | EIP-191 / EIP-1271 signature verify | viem `verifyMessage` against the nonce + wallet | Wallet client RPC | Signature must match nonce — replay limited to nonce TTL | ✅ |
|  | JWT issuance | HS256 with `JWT_SECRET` (≥32 chars) | Secret private | None at issuance | `lib/jwt.ts:23-75` |
| **siwa/nonce** | same shape as siwb/nonce | DB | DB | same | `routes/auth-siwa.ts:63-92` |
| **siwa/verify** | Entry | Zod body | none | ECDSA verify + onchain `ownerOf()` + outbound fetch to `api.base.dev/v1/agents/builder-codes` — unbounded outbound API spend per spam request | `routes/auth-siwa.ts:124-172` |
|  | Nonce consume | atomic UPDATE...RETURNING | DB available | ✅ atomic | `lib/siwa-nonce-store.ts` |
|  | SIWA signature + onchain ownerOf | viem verify + `registry.ownerOf(agentId)` against `SIWA_EXPECTED_REGISTRY_CAIP10` | Registry contract is canonical | Forgery requires owning the NFT at sign-in moment | ✅ at issuance — see H2 for the post-issuance gap |
|  | Receipt issued | HMAC bound for 24 h | `SIWA_RECEIPT_SECRET` private | M10 — no revocation | `lib/agent-receipt.ts:41-67` |

---

## 6. Cron entrypoints (apps/orchestrator)

All six routes use the same `isAuthorized()` shape:

```ts
return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
// fallback when secret unset: NODE_ENV !== "production"
```

| Route | File:line guard | Method | Schedule (UTC) | maxDuration | State touched |
|---|---|---|---|---|---|
| `/api/cron/create-tournaments` | `create-tournaments/route.ts:14-22, :25` | GET | `0 0 * * *` | 120 s | USDC approve + balance preflight; createTournament×6 daily (+6 Mon); `v2_tournaments` UPSERT |
| `/api/cron/settle-tournaments` | `settle-tournaments/route.ts:16-22, :25` | GET | `5 0 * * *` | 300 s | Multicall pre-flight (`settle-guard`); flagScore per implausible; settle × pending; `v2_tournaments` UPDATE; `v2_tournament_entries` UPSERT |
| `/api/cron/index-sponsor-events` | `index-sponsor-events/route.ts:20-27, :30` | GET | `15 0 * * *` | 60 s | `v2_sponsor_events` writes (indexer) |
| `/api/cron/index-tournaments-created` | `index-tournaments-created/route.ts:20-27, :30` | GET | `23 0 * * *` | 60 s | `v2_tournaments` UPDATE (backfills `creation_tx_hash`, `creator_address`) |
| `/api/cron/reconcile-duels` | `reconcile-duels/route.ts:24-30, :33` | GET | `13 1 * * *` | 300 s | Stuck `v2_duels` row sweep; may broadcast settle() per stuck duel |
| `/api/cron/anchor-sp-snapshot` | `anchor-sp-snapshot/route.ts:50-56, :59` | GET | `7 2 * * *` | 60 s | `v2_sp_snapshots` INSERT; `SkillbaseAnchor.anchorSnapshot` tx; UPDATE confirmed tx hash |

**Trust hop common to all six:**

| # | Hop | Verifies | Trust-on-faith | Forgery surface | Mitigation |
|---|---|---|---|---|---|
| 1 | `Authorization: Bearer ${CRON_SECRET}` | `===` string compare (NOT timingSafeEqual — L1) | Secret high-entropy + private | Timing channel impractical; **non-prod with missing secret accepts all** (L2) | guard line in each route |
| 2 | Run-lock acquire (settle/create only) | Unique-key INSERT into `v2_cron_runs(cron_name, minute_window)` | DB available; lock granularity = 1 min | Slow runs (`maxDuration=300`) overlap next-minute tick (M12) | `lib/run-lock.ts:50-96` |
| 3 | (settle) Multicall pre-flight | `settle-guard.readSettleGuardBatch` structured decode | Multicall3 returns intended state | Pre-flight `'OK to settle'` but broadcast reverts at line 977 ⇒ substring-match silent-swallow (H4) | `cron/settle-guard.ts`; `cron/tournaments.ts:777-780` |
| 4 | Broadcast | viem `writeContract` with STUDIO key; viem retry as per I7 | STUDIO has ETH balance | **No ETH preflight anywhere** (M11) | `cron/tournaments.ts:962-970` |
| 5 | DB UPDATE post-receipt | UPDATE `v2_tournaments SET settled_at, settle_tx_hash` | Function process survives between receipt + UPDATE | Kill in window leaves on-chain settled / DB `settled_at` NULL; auto-recovery via next-tick pre-flight but `settle_tx_hash` permanently NULL (M12) | `cron/tournaments.ts:998-1004` |

---

## 7. Other write-path endpoints

### `PATCH /v1/agents/profile`

| # | Hop | Verifies | Trust-on-faith | Forgery surface | Mitigation |
|---|---|---|---|---|---|
| 1-5 | Same hops 1-5 as `/v1/agents/scores` (SIWA + ERC-8128) | ✅ | ✅ | Same | `routes/agents.ts:201` |
| 6 | Profile UPSERT | Zod body | Module-level `Map<number, AgentProfile>` (`agents.ts:177`) | **Cold-start wipes all stored profiles** (M13) | comment at lines 166-168 acknowledges v0.1 |

### `POST /v1/sponsors/...` (no write routes in current scope)

`apps/api/src/routes/sponsors.ts` exposes only `GET /v1/sponsors/{wallet}/receipts` (read). No write surface in this audit pass.

### Tournament write paths in apps/api

`apps/api/src/routes/tournaments.ts` exposes only GET routes (list / get / leaderboard). No write surface. **The settle bug (H4) lives in `packages/duel-backend/src/cron/tournaments.ts:977`, not in apps/api.**

---

## 8. Trust boundary aggregate observations

**Where forgery is structurally impossible (✅):**
- `walletAddress`/`agentAddress` in attestation digest is server-derived from auth context (M5).
- EIP-3009 `(from, nonce)` replay protected at USDC contract.
- SIWB/SIWA nonces atomically consumed via `UPDATE...RETURNING`.
- viem `writeContract` simulates first → most reverts caught pre-broadcast.
- Error envelope is well-disciplined (I6).

**Where the audit firm will push back hardest:**
- Cosmetic rate-limit on every state-modifying route (C2).
- Public state-modifying `/v1/agents/matches/start-solo` (C1).
- Facilitator response trusted without on-chain receipt verify (H5).
- 24 h NFT-transfer impersonation window (H2).
- No boot-time `trustedSigner ≡ derived_address` assertion (H1).
- Substring-match revert classification surviving in settle (H4).
- Schema-vs-code drift on the payment-attempts ledger (H7).

**Where the threat model exists but is acknowledged:**
- T0 has no plausibility (H3, Phase 2 hard-blocker).
- `PATCH /v1/agents/profile` writes to in-memory Map (M13, v0.1 known-limitation).
- Refund path is operator-manual (H8, X16 to automate).
