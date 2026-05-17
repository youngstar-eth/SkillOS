# Cluster B — Score Submission & Attestation Audit (Pre-Mainnet)

**Scope.** Two HTTP endpoints that produce signed `submitSoloScore` attestations
and broadcast them to `TournamentPool` v2.1 on Base Sepolia:

- `POST /v1/scores` — SIWB-authenticated (bearer JWT). Source:
  `apps/api/src/routes/scores.ts:174-258`.
- `POST /v1/agents/scores` — SIWA-authenticated (HMAC receipt + ERC-8128
  per-request signature). Source: `apps/api/src/routes/agents.ts:73-161`.

A third call site `apps/api/src/lib/duel/runner.ts:293-349`
(`maybeSubmitOnChain`) calls `signSoloSubmitAttestation` from the X20
spectator-demo background worker. It is gated only by the env var
`X20_DEMO_TOURNAMENT_ID`, not by any per-request auth.

The contract receiver is `_verifySoloSubmitSignature` in
`contracts/src/TournamentPool.sol:733-748`. The off-chain digest mirror
lives in `apps/api/src/lib/contracts-vendored/attestation.ts:59-91` (with
`packages/lib-shared/src/attestation.ts:186-218` as a duplicate that is no
longer wired into the apps/api request path; v2 vs v2.1 address drift noted
in Finding B-08).

The signing key is `STUDIO_PRIVATE_KEY`, which must equal the contract's
`trustedSigner` (per `contracts/src/TournamentPool.sol:730,747`). A second
key `AGENT_PRIVATE_KEY` exists per X15.3 wallet split but is used only for
`chargeRetryFee`/USDC.approve, never for `submitSoloScore` (the studio
remains the broadcaster on D11). See `wallet-client.ts:46-58`.

---

## Trust Boundary Per-Endpoint

### `POST /v1/scores` (SIWB / bearer JWT)

| # | Hop | Verifies | Trusts (faith) | Forgery surface | Mitigation file:line |
|---|---|---|---|---|---|
| 1 | Client → `Authorization: Bearer` header | Header presence + regex `Bearer\s+(.+)` | TLS endpoint, Vercel headers untampered | Anyone can present any token | `apps/api/src/middleware/bearer.ts:18-33` |
| 2 | JWT verify (HS256, `jose`) | Signature against `JWT_SECRET` (env, ≥32 chars), issuer claim `iss=skillos.network`, `exp` not in past, `sub`/`sessionId` present | `JWT_SECRET` is private + not reused across envs | Forge requires `JWT_SECRET` leak; replay until `exp` (24 h TTL) | `apps/api/src/lib/jwt.ts:23-32, 61-75` |
| 3 | Wallet bound to JWT `sub` | `c.set('walletAddress', payload.sub)` after structural check | The `sub` claim was issued by the same server (closed loop) | Wallet from claim used in attestation **never re-checked** against request body | `apps/api/src/middleware/bearer.ts:48-49`; `apps/api/src/routes/scores.ts:176` |
| 4 | Per-wallet rate limit | 60/min in-memory LRU | LRU is per Lambda instance (Vercel) | Bypass by waiting for cold start or by routing to a different instance via concurrency | `apps/api/src/lib/rate-limit.ts:10-49`; `apps/api/src/routes/scores.ts:178-186` |
| 5 | Zod body validation | `tournamentId` (bytes32 regex), `score` int ≥0 ≤ `Number.MAX_SAFE_INTEGER`, `matchCountDelta` int ≥0, `tier` enum, `soloRunId` optional bytes32 | The bytes32 strings are syntactically valid; no on-chain liveness check on `tournamentId` | Invalid/expired/non-existent tournamentId reaches signer → revert at chain (best-case) | `apps/api/src/schemas/auth.ts:126-158`; `apps/api/src/routes/scores.ts:188` |
| 6 | T0-gate | `body.tier !== 'T0'` ⇒ 400 `TIER_NOT_IMPLEMENTED` BEFORE signer touches the message | The signer is reached only when `body.tier === 'T0'` (default) | None at this layer; see Finding B-02 for "T0 still no plausibility" | `apps/api/src/routes/scores.ts:189-195` |
| 7 | Random `onChainNonce`, `soloRunId` | 32 fresh random bytes via `node:crypto.randomBytes` | Node CSPRNG; `soloRunId` may also be **caller-supplied** (no uniqueness check across runs) | Client-supplied `soloRunId` collision allowed if the contract's `usedNonces[nonce]` not yet set | `apps/api/src/routes/scores.ts:197-199`; `apps/api/src/schemas/auth.ts:138-141` |
| 8 | `signSoloSubmitAttestation({ player: wallet, … })` | EIP-191 `personal_sign` of `keccak256(abi.encode(id, player, score, soloRunId, matchCountDelta, nonce, contractAddr, chainId))` with `STUDIO_PRIVATE_KEY` | The `player` field is the JWT `sub` (Hop 3) — body has no `player` field at all on /v1/scores | None; this is the only place wallet is bound to attestation | `apps/api/src/lib/contracts-vendored/attestation.ts:59-108`; `apps/api/src/routes/scores.ts:201-208` |
| 9 | `writeContract submitSoloScore(...)` | viem retries 3× / 250 ms / 30 s timeout | Premium write RPC (Alchemy via `BASE_SEPOLIA_WRITE_RPC_URL`) is reachable | Mempool front-run window for chosen `soloRunId`; tx revert ⇒ 409 `CHAIN_REVERT_*`; broadcast failure surfaces to client (no retry, no DLQ — see Finding B-12) | `apps/api/src/lib/contracts-vendored/wallet-client.ts:31-49`; `apps/api/src/routes/scores.ts:210-245` |
| 10 | Response | `txHash` returned **before** block inclusion (fire-and-forget) | Caller will not retry with the same body | Caller retry on transient failure re-broadcasts with fresh random nonce ⇒ double-credit if first eventually mines | `apps/api/src/routes/scores.ts:249-257` |

### `POST /v1/agents/scores` (SIWA / ERC-8128)

| # | Hop | Verifies | Trusts (faith) | Forgery surface | Mitigation file:line |
|---|---|---|---|---|---|
| 1 | Client → `X-SIWA-Receipt`, `Signature`, `Signature-Input`, `Content-Digest` | Headers present (else 401) | TLS endpoint | None | `node_modules/@buildersgarden/siwa/dist/server-side-wrappers/hono.js:73-78` |
| 2 | HMAC receipt verify | base64url(json).base64url(hmac-sha256) using `SIWA_RECEIPT_SECRET`; constant-time compare; `exp` check | `SIWA_RECEIPT_SECRET` private (≥32 chars enforced in `agent-receipt.ts:30`) | Receipt is bearer-equivalent for 24 h; theft = full impersonation until expiry | `apps/api/src/lib/agent-receipt.ts:26-34, 62-64`; `node_modules/@buildersgarden/siwa/dist/receipt.js:61-79` |
| 3 | ERC-8128 HTTP signature | RFC 9421 verify against `receipt.address`; `additionalRequestBoundComponents: [RECEIPT_HEADER]` | viem `verifyMessage` (EOA + ERC-1271 via the passed `publicClient`) | Replay protection backed by in-memory `nonceStore` — singleton **per Lambda instance**, evaporates on cold start | `node_modules/@buildersgarden/siwa/dist/erc8128.js:240-281`; `node_modules/@buildersgarden/siwa/dist/erc8128.js:207-225` (default in-memory store) |
| 4 | Signer-vs-receipt address match | `verifyResult.address.toLowerCase() === receipt.address.toLowerCase()` | None | None | `node_modules/@buildersgarden/siwa/dist/erc8128.js:279-281` |
| 5 | **No on-chain `ownerOf` re-check on each request** | `siwaMiddleware({ verifyOnchain: false, … })` — onchain ownership was checked **once at receipt issuance** (`/v1/auth/siwa/verify`), not again on writes | NFT ownership is static for the receipt TTL (24 h) | Agent NFT transfer between sign-in and write ⇒ stale signer continues acting for 24 h | `apps/api/src/middleware/agent-auth.ts:38-45`; `node_modules/@buildersgarden/siwa/dist/erc8128.js:283-313` (skipped) |
| 6 | Per-agent rate limit | 60/min per agent address | LRU per Lambda instance | Same as SIWB Hop 4 | `apps/api/src/routes/agents.ts:78-82` |
| 7 | Zod body validation | `tournamentId` (bytes32), `game` enum (6 known), `score` int ≥0, `matchCountDelta` int ≥0, `tier` enum, `soloRunId` optional bytes32 | No on-chain check that `game ↔ tournamentId` (`agents.ts` comment on `schemas/agents.ts:13-17` explicitly disclaims this) | An agent can declare `game: '2048'` and submit to a `match3` tournament ⇒ attribution lands at the wrong builder code | `apps/api/src/schemas/agents.ts:9-45`; `apps/api/src/routes/agents.ts:84` |
| 8 | T0-gate | `body.tier !== 'T0'` ⇒ 400 BEFORE signer | None | Same as SIWB Hop 6 | `apps/api/src/routes/agents.ts:85-94` |
| 9 | `signSoloSubmitAttestation({ player: agentAddress, … })` | `agentAddress` is the **agent.address** from the receipt; **not** a body field | Receipt-derived → trustworthy modulo Hop 5 | None at this layer | `apps/api/src/routes/agents.ts:75-76, 100-107` |
| 10 | `writeContract submitSoloScore(..., dataSuffix)` | `dataSuffix = dataSuffixForGame(body.game)` (server-side lookup of per-game `BUILDER_CODES`); appended by viem after canonical calldata | `BUILDER_CODES` is the canonical map | Mempool front-run; tx revert ⇒ 409; broadcast failure same as SIWB Hop 9 (no retry/DLQ) | `apps/api/src/lib/games.ts:43-81`; `apps/api/src/routes/agents.ts:109-132` |
| 11 | Response | `txHash` + `agentId` + `agentAddress` | Same as SIWB Hop 10 | Same | `apps/api/src/routes/agents.ts:148-160` |

### `lib/duel/runner.ts maybeSubmitOnChain` (X20 spectator background worker)

| # | Hop | Verifies | Trusts (faith) | Forgery surface | Mitigation file:line |
|---|---|---|---|---|---|
| 1 | Entry (`POST /v1/agents/matches/start-solo`) | **Public route, no auth** — `agentRoutes.use('/v1/agents/scores', requireSiwaAuth())` does NOT cover `agentMatchesRoutes` | "Soft cap" per-IP rate limit | Any caller can spawn a duel_run that ends in an attribution-bearing on-chain submit | `apps/api/src/routes/agents-matches.ts:71-149` |
| 2 | `agentAddress = getAgentAccount().address` | Server-controlled key | None | Single shared agent identity used for every public submit ⇒ no per-caller separation | `apps/api/src/lib/duel/runner.ts:85, 122`; `apps/api/src/lib/contracts-vendored/attestation.ts:40-47` |
| 3 | Env gate `X20_DEMO_TOURNAMENT_ID` | Presence + `0x` prefix | Operator sets a valid tournament | If env points to a wrong/closed tournament the runner silently catches and swallows revert (`runner.ts:337-348`) | `apps/api/src/lib/duel/runner.ts:294-298` |
| 4 | `signSoloSubmitAttestation` + `writeContract` | Same as the other paths | Same | Errors are caught and swallowed; the duel_runs row keeps `on_chain_tx_hash` null without surfacing failure to the caller | `apps/api/src/lib/duel/runner.ts:304-348` |

---

## Numbered Findings

### B-01 — `/v1/agents/scores` does NOT re-check on-chain `ownerOf` (stale-NFT impersonation up to 24 h) — **High**

`apps/api/src/middleware/agent-auth.ts:38-45` constructs `siwaMiddleware({
verifyOnchain: false, … })`. The SIWA library's `verifyAuthenticatedRequest`
(`node_modules/@buildersgarden/siwa/dist/erc8128.js:283-313`) only calls
`registry.ownerOf(agentId)` when `verifyOnchain === true`. On-chain
ownership IS checked once at receipt issuance (`apps/api/src/lib/siwa.ts:92-113`,
`SIWA_EXPECTED_REGISTRY_CAIP10` path) and the receipt is then HMAC-bound for a
24 h TTL (`agent-receipt.ts:26`). If the ERC-8004 agent-identity NFT changes
ownership during that window — sale, key rotation, slashing — the previous
signer can keep producing valid ERC-8128 signatures against the receipt
secret and continue to drive `submitSoloScore` attributions for up to 24 h.

**Severity:** High. The audit framing claims "ownerOf cross-check exists, and
is fresh (not cached)"; this is materially false for write endpoints.

**Recommendation:** Flip `verifyOnchain: true` in `agent-auth.ts:41`. The
`publicClient` is already injected; the library handles the read. If RPC
latency on every write is unacceptable, gate the recheck to writes where
`(now - receipt.iat) > N minutes` or implement a server-side `ownerOf` cache
keyed by `(registry, agentId)` with a short TTL.

### B-02 — T0 means "no plausibility, no anti-cheat, server signs whatever the client claims" — **High** (pre-mainnet blocker, ack'd in code)

In both endpoints, after the `tier !== 'T0'` gate (`scores.ts:189-195`,
`agents.ts:85-94`) the server immediately signs the digest with the
client-supplied `score: BigInt(body.score)` and broadcasts. There is no AI
plausibility check, no historical max/median comparison, no
seed-determinism check, no game-specific bound. The route description
acknowledges this and the project memory `project_phase2_mainnet_blocker_plausibility`
lists it as the explicit Phase-2 hard-blocker.

The 501-renamed-to-400 `TIER_NOT_IMPLEMENTED` guard runs before any signer
call site I could find (verified via the `signSoloSubmitAttestation` call
graph: only three callers — `scores.ts:201`, `agents.ts:100`, `runner.ts:305`,
and the runner has no tier concept so it implicitly operates at T0 too).

**Severity:** High for mainnet readiness; framed as Medium-Info for testnet
since the project knows. Listing here for completeness because the audit
question explicitly asks whether the gate is total.

**Sub-finding B-02a — `lib/duel/runner.ts:293-348` is not behind any tier
gate at all.** The X20 spectator worker doesn't read body.tier and never
checks plausibility. Submissions land at T0 by construction. Anyone able to
hit `POST /v1/agents/matches/start-solo` (which is public — see B-05) drives
a tier-0 submission.

**Recommendation:** Keep T1+ at 501 until plausibility lands; document this
in the audit-scope cover letter as **not in scope for testnet** and **must
fix before mainnet**.

### B-03 — `walletAddress` in attestation is server-derived for SIWB, but body-validation has zero on-chain liveness check on `tournamentId` — **Medium**

The high-severity bug the audit prompt asked about specifically — "is the
`walletAddress` in the signed attestation derived server-side from auth, or
does it come from request body unchecked?" — is **handled correctly**:

- SIWB: `scores.ts:176` reads `const wallet = c.get('walletAddress')` from
  the bearer middleware context. The Zod schema in
  `apps/api/src/schemas/auth.ts:126-158` has **no `walletAddress` or
  `player` field at all**. The signer at `scores.ts:201-208` uses the
  context-derived `wallet`. ✅ Cannot be overridden by body.
- SIWA: `agents.ts:75-76` reads `c.get('agent')` and uses
  `agent.address as Address`. The Zod schema at
  `apps/api/src/schemas/agents.ts:9-45` has no `agentAddress`/`player`
  field. ✅ Cannot be overridden by body.

**But** there is no validation that `body.tournamentId`:
1. Corresponds to an existing tournament (`t.sponsor != address(0)`),
2. Is not yet settled (`!t.settled`),
3. Is currently within `[startsAt, endsAt)`,
4. Has not had this `(player, soloRunId)` already accepted.

The server happily signs a digest pointing at any bytes32, broadcasts the
tx, and surfaces the contract revert as `CHAIN_REVERT_*` (409). That
behavior is acceptable correctness-wise (the contract is authoritative),
but it (a) wastes the `STUDIO_PRIVATE_KEY` broadcaster's gas on every
revert, (b) gives an attacker a cheap way to grind the nonce pool, and (c)
the **`usedNonces[nonce]` becomes permanently burned for any revert path
that runs after the nonce-check** — see B-04 for the read of the contract.

**Recommendation:** Pre-flight check `_tournaments[body.tournamentId].endsAt
> now`, `.settled === false`, `.sponsor != 0x0` via a single
`publicClient.readContract` call before signing. Cheap (one RPC call) and
saves operator gas. Out of scope for an audit-prep doc but worth flagging.

### B-04 — `usedNonces` is incremented by contract BEFORE many revert conditions; signer-side random nonces never collide intentionally, but mempool collisions on caller-supplied `soloRunId` aren't blocked — **Medium**

`contracts/src/TournamentPool.sol:477-482`:

```solidity
if (usedNonces[nonce]) revert NonceUsed();
if (player == address(0)) revert ZeroAddress();
_verifySoloSubmitSignature(...);
usedNonces[nonce] = true;  // ← here
```

The order is: nonce-already-used check → signature verify → mark nonce
used. A failed signature does **not** burn the nonce. A subsequent revert
from `InsufficientFeePaid` (line 487) DOES happen after `usedNonces[nonce] =
true`, but with the server-generated random nonce that's mostly fine — the
nonce was never going to be retried because no caller knows the value.

The real issue is **`soloRunId`**: clients can supply their own
(`schemas/auth.ts:138-141`, `schemas/agents.ts:27-29`). It is signed-in
but **not used for replay protection** in the contract — only the `nonce`
field is consulted via `usedNonces`. The contract digest hashes both, but
the contract's replay rejection is solely the global `usedNonces` map. So
client-supplied `soloRunId` is purely an audit-trail field with no
server-side dedupe. If the server uses the same `soloRunId` twice
intentionally or due to client retry, the chain submission succeeds twice
(the random nonce per request is fresh, so `usedNonces` doesn't reject).

**Severity:** Medium. The audit prompt mentions this explicitly under
Idempotency.

**Recommendation:** Either store seen `soloRunId` server-side (Supabase
unique index), or accept that `soloRunId` is purely an audit field and
document that fact in the OpenAPI description (currently described only as
"if omitted, server generates random").

### B-05 — `POST /v1/agents/matches/start-solo` is unauthenticated, fires `signSoloSubmitAttestation` from a background worker — **High**

`apps/api/src/routes/agents-matches.ts:71-149`. The route is registered on
`agentMatchesRoutes` and is **not** behind `requireSiwaAuth()`. Sister
route `agentRoutes.use('/v1/agents/scores', requireSiwaAuth())` only covers
the `agents.ts` writes, not `agents-matches.ts`. The only friction on
`start-solo` is `rateLimit(`agent-matches-start-solo:${ip}`)` —
per-IP, in-memory LRU.

The handler reserves a `duel_runs` row, returns 202 with a `runId`, and
fires `waitUntil(orchestrateAgentRun(...))` which:

1. Reads `priorSolo` from chain
2. Inserts a `x15_payment_attempts` row
3. Settles x402 (USDC pull from the caller)
4. Broadcasts `chargeRetryFee` (gas paid by `AGENT_PRIVATE_KEY`)
5. Runs the 2048 game loop (Claude Anthropic calls — billed to the studio)
6. Calls `maybeSubmitOnChain` → `signSoloSubmitAttestation` → broadcasts
   `submitSoloScore` with the studio key + a Builder-Code dataSuffix

Steps 4-6 are billed to the studio and result in an on-chain on-server-key
broadcast. The only "auth" is that x402 settlement (Step 3) requires the
caller to actually pay 1 USDC. That's a real cost barrier on testnet (free
USDC) and arguably acceptable on mainnet — but it is **not** a SIWA
receipt + ERC-8128 sig. An anonymous caller can drive any number of
attribution-tagged submits from the agent wallet provided they hold USDC.

**Severity:** High. Memory `project_x15_chargeretryfee_first_paid_retry_race`
already flagged a race on the same code path; this finding adds the
auth-surface concern.

**Recommendation:** Either gate `start-solo` behind `requireSiwaAuth()`
(the agent address would then be the SIWA-verified one, not the server's
hardcoded `AGENT_PRIVATE_KEY`), or document this as an X20 demo-only
unauthenticated path and remove the route in X21. Memory note
`project_x15_7_e2e_verified` indicates the route is in production today.

### B-06 — Idempotency: no request-id/Idempotency-Key on either endpoint; client retries during in-flight tx broadcast **can double-submit** — **Medium**

Neither `/v1/scores` nor `/v1/agents/scores` accepts an `Idempotency-Key`
header. The fire-and-forget pattern at `scores.ts:213-226` /
`agents.ts:118-132` returns `txHash` before block inclusion. The defense
against double-submit is solely the contract's `usedNonces[nonce]` map —
but the random nonce is **server-generated per request**. Two retries of
the same logical submission generate two distinct nonces, so the contract
accepts both. The two will produce two `SoloScoreSubmitted` events with
the same `(id, player, score)` (different `nonce`/`soloRunId`), incrementing
`soloSubmissionCount` twice and applying `matchCountDelta` twice
(`TournamentPool.sol:489, 499`).

The audit prompt's specific scenario — same wallet sends two scores in
quick succession — has no mempool collision (nonces are unique) but yields
double-credit at the contract layer.

**Severity:** Medium for testnet (operationally annoying); arguably High
for mainnet where match-count drives effective score
(`_computeEffectiveScore` at `TournamentPool.sol:773`) → ranking →
prize-share.

**Recommendation:** Accept `Idempotency-Key` header on both POSTs. Store
the issued `(idempotency_key → tx_hash, body_hash)` mapping in Supabase
with TTL (24 h is enough). Return the prior `txHash` on retry if the body
hash matches; 409 if the body differs.

### B-07 — Score integer coercion via `BigInt(body.score)` is safe for `Number` inputs but the Zod schema caps at `Number.MAX_SAFE_INTEGER` — Info

`scores.ts:204, 220`; `agents.ts:103, 125` all do `BigInt(body.score)` and
`BigInt(body.matchCountDelta)`. The Zod schema (`schemas/auth.ts:130-137`,
`schemas/agents.ts:18-23`) caps `score` at `Number.MAX_SAFE_INTEGER`
(2^53 - 1) — well within the contract's `uint256`. `BigInt(number)` is
exact for integers in this range. The contract has no upper bound on
`score` other than uint256 max.

`matchCountDelta` is clamped on-chain by `MATCH_COUNT_CAP = 10`
(`TournamentPool.sol:75-76` deployed-constant; see also the addresses
file). The Zod schema allows arbitrary non-negative integer; an attacker
can pass `matchCountDelta = 1_000_000` and the contract will just store it,
but `_computeEffectiveScore` only applies `min(matchCount, MATCH_COUNT_CAP)`
(needs verification — the cap is read but I didn't read that internal
function).

**Severity:** Info. Coercion is sound. Mention the matchCountDelta cap
mismatch (server says no upper bound, contract caps at 10) as a follow-up.

### B-08 — Two diverging copies of the submit-digest signer; `packages/lib-shared/src/attestation.ts` targets V2 address, `apps/api/src/lib/contracts-vendored/attestation.ts` targets V2.1 — Med (drift risk)

`packages/lib-shared/src/attestation.ts:213` uses
`TOURNAMENT_POOL_V2_ADDRESS` in the digest. The contract address constant
in `packages/contracts` (`packages/contracts/src/addresses.ts:45-47`) is
**the same value** as `TOURNAMENT_POOL_V21_ADDRESS` today
(`0x52049b812780134d2F69D6c20C2ef881D49702da`). v2 and v2.1 share storage
and address per the `addresses.ts:36-47` comment. So today both digests
hash to the same `address(this)` value.

However:
- The two files are not kept in sync by tooling. The vendored copy lives
  under `apps/api/src/lib/contracts-vendored/` and the README there
  (file lookup confirmed) says the cleanup PR drops both copies, but it's
  not landed.
- `lib-shared` is not actually imported by any apps/api submit path
  (grep'd above; the apps/api `routes/scores.ts:21` imports from
  `../lib/contracts-vendored/attestation.js`). So the divergence is
  dormant for the audit window — but a careless future PR could route
  `packages/lib-shared` into apps/api at signing time and silently target
  the wrong contract if V2.1 is ever redeployed at a different address.

**Severity:** Medium drift risk; current behavior is correct.

**Recommendation:** Delete `packages/lib-shared/src/attestation.ts`'s
`buildTournamentSoloSubmitDigest` (lines 186-228) before mainnet, or
remove the V2_ADDRESS reference and import from `@skillos/contracts`
canonically.

### B-09 — `dataSuffix` server-side encoding integrity — coverage is good for unit tests, NO automated post-broadcast verification — **Medium**

The server-side encoder lives in `apps/api/src/lib/games.ts:62-81`. It is
deterministic (ASCII-hex of the 11-char `bc_xxxxxxxx` string ⇒ 22 hex chars
⇒ `0x[22hex]` of length 24). The mapping is server-derived from the
request body's `game` field via `BUILDER_CODES`. It is **not** pass-through
from request — the request only carries the game slug, and the resolver
throws on unknown slug (which is also defended by the Zod enum).

**Test coverage** (`apps/api/test/games.test.ts`):
- `BUILDER_CODES` length, regex, and canonical-value pinning regression
  test (`games.test.ts:25-56`) ✅
- `builderCodeToDataSuffix` deterministic encoding tests for clicker
  + 2048 (`games.test.ts:60-87`) ✅
- 712 + 22 = 734 hex char tail-length invariant **as a math assertion**
  (`games.test.ts:103-118`) — **does not actually call viem or
  `writeContract`; only asserts `EXPECTED_TOTAL === 734`**.
- `apps/api/test/charge-retry-fee.test.ts:148-150` asserts the 2048 suffix
  appears in `writes[1].dataSuffix` of a mock wallet client.

**Missing:**
- No integration test that calls `walletClient.writeContract` with a real
  ABI and asserts the encoded calldata is `712 + 22 = 734` hex chars
  (only the math is asserted, not viem's encoding).
- No post-broadcast drift-detection (read back `tx.input`, assert the
  trailing 22 hex chars equal `dataSuffix.slice(2)`).
- The X10 manual verification (per memory `project_api_server_side_datasuffix_attribution_gap`
  closed 2026-05-14) was done by hand on tx `0xd371ba4c...` and is **not
  re-run in CI**.

**Severity:** Medium. Encoding is correct today; the regression-detection
posture is weak. If viem ever changes `dataSuffix` semantics (or the
upstream encoder is dropped from the writeContract action), the math test
keeps passing while real txns lose attribution.

**Recommendation:** Add a post-broadcast spot-check: in the route, after
`writeContract`, fetch the recent transaction (with `getTransaction({ hash:
txHash })`) and assert `tx.input.endsWith(dataSuffix.slice(2))`. Gate
behind a `DATA_SUFFIX_DRIFT_CHECK=true` env var so prod doesn't pay an
extra RPC round-trip per submit, but run it in CI smoke. Memory
`project_x15_replay_ux_shipped` indicates the apex/watch flow has a
similar need.

### B-10 — `soloRunId` from client is signed but not deduped server-side; double-broadcast amplifies — Low/Med (with B-04, B-06)

See B-04 above. Calling out as its own item because the prompt asked
about the request-body coercion path. The `soloRunId` is a bytes32 hex
from the client (optional); if absent the server generates a fresh random.
It IS hashed into the digest at line 83 of `attestation.ts` and into the
event at `SoloScoreSubmitted` (`TournamentPool.sol:505`). The contract
emits it in `Submission` struct (line 502) for audit. But the contract
does **NOT** dedupe on `soloRunId` — only on `nonce`. Conclusion: a
malicious or buggy client can pin a single `soloRunId` and the server
signs a fresh attestation every time (random `nonce` each).

**Severity:** Low standalone, Med with B-06 unified.

### B-11 — Bearer-rate-limit returns HTTP 400 instead of 429 — Low (OpenAPI/spec consistency)

`scores.ts:178-186` throws `ApiError(400, 'RATE_LIMITED', …)` for
rate-limit overrun, while the OpenAPI response declaration at
`scores.ts:163-166` declares 429 for the same condition. The agent route
(`agents.ts:78-82`) uses 429 correctly. The comment at `agents.ts:86-88`
explains the SIWB precedent ("ApiError status enum doesn't include 501;
matches POST /v1/scores precedent (400 for tier-not-implemented)"). Spec
documents 429 for both. SDK clients (`packages/sdk/src/api.gen.ts`)
expect 429.

**Severity:** Low (interop bug). Recommend: either fix the ApiError enum
to allow 429 (preferred — match the OpenAPI contract) or update the OpenAPI
on `/v1/scores` to drop 429 (worse — sacrifices spec accuracy).

### B-12 — `submitSoloScore` broadcast: viem retries 3× then surfaces failure to caller; no DLQ, no Supabase landing — **High** (consistent with memory `project_paid_retry_broadcast_post_yc`)

`wallet-client.ts:31-41` configures `transport: http(url, { retryCount: 3,
retryDelay: 250, timeout: 30_000 })`. So there IS RPC-level retry — three
attempts at 250 ms intervals, 30 s overall timeout. The audit memory's
claim "no RPC retry/timeout/fallback" was true pre-this code; the current
file shows retries, a timeout, and a fallback chain in `writeRpcUrl()` —
Alchemy → shared RPC → public Base Sepolia.

What is **still missing**:
- **Submit-tx-hash schema**: no `submit_tx_hash` column on `duel_runs` or
  a parallel `score_submissions` table for `/v1/scores`. The
  `agents-matches.ts:333-336` updates `duel_runs.on_chain_tx_hash` but
  only after a successful broadcast — failures are logged to console and
  vanish (`runner.ts:337-348`).
- **Poller worker**: there is no background job that reconciles broadcast
  failures.
- **No mempool-stuck handling**: if Alchemy accepts the tx but it never
  mines (gas too low, RPC dropped it), the API returns 200 with a `txHash`
  that the client can't trust. The endpoint description acknowledges
  "fire-and-forget; tx hash returned before block inclusion".

**Severity:** High for mainnet (paid retries + tournament prize stakes);
Medium for testnet.

**Recommendation:** Per memory's Fix C (poller worker), add a Supabase
table `score_submissions(tx_hash, status, attempt_count, …)` written on
successful broadcast and a Vercel cron job that polls for inclusion +
re-broadcasts stuck txns. Memory `project_post_yc_tournament_created_indexer`
suggests the same pattern is missing for permissionless tournament
creation; one indexer can cover both.

### B-13 — ERC-8128 nonce store falls back to library default (in-memory singleton, per-Lambda) — **Medium**

`apps/api/src/middleware/agent-auth.ts:38-45` does NOT pass `nonceStore`
to `siwaMiddleware`. The library default (`erc8128.js:207-225`) is an
in-process `Map<string, expiry>`. On Vercel, each Lambda instance has its
own Map. An attacker who captures an ERC-8128 signed request can replay it
to a different Lambda instance (concurrent or cold-started) and the
verifier accepts because that instance hasn't seen the nonce.

The ERC-8128 nonce TTL also isn't visible from the wrapper code — it's set
by `@slicekit/erc8128` defaults inside `verifyRequest`. The
captcha/replay-window length is part of the audit's threat model.

**Severity:** Medium. ERC-8128 signatures bind to body hash + headers, so
replay is limited to identical bodies; but a paid-retry replay is still a
double-submit equivalent of B-06.

**Recommendation:** Inject a Supabase-backed nonce store consistent with
`apps/api/src/lib/siwa-nonce-store.ts` (which IS wired in for SIWA's
sign-in nonce). Re-use the same table with a different namespace prefix
(memory note `project_phase2_nonce_store_unify`).

### B-14 — Receipt-secret leak window: 24 h TTL with no revocation — Med (operational)

`apps/api/src/lib/agent-receipt.ts:26` sets `TTL_MS = 24 * 60 * 60 *
1000`. Receipts are stateless HMAC tokens. There is no server-side
revocation list, no per-`agentId` issued-receipts tracking. If a receipt
leaks (held in plaintext logs, copy-pasted in support tickets), the only
mitigations are: (a) wait 24 h, (b) rotate `SIWA_RECEIPT_SECRET` — which
invalidates **all** agents simultaneously. The comment at lines 7-11
acknowledges rotation as the only revocation lever.

SIWB JWTs have the same property (`jwt.ts:20`); same severity rationale.

**Severity:** Medium (acceptable for testnet; mainnet ops needs faster
revocation).

**Recommendation:** Add a `receipts_revoked` Supabase table or Redis set
keyed by `(agentId, receipt-iat)`. Check on every write-endpoint hit. One
extra query per write; acceptable given the existing Supabase touches.

### B-15 — Agent submit can target wrong-game tournament; `game ↔ tournamentId` linkage is not server-verified, attribution mis-credits builder codes — Low

`apps/api/src/schemas/agents.ts:13-17` explicitly disclaims this: "Must
match the game of the targeted tournamentId — the server does NOT verify
this match-up; mis-attribution is the caller risk." Code follows the spec.
This means a caller can submit a 2048 score to a match3 tournament with
`game: 'wordle'` in the body, and the dataSuffix encodes `bc_l0drfg77`
(wordle) on a match3 tx. The tournament contract has no game-slug check
either (`gameSlug` is metadata; the comment is in `lib-shared` —
`addresses.ts:1-7`).

**Severity:** Low (it's documented, and the on-chain submission still
succeeds if the contract accepts it; only the off-chain attribution
indexer mis-credits).

**Recommendation:** Read `_tournaments[id].gameSlug` (if exposed via a
view function) and assert `gameSlug(body.game) === tournament.gameSlug`
before signing. Out of scope for testnet; required if mainnet ships builder
revenue share by game.

### B-16 — Bearer JWT secret length check is correct; agent receipt secret has the same check — Info

`apps/api/src/lib/jwt.ts:24-32` and `apps/api/src/lib/agent-receipt.ts:28-34`
both enforce `secret.length >= 32`. ✅

### B-17 — `STUDIO_PRIVATE_KEY` cached in a module-level `let cachedAccount` per Lambda — Info

`apps/api/src/lib/contracts-vendored/attestation.ts:21-30`. Cached for the
lifetime of the Lambda instance. Refusing to log the key is not done
explicitly (no `process.env.STUDIO_PRIVATE_KEY = undefined` after read,
which would also break the same-process reload). Vercel's serverless model
isolates env per function, but a leaked stack trace that printed
`process.env` would still expose the key. Standard hygiene; nothing
specific to this file.

**Severity:** Info.

### B-18 — Failure modes the audit prompt asked about, explicitly traced — Info

a) **Signer succeeds, RPC broadcast fails.** `writeContract` throws after
viem's 3× retry + 30 s timeout. The wrapped `BaseError` is walked at
`scores.ts:231-243` / `agents.ts:133-145` for `ContractFunctionRevertedError`
specifically. Network-level errors (timeout, ECONNRESET, RPC 5xx) bypass
that branch and rethrow → Hono's default error middleware converts to 500
`INTERNAL`. The score is signed but not broadcast; the digest is **not**
persisted server-side, so a client re-submit with the same body generates
a new nonce and may or may not succeed. The first signed attestation is
gone (`STUDIO_PRIVATE_KEY` signing is deterministic given the inputs, but
the random `nonce` is regenerated on each retry, so no recovery
possibility).

b) **Broadcast succeeds, tx reverts on-chain.** Surfaced via 409
`CHAIN_REVERT_${errorName}` (e.g., `CHAIN_REVERT_NonceUsed`,
`CHAIN_REVERT_InsufficientFeePaid`, `CHAIN_REVERT_TournamentAlreadyEnded`).
Walked correctly. No settler/poller — the API has no way to know if a
**later** revert happens after the writeContract simulation succeeded
(this matters: viem's writeContract simulates first, so most reverts
surface here, but post-simulation chain-state changes can still revert at
inclusion; that path returns 200 with txHash and the revert is silent
unless the client polls).

c) **Two scores in quick succession from the same wallet.** No mempool
nonce collision (random per-request). Both succeed at the contract layer
(see B-06). The submitter-account-nonce in viem's wallet client may
collide on the EOA side if `STUDIO_PRIVATE_KEY`'s underlying account
nonce is stale — viem auto-increments. Concurrent broadcasts could both
read the same `getTransactionCount(pending)` value and one tx becomes a
replacement of the other (same nonce). This is a known viem behavior; the
fix is per-broadcaster nonce locking (mutex). Memory
`project_x15_chargeretryfee_first_paid_retry_race` describes the
chargeRetryFee analog of this race; the same pattern applies to
submitSoloScore but I see no mutex in `wallet-client.ts`.

---

## Cross-Cutting Observations

- **Wallet roles are clearly separated** (`wallet-client.ts:42-58`).
  STUDIO signs+broadcasts `submitSoloScore`; AGENT pays
  `chargeRetryFee`. Memory `project_x15_agent_wallet_split` documents this
  cleanly.
- **The off-chain digest mirror is byte-for-byte correct** vs
  `_verifySoloSubmitSignature`. The vendored file in apps/api targets
  V2.1; the duplicate in lib-shared targets V2 (same address today; see
  B-08).
- **Tier-gate is total** — every signer call site (3 of them) operates at
  T0 only either by explicit guard (the two HTTP routes) or by default
  (the duel runner has no tier concept). The audit prompt's worry about a
  "501 bypass via internal caller" doesn't manifest because no caller
  passes tier=T1+.
- **The most exploitable surfaces today** are (in order of severity): B-05
  (unauthed `start-solo` driving on-chain submits), B-01 (stale ownerOf),
  B-12 (no broadcast DLQ/poller), B-06 (idempotency).

---

## Out of Scope (Noted for Other Clusters)

- `chargeRetryFee` race and X402 facilitator integrity → Cluster C/D.
- Settle path attestations and tournament-create indexer drift → other clusters.
- SIWB nonce store atomicity → SIWB only consume nonce IS atomic
  (`auth-store.ts:74-92` does an UPDATE ... RETURNING in Supabase). Out
  of cluster scope.

## File:Line Index (for cross-referencing)

- Submit handlers: `apps/api/src/routes/scores.ts:174-258`,
  `apps/api/src/routes/agents.ts:73-161`
- Background submit: `apps/api/src/lib/duel/runner.ts:293-349`
- Public match-start (unauthed, kicks off chain submit): `apps/api/src/routes/agents-matches.ts:71-149`
- Bearer middleware: `apps/api/src/middleware/bearer.ts:17-51`
- Agent auth middleware: `apps/api/src/middleware/agent-auth.ts:38-45`
- Attestation signer (vendored): `apps/api/src/lib/contracts-vendored/attestation.ts:59-108`
- Attestation signer (lib-shared, currently unused by submit path): `packages/lib-shared/src/attestation.ts:186-228`
- Wallet client: `apps/api/src/lib/contracts-vendored/wallet-client.ts:31-58`
- JWT: `apps/api/src/lib/jwt.ts:23-75`
- SIWA verify: `apps/api/src/lib/siwa.ts:57-114`
- Receipt issuance: `apps/api/src/lib/agent-receipt.ts:41-67`
- Rate limit: `apps/api/src/lib/rate-limit.ts:10-49`
- Builder codes + dataSuffix encoder: `apps/api/src/lib/games.ts:43-81`
- Test coverage for dataSuffix: `apps/api/test/games.test.ts:25-118`,
  `apps/api/test/charge-retry-fee.test.ts:148-150`
- Contract verifier: `contracts/src/TournamentPool.sol:463-506, 733-748`
- Library SIWA middleware: `node_modules/@buildersgarden/siwa/dist/server-side-wrappers/hono.js:73-144`
- Library ERC-8128 verifier: `node_modules/@buildersgarden/siwa/dist/erc8128.js:240-366`
- Library receipt format: `node_modules/@buildersgarden/siwa/dist/receipt.js:33-80`
