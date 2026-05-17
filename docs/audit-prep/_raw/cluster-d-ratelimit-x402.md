# Cluster D — Rate Limiting + x402 Facilitator Audit Prep

Scope: pre-mainnet audit prep on the rate-limiter and x402 settlement paths in
`apps/api`. Findings only — no code changes. Citations include file paths and
line numbers; line numbers reflect the working tree at HEAD of
`ur-track-b-offchain`.

Audited surface:
- `apps/api/src/lib/rate-limit.ts` (49 lines)
- `apps/api/src/lib/x402.ts` (133 lines, paymentMiddleware mount)
- `apps/api/src/lib/x402-client.ts` (326 lines, server-side settle)
- `apps/api/src/lib/duel/charge-retry-fee.ts` (231 lines)
- `apps/api/src/routes/{scores,agents,agents-matches,data,auth,auth-siwa,tournaments,sponsors}.ts`
- `apps/api/src/middleware/{bearer,agent-auth}.ts`
- `apps/orchestrator/src/app/api/cron/{settle-tournaments,reconcile-duels,...}/route.ts`
- `supabase/migrations/v4_20260515_x15_payment_attempts.sql`
- `contracts/deployments/wallets-base-sepolia.md`

---

## 1. Rate Limit Coverage Matrix

State-modifying routes × current rate-limit × effective-on-serverless. "State"
here = "mutates DB rows, sends an on-chain tx, or burns a server resource the
attacker controls economic incentive against."

| Route | Method | File | Auth | Rate-limit key | Effective on serverless? | Notes |
|---|---|---|---|---|---|---|
| `/v1/auth/siwb/nonce` | POST | `routes/auth.ts:19-53` | none | NONE | n/a — no limiter | Issues + invalidates nonces; REPLACE pattern means an attacker can spin the nonce ring at line rate. Cost: a few `auth_nonces` rows per second. |
| `/v1/auth/siwb/verify` | POST | `routes/auth.ts:55-152` | none (consumes nonce) | NONE | n/a | Each call burns a nonce + 1 ECDSA verify. Unmitigated CPU spam. |
| `/v1/auth/siwa/nonce` | POST | `routes/auth-siwa.ts:38-92` | none | NONE | n/a | Same shape as SIWB nonce. |
| `/v1/auth/siwa/verify` | POST | `routes/auth-siwa.ts:94-172` | none (consumes nonce) | NONE | n/a | Per-call cost: ECDSA verify + onchain `ownerOf()` (RPC fan-out) + outbound `fetch(api.base.dev/v1/agents/builder-codes)`. The base.dev call is unbounded and on the hot path. |
| `/v1/scores` | POST | `routes/scores.ts:138-258` | bearer JWT | `scores:${wallet.toLowerCase()}` | NO — per-instance only | Each call signs an attestation **and broadcasts on-chain** (gas burns from STUDIO wallet). 60 req/min limit reset on every cold start. |
| `/v1/agents/scores` | POST | `routes/agents.ts:40-161` | SIWA receipt + ERC-8128 | `agent-scores:${agentAddress.toLowerCase()}` | NO — per-instance only | Same on-chain broadcast shape as `/v1/scores`. Gas burned from STUDIO wallet. |
| `/v1/agents/profile` | PATCH | `routes/agents.ts:179-217` | SIWA receipt + ERC-8128 | NONE | n/a | Writes to in-memory `profileStore` (`agents.ts:177`). Not durable, not rate-limited. Memory-leak vector if `agentId` space is enumerable. |
| `/v1/agents/matches/start-solo` | POST | `routes/agents-matches.ts:42-149` | **NONE (public)** | `agent-matches-start-solo:${ip}` | NO — per-instance + IP-spoofable via `x-forwarded-for` | Per-call side effects: Supabase `duel_runs` row + Supabase `x15_payment_attempts` row + x402 USDC settle (real money) + `chargeRetryFee` on-chain tx + agent run loop (Anthropic API spend). |
| `/v1/data/match-replay/{id}` | GET | `routes/data.ts:48-116` | x402 paywall | NONE | n/a | $0.01 USDC per call; no per-payer cap. |
| `/v1/data/cohort-snapshot` | GET | `routes/data.ts:118-171` | x402 paywall | NONE | n/a | $0.10 USDC per call; no per-payer cap. |

Read endpoints (`GET /v1/tournaments`, `GET /v1/scores/{wallet}`,
`GET /v1/sponsors/{wallet}/receipts`, `GET /v1/tournaments/{id}`,
`GET /v1/tournaments/{id}/leaderboard`) are not in this matrix — they are
read-only against on-chain state + indexer cache. They DO carry RPC-cost and
Alchemy-rate-limit risk (out of scope for this cluster).

### Why "effective on serverless? NO"

`apps/api/src/lib/rate-limit.ts:18`: `const buckets = new Map<string, Bucket>();`

The bucket Map is a module-level singleton. On Vercel:

1. **Cold start resets state.** Every fresh Lambda instance starts with an
   empty Map. An attacker who can trigger cold starts (or simply waits
   ~5 minutes between bursts) gets a fresh 60-token quota.

2. **Concurrent instances do not share state.** Vercel routes inbound load
   across N warm instances. With N=10, the *effective* per-key limit is
   10 × 60 = 600 req/min, not 60. The limit is **per-instance**, not
   **per-key globally**. The header `X-RateLimit-Reset` returned to the
   client (`agents-matches.ts:78`, `scores.ts:180`, `agents.ts:80`) is
   misleading: it advertises a single-instance reset that does not reflect
   what other instances think.

3. **No eviction on inactivity.** The "LRU-ish trimming" at lines 36–42 only
   drops *expired* buckets. If the bucket has tokens left and `resetAt` is in
   the future, it stays. `MAX_TRACKED = 1000` (line 19) is a soft cap — the
   trim loop drops *expired* buckets first; if every tracked bucket is
   live, the Map grows unbounded for the duration of the Lambda. Vercel
   recycles instances on memory pressure or idle timeout, so this is
   "merely" a per-instance leak rather than a permanent one, but at scale
   the LRU trim is essentially a no-op (since long-lived attackers keep
   their buckets fresh).

4. **Comment-acknowledged debt.** Lines 3–8 of `rate-limit.ts` state:
   > "Ephemeral and per-Lambda-instance — Vercel functions are short-lived,
   > so limits 'leak' across instances. Production-grade requires
   > Upstash/Redis; deferred to Phase 2 polish."
   This memo is correct; the gap is *not* hidden but is also *not* yet
   closed.

The X20/X15 routes that *broadcast on-chain on every successful call*
(`/v1/agents/matches/start-solo` and the two `/scores` endpoints) sit
behind this cosmetic limiter. On mainnet, this is the difference between
"abusive bearer-holder pays ~$1.05/sec to drain agent wallet" and
"abusive bearer-holder pays $0/sec to drain server gas." (See abuse
inventory below.)

### Routes with no rate-limit at all

`/v1/auth/siwb/nonce`, `/v1/auth/siwb/verify`, `/v1/auth/siwa/nonce`,
`/v1/auth/siwa/verify`, `/v1/agents/profile`, both `/v1/data/*` x402
routes. Severity-rated below; the SIWA/SIWB verify endpoints are the most
attractive targets because they're the unauthenticated front door.

---

## 2. x402 Trust Boundary

Three hops, each with its own verification model. Below = what's verified at
each hop, and where the trust gap is.

### Hop 1: API → Facilitator (`apps/api/src/lib/x402.ts`)

- **Facilitator URL source:** `x402.ts:62-63` reads from
  `X402_FACILITATOR_URL` env, falling back to `DEFAULT_FACILITATOR_URL =
  'https://x402.org/facilitator'` (line 21).
  - **Hardcoded fallback is a public, unauthenticated, third-party
    service.** No facilitator-side TLS pinning. If `x402.org` is
    compromised or the DNS hijacked, the API would happily settle against
    the malicious facilitator and accept whatever `transaction:` field it
    returned (see Hop-2 verification).
  - Memory note re: Coinbase CDP facilitator for mainnet is documented
    inline (line 9-10) but the swap is gated on env. **Mainnet plan must
    pin `X402_FACILITATOR_URL` in Vercel env before any real-USDC route
    deploys.**
- **Receiver `payTo` source:** `x402.ts:42-58` (`readReceiver()`) — env
  `X402_RECEIVER_ADDRESS`. Validated for `0x` + 40 hex chars only; no
  on-chain liveness check, no role-distinct-wallet check.
- **Asset:** scheme registered is `ExactEvmScheme` on
  `eip155:84532` (Base Sepolia) at line 70-73. Implicit USDC binding
  (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) via the scheme — not
  visible in this file; lives in `@x402/evm`.

### Hop 2: Facilitator → API response handling (server-side settle path,
`apps/api/src/lib/x402-client.ts`)

The agent-paid retry path constructs the EIP-3009 payload locally,
forwards to `facilitator.settle()`, and trusts the returned
`transaction:` hash.

- **What IS verified locally:**
  - `signer.address === args.agentAddress` (lines 251-256). Prevents
    accidentally signing from the wrong wallet.
  - `response.success === true` (line 300-306). Throws on failure.
  - `response.transaction` is a string and starts with `0x` (lines
    308-315). Otherwise throws `malformed_response`.
- **What is NOT verified locally:**
  - **No receipt fetch.** The code does not call
    `publicClient.waitForTransactionReceipt({ hash: response.transaction })`
    to confirm the tx exists, mined, or transferred the expected amount.
    A malicious facilitator could return any `0x`-prefixed string and the
    API would record it as settled.
  - **No amount cross-check.** `response.amount` is present in the
    `FacilitatorSettleResponse` type (line 132) and in the test fixture
    (test line 142) but never asserted against `AGENT_MATCH_RETRY_ATOMIC`
    in production code.
  - **No network cross-check.** `response.network` exists in the type but
    not validated against `BASE_SEPOLIA_CAIP2`.
- **EIP-3009 idempotency:** The `(from, nonce)` authorization key on USDC
  is correct — each call generates a fresh random 32-byte nonce
  (`defaultNonce()` at lines 324-326, using `node:crypto.randomBytes(32)`).
  Replay across calls IS prevented at the contract level. ✅
- **`validAfter` / `validBefore` window:** `validAfter` is the current
  time minus 600s, `validBefore` is current time plus 600s
  (lines 53-54, 258-261). This is a 20-minute window. Acceptable for clock
  skew; not abusable.

### Hop 3: API → on-chain `chargeRetryFee`
(`apps/api/src/lib/duel/charge-retry-fee.ts`)

After x402 settles to the receiver float, the agent wallet additionally
broadcasts on-chain via `chargeRetryFee` (line 136-142). Idempotent
max-approve at line 117-133 — the `maxUint256` approve is bounded to
`TournamentPool` only and only `RETRY_FEE` is pullable per
`chargeRetryFee` call. ✅ blast-radius bounded.

### Trust-boundary gap summary

| Hop | Verified | Not verified | Risk |
|---|---|---|---|
| API → Facilitator URL | env-pinned | TLS pinning, mutual auth | If x402.org compromised → silent malicious settle |
| Facilitator → API response | `success`, hex-shape of `transaction` | tx on-chain inclusion, amount, network | Facilitator can lie about settlement; API records phantom row |
| API → chain (chargeRetryFee) | viem receipt wait (`agents-matches.ts:266-267`) | none — receipt is canonical | ✅ |

---

## 3. Findings

### F1 [CRITICAL] In-memory rate limit is cosmetic on serverless; routes with on-chain side effects bypass-able N× via concurrent instances

**File:** `apps/api/src/lib/rate-limit.ts:18` (singleton Map); used at
`routes/scores.ts:178`, `routes/agents.ts:78`,
`routes/agents-matches.ts:76`.

**Effect on mainnet:** A malicious bearer holder (or a single rogue agent
with a valid SIWA receipt) can spam `/v1/agents/matches/start-solo` at
N × 60 req/min where N = concurrent warm Lambda instances. Each
successful call:
1. Pulls $1.05 USDC from the AGENT wallet to X402_RECEIVER (real money).
2. Broadcasts `chargeRetryFee` from AGENT wallet (gas spend).
3. Starts an Anthropic API run (LLM spend).
4. Opens a Supabase realtime channel (spectator UX bandwidth).

Mainnet floor cost of a 1-hour attack at N=5 instances: ~$945 in USDC
alone (5 × 60 × 60 × $1.05 / 60). Vercel auto-scales, so N grows under
load — the per-IP key in `agents-matches.ts:76` doesn't even constrain a
single attacker who rotates `x-forwarded-for`.

**Severity:** Critical for mainnet. Must move to Redis/Upstash before
real-USDC routing. Comment in `rate-limit.ts:3-8` acknowledges the debt
but the work hasn't landed.

**Recommendation:** Pre-mainnet: migrate to Upstash REST API with a
fixed-window or sliding-window counter keyed on the same `key` strings.
Concurrent with the nonce-store unification work mentioned in the
project_phase2_nonce_store_unify memory.

---

### F2 [CRITICAL] `/v1/agents/matches/start-solo` is fully public (no auth) yet triggers $1.05 USDC settlement + on-chain broadcast per call

**File:** `routes/agents-matches.ts:42-149`. Route mount has no
`requireBearer()` / `requireSiwaAuth()` middleware (compare to
`agents.ts:73,201` which DO mount `requireSiwaAuth()`).

**OpenAPI spec self-documents this:** route definition lines 42-69 omit
the `security: [{...}]` block entirely. Header comment lines 2-4 confirm:
> "X20 shipped one route: POST /v1/agents/matches/start-solo. Public (no
> auth) for the testnet demo era; X21 adds SIWA + matchmaker queue routes."

The downstream cost of an unauth call is non-trivial:
- 1× Supabase row insert (`duel_runs`)
- 1× Supabase row insert (`x15_payment_attempts`)
- 1× chain read (`soloSubmissionCount`)
- 1× x402 settle round-trip to facilitator (the AGENT wallet pays $1.05
  USDC to the receiver float on each call where `tournamentId` is set;
  see lines 100-118)
- 1× on-chain `chargeRetryFee` if `priorSolo > 0` (gas from AGENT wallet)
- 1× agent run loop with Anthropic spend.

The only safeguard is the IP rate-limiter at line 76, which (a) is
in-memory, (b) keys on `x-forwarded-for` (trivially spoofed), and (c)
falls back to literal string `'local'` when neither header is present
(line 75) — meaning any caller who strips both headers shares the same
bucket as every other no-header caller.

**Severity:** Critical for mainnet. The route must require auth (SIWA
receipt + ERC-8128 sig like the `/v1/agents/*` siblings) AND have a
per-agent quota before real-USDC tournament IDs are routed through it.

**Recommendation:**
1. Pre-mainnet: gate `/v1/agents/matches/start-solo` behind
   `requireSiwaAuth()`, OR keep public but require a paid X20 demo
   tournament ID that resolves to a sandbox-only on-chain id.
2. Add per-agent daily quota (e.g., 100 retries/day/agent) using the
   Upstash counter once F1 lands.
3. Remove the `'local'`-IP fallback at line 75 — refuse the request
   with 400 if neither `x-forwarded-for` nor `x-real-ip` is present.

---

### F3 [HIGH] x402 settlement response is trusted without on-chain receipt verification

**File:** `apps/api/src/lib/x402-client.ts:298-322`.

The settle path receives `response.transaction` from the facilitator and
records it as the canonical settlement tx hash without ever calling
`publicClient.waitForTransactionReceipt({ hash })` to confirm:
1. The tx exists on-chain.
2. The tx transferred `AGENT_MATCH_RETRY_ATOMIC` USDC from
   `args.agentAddress` to `X402_RECEIVER_ADDRESS`.
3. The tx's `chainId` matches `BASE_SEPOLIA_CAIP2`.

The downstream caller in `routes/agents-matches.ts:241-249` writes
`status='x402_settled'` and the `x402_tx_hash` straight to
`x15_payment_attempts` based on this unverified response. If the
facilitator is compromised, the API will:
- Show a successful "settlement" in the operator dashboard
  (`x15_payment_attempts` row with `x402_status='settled'`).
- Proceed to `chargeRetryFee` on-chain (the next step in the
  orchestration is gated only on `priorSolo > 0`, not on x402
  verification — `agents-matches.ts:252`).
- Spend Anthropic budget on the run loop.

The contract-level idempotency on `(from, nonce)` (lines 21-26 comment
block) protects against *the same payload* being settled twice via
distinct facilitators, but does NOT protect against a malicious
facilitator inventing a fake tx hash and lying about settlement.

**Severity:** High for mainnet. On testnet the attack surface is low
(public testnet facilitator is operator-controlled). On mainnet, a
Coinbase CDP facilitator outage that silently returns 200s would be
indistinguishable from real settlement.

**Recommendation:** After receiving the facilitator settle response and
before recording `x402_settled`, call
`publicClient.waitForTransactionReceipt({ hash: response.transaction })`
and verify (a) status === 'success', (b) tx logs include a USDC `Transfer`
event with `from = agentAddress`, `to = receiver`, `value =
AGENT_MATCH_RETRY_ATOMIC`. Reject and mark `needs_manual_review` if any
mismatch.

---

### F4 [HIGH] x402 paywall middleware mounted globally; receiver env-misconfig at boot manifests as paid-route opacity, not 503

**File:** `apps/api/src/app.ts:59` (`app.use('*', getX402Middleware())`),
`apps/api/src/lib/x402.ts:128-133` (`getX402Middleware`).

The lazy-init pattern is correct in shape — `cached` (line 123) defers
`readReceiver()` (which throws if `X402_RECEIVER_ADDRESS` is unset) to
first request. Module import doesn't crash on a missing env. ✅

But the failure mode on the **first call** to a paywalled route with
unset env is to throw from inside the middleware:
`readReceiver()` raises a plain `Error` at `x402.ts:45-50`. That error
bubbles through `paymentMiddleware`'s caller frame; Hono's `app.onError`
(`app.ts:185`) routes it through `errorEnvelope`'s `errorHandler`, which
will produce a 500 — not the documented 402 challenge nor a 503
"x402 not configured."

Two consequences:
1. **Silent paywall bypass risk if the middleware throws inside the
   `paymentMiddleware` framework.** Depending on `@x402/hono`'s internal
   handling of constructor throws, a thrown error inside `buildMiddleware()`
   could short-circuit `next()` differently than a normal exception. Worth
   verifying with an integration smoke (env-unset deploy → curl
   `/v1/data/match-replay/0x…` → confirm 500, not 200).
2. **Operator confusion.** A 500 on a paywalled route looks identical to
   "the route is broken" rather than "you haven't configured payment
   receiver." Pre-mainnet, this should map to a 503 with a clear
   `'X402_RECEIVER_NOT_CONFIGURED'` error code so operators can fix it
   quickly.

The audit-relevant concern: **the global mount at `app.ts:59` is
`'*'`**, meaning the middleware fires on every request, including health
checks and OpenAPI doc fetches. `paymentMiddleware` is supposed to
short-circuit non-paywalled paths via `requiresPayment()` (per
`x402.ts:4-6`), but if the lazy build throws, *every* route on the
deployment fails until the env var is set. Tight coupling between the
paywalled tier and unrelated routes.

**Severity:** High. Soft-blocking but operationally severe — any rotation
of `X402_RECEIVER_ADDRESS` that misfires takes the entire API down, not
just the paid tier.

**Recommendation:**
- Catch the receiver-read error inside `getX402Middleware()` and turn it
  into a tagged 503 only on paywalled paths; fall through to `next()` on
  non-paywalled paths (or scope the middleware mount to
  `/v1/data/*` instead of `'*'`).
- Add a startup-time smoke that calls the middleware with a synthetic
  paywalled-route request to assert it builds without throwing — runs in
  CI not in production.

---

### F5 [HIGH] `x15_payment_attempts` schema-vs-code drift; insert payload uses single-status column the migration doesn't define

**Files:**
- Schema: `supabase/migrations/v4_20260515_x15_payment_attempts.sql:54-105`.
  Defines `x402_status` (line 72) and `charge_status` (line 87) as two
  CHECK-constrained columns; no plain `status` column.
- Insert that matches schema: `routes/agents-matches.ts:202-220` writes
  to `status`, NOT `x402_status` — this WILL fail (column does not
  exist).
- Insert that also won't match: `lib/duel/charge-retry-fee.ts:205-215`
  inserts `status`, `tx_hash`, `approve_tx_hash`, `prior_solo` — none of
  which match the actual columns `x402_status`, `charge_status`,
  `charge_tx_hash`, etc. The CHECK on `status` values like
  `'success'`/`'error'`/`'skipped'` (line 187) doesn't match the
  migration's `x402_status` enum (`pending`/`settled`/`failed`) or
  `charge_status` enum (`pending`/`success`/`reverted`/`skipped`).

**Evidence of the drift:**
- The X15.8 memory (in user auto-memory) calls out:
  > "canonical single-status enum (X15.3 backend won); 2026-05-15
  > follow-up migration v4_20260515b applied to clizuqvtkekzxiflbsyr"
- The follow-up migration `v4_20260515b` is NOT present in this
  worktree's `supabase/migrations/` (`ls` shows only `v4_20260515`,
  `v4_20260515c_duel_runs_end_reason`; no `b`-suffixed file).
- `charge-retry-fee.ts:195-199` comment block explicitly states:
  > "X15.8 placeholder. The x15_payment_attempts table doesn't exist yet —
  > the INSERT will fail with code 42P01 ("relation does not exist") until
  > the migration lands."
- The migration HAS landed (file exists). The insert STILL doesn't match
  the schema in this branch.

**Effect:** Every `chargeRetryFee` call records a Postgres error in the
warn log (`charge-retry-fee.ts:218-222`) and continues. The audit trail
the migration was *intended* to provide does not exist — the
`x15_payment_attempts` table is empty (or populated only by the
`agents-matches.ts` path, IF that path uses the right column names —
which it ALSO doesn't, per the `status: 'x402_settled'` etc. literals
that don't match the two-column model).

This is mid-sprint drift, but it has implications:
1. **No reconciliation possible.** Operator dashboard query against
   `needs_manual_review = true` returns rows that may not exist; orphan
   `pending` rows (if the first insert *did* succeed) never get updated
   to terminal states.
2. **Refund/dispute path is broken.** ADR 0003 D9 (cited in migration
   comment line 12) says the ledger is the source of truth for the
   refund-eligible cases. If rows aren't being written, there's no
   record to refund against.
3. **Memory note timing.** The follow-up migration `v4_20260515b`
   mentioned in user memory may exist in the deployed Supabase but not
   in this branch's migrations — which means the branch's CI typecheck
   passes, the live DB schema doesn't match the migrations folder, and
   the code's column names don't match either.

**Severity:** High. Schema-vs-code drift on a money-handling ledger is
exactly the kind of mainnet blocker an external audit will flag.

**Recommendation:** Pick one of:
- Make `agents-matches.ts:202-220,241-249,267-278,287-294,316-323` use
  the two-column schema (`x402_status`, `charge_status`, etc.) AND
  update `charge-retry-fee.ts:200-230` similarly.
- OR land the documented `v4_20260515b` migration that collapses to a
  single-status enum and matches the code path.

Either way, add an integration smoke (live DB, real INSERT, assertion
that the row landed and the column values are what we expect) to CI for
the X15 paths.

---

### F6 [HIGH] No reconciliation cron for orphan `pending` rows on `x15_payment_attempts`

**Cron inventory:** `apps/orchestrator/vercel.json:4-11` defines six
crons: `create-tournaments`, `settle-tournaments`, `index-sponsor-events`,
`index-tournaments-created`, `reconcile-duels`, `anchor-sp-snapshot`.

None target `x15_payment_attempts`. The `reconcile-duels` cron
(`apps/orchestrator/src/app/api/cron/reconcile-duels/route.ts`) operates
on `duel_runs` stuck in `Accepted` state, not on payment-attempt rows.

**Failure modes that orphan rows:**
1. **Lambda timeout mid-orchestration.** The `waitUntil` worker in
   `agents-matches.ts:108-118` has a Vercel-imposed deadline (default 5
   minutes — `maxDuration` is not set on this route). If the runner
   exceeds the deadline, the row stays at whatever status the last
   completed UPDATE wrote — typically `pending` or `x402_settled`.
2. **`runSoloMatch` swallows errors.** Comment lines 304-307 acknowledge
   this. If x402 settles but `runSoloMatch` throws *after* the agent
   has been charged, the row is updated to `anchored` (line 269-278)
   *and* the run is still errored at the `duel_runs` level. Two tables
   diverge: `x15_payment_attempts.status='anchored'` says "payment
   successful," `duel_runs.status='error'` says "but the user got
   nothing." No refund logic exists (see F7).
3. **DB transient errors on intermediate UPDATEs.** Each
   `.update().eq('id', attemptId)` (lines 241-249, 269-278, 287-294,
   316-323) ignores its return value. A transient Supabase outage during
   step 4 leaves the row at `x402_settled` forever.

**Severity:** High. On mainnet, orphan-`pending` rows = money in the
agent → receiver float with no follow-on accounting.

**Recommendation:**
- Add `/api/cron/reconcile-payment-attempts` to orchestrator, scheduled
  hourly or daily.
- Query for rows older than 10 minutes still at `status='pending'` or
  `status='x402_settled'`. For each:
  - Re-check on-chain via `getTransactionReceipt(x402_tx_hash)` to
    confirm settlement.
  - If `priorSolo > 0` and `charge_status='pending'`, retry the receipt
    fetch on `charge_tx_hash` if set, else mark `needs_manual_review`.
  - For rows >24h still divergent, flag for manual ops.

---

### F7 [HIGH] No refund path; payment captured but service-delivery failures leave the user out-of-pocket

**File evidence:**
- `agents-matches.ts:174-178` (comment block):
  > "The agent's x402 USDC is NOT refunded on failure — operator
  > reconciles manually (X16 will automate)."
- `charge-retry-fee.ts:21-23` (same posture):
  > "On revert: the helper records the failure row and re-throws so the
  > caller can map the exception to a 5xx for the client and mark the
  > duel_runs row as 'error'. The agent's x402 payment is NOT refunded —
  > the operator must reconcile manually (X16 will automate this)."

So:
- x402 settles (real USDC moves from agent → receiver).
- `chargeRetryFee` reverts (e.g., `ERC20InsufficientAllowance` from the
  X15.6 race documented in user memory).
- `agents-matches.ts:280-285` calls `failAttempt('CHARGE_RETRY_FEE_FAILED')`
  → `needs_manual_review = true`.
- No code reverses the x402 settlement.

There's also no user-facing dispute endpoint. The only signal a user has
that something went wrong is the spectator UI seeing
`x15_payment_attempts.status='failed'` (per the Realtime subscription
described in `agents-matches.ts:8-14`).

**Severity:** High for mainnet. ADR 0003 D9 explicitly says "no auto-refund
logic." That's a deliberate design choice but it ships unaccompanied by
the *human* refund SOP — there's no documented operator runbook, no
authenticated `POST /v1/agents/matches/{id}/refund-request` endpoint,
and no Supabase RLS policy that would let users see their own failed
attempts.

**Recommendation:**
- Operator runbook: weekly query for `needs_manual_review = true` rows;
  refund process documented.
- Pre-mainnet: add a `POST /v1/agents/payment-attempts/{id}/dispute`
  endpoint that takes a SIWA receipt, verifies the attempt belongs to
  the agent, sets `review_notes='disputed'` and surfaces in operator
  queue.
- Long-term (X16): on `CHARGE_RETRY_FEE_FAILED`, auto-emit a refund tx
  from the receiver wallet back to the agent. Requires the receiver
  wallet to hold a key (see F9 below — currently the receiver is
  "receive-only").

---

### F8 [MEDIUM] x402 amount semantics — exact-amount enforcement is implicit in `ExactEvmScheme`; over-pay handling unverified

**Files:** `x402.ts:67-73` registers `ExactEvmScheme` with the
facilitator. `x402-client.ts:262, 274-286` sets `amount: value.toString()`
in both `paymentRequirements` and the EIP-3009 message.

The `exact` scheme name implies the facilitator should reject payments
that don't match exactly. But:

1. The server doesn't re-check `response.amount` against
   `AGENT_MATCH_RETRY_ATOMIC` (already called out in F3).
2. If an attacker constructed a custom EIP-3009 signature with `value` >
   `AGENT_MATCH_RETRY_ATOMIC` (1_050_001+), the facilitator's scheme
   handler would presumably reject — but without an integration test
   that asserts this, we're trusting `@x402/evm`'s reference
   implementation.
3. The price string `'$1.05'` (lines 36 of `x402.ts`) is converted to
   atomic units by `ExactEvmScheme` internally; if the scheme silently
   rounded or used a different decimal source than 6 for USDC, the
   advertised price could drift from the actual settle amount.

**Severity:** Medium. Low likelihood of exploitation but a known
unverified assumption.

**Recommendation:** Add an integration smoke that:
- Sends a $1.06 EIP-3009 sig to the facilitator with `accepted.amount =
  '1050000'`, expects `success: false`.
- Sends a $1.05 EIP-3009 sig, asserts `response.amount === '1050000'`.

---

### F9 [MEDIUM] X402_RECEIVER_ADDRESS isolation not documented in wallet registry; canonical address unknown

**File:** `contracts/deployments/wallets-base-sepolia.md` (full file).

The wallet registry lists deployer (TournamentPool), deployer/owner
(ChallengeEscrow), trustedSigner, and feeVault. **X402 receiver is
absent.** Memory notes the X15.3 split:
> "STUDIO_PRIVATE_KEY (trustedSigner + submitSoloScore broadcaster),
> AGENT_PRIVATE_KEY (chargeRetryFee broadcaster),
> X402_RECEIVER_ADDRESS (x402 float)."

The codebase enforces:
- `x402.ts:42-58`: read receiver from env, validate as hex address.
- `x402-client.ts:75-83`: same, plus checksum via `getAddress()`.
- `attestation.ts:25-26,42-43`: STUDIO and AGENT keys read separately.

But there's no code that **enforces** the receiver is distinct from
STUDIO or AGENT. If an operator (or attacker with env-write access) sets
`X402_RECEIVER_ADDRESS = <STUDIO_ADDRESS>`, the API would happily settle
payments to STUDIO. The role-distinct invariant from
`wallets-base-sepolia.md:3-7` would be violated silently.

**Recommendation:**
1. Document X402_RECEIVER_ADDRESS in the registry alongside trustedSigner
   and feeVault.
2. Add a startup-time assertion (in `readReceiver()` or a separate
   `validateWalletTopology()` boot check) that the receiver address is
   NOT equal to:
   - `privateKeyToAccount(STUDIO_PRIVATE_KEY).address`
   - `privateKeyToAccount(AGENT_PRIVATE_KEY).address`
   - deployer addresses (these can be hardcoded).
3. On mainnet, the receiver should be a multisig or a dedicated EOA
   that NEVER signs. Verify by checking that `X402_RECEIVER_PRIVATE_KEY`
   does NOT exist in any env. (Per memory note "wallet keys = founder
   only", the receiver key should not exist in agent-managed env at
   all.)

---

### F10 [MEDIUM] x402 routes have no per-payer rate cap; spam-pay vector unmitigated

**Files:** `routes/data.ts:82-116` (match-replay), `routes/data.ts:167-171`
(cohort-snapshot).

A paying attacker can request `/v1/data/match-replay/{id}` 60 times per
minute (or more — there's NO rate limit on x402-gated routes, even the
broken in-memory one) for $0.01 each = $36/hour. The cost is borne by
the attacker, so from a pure-economics view this is self-limiting.

However:
- Each call inserts an `x15_payment_attempts`-equivalent row at the
  facilitator level (depending on facilitator implementation; for
  `x402.org` it's logged in their settlement DB).
- Each call locks an EIP-3009 nonce on the USDC contract — a determined
  attacker could exhaust their own wallet's nonce space (256 bits, so
  realistically not a problem).
- For the API specifically, no DB rows are written on `/v1/data/*` (the
  data handlers return hash-derived stubs — `data.ts:82-116, 147-171`).
  So the actual abuse cost is bounded to Vercel function invocations.

**Severity:** Medium for now (testnet, stub data). Will become higher
when Phase 2 wires real underlying data (memory note: "Phase 1 returns
hash-derived stubbed samples"). A real cohort snapshot computed from a
join across `v2_tournaments` and `duel_runs` would be DB-expensive to
spam.

**Recommendation:** Add a per-(paying-wallet, route) rate limit on
x402 routes once the data tier has real backing.

---

### F11 [MEDIUM] x402 paymentMiddleware mounted on `'*'` — preflight + unrelated routes always cross the receiver-env check

**File:** `apps/api/src/app.ts:59`.

```ts
app.use('*', getX402Middleware());
```

The middleware itself is supposed to skip non-paywalled paths (see
`x402.ts:4-6` comment). But:
- The lazy build path runs on the FIRST request to ANY route. If that
  first request happens to be an unrelated GET (e.g., a health check,
  Stoplight loading `/openapi.yaml`), the build still runs and the
  receiver env is still required.
- The middleware is on the hot path for every request including OPTIONS
  preflights, OpenAPI doc fetches, and the `/` redirect to `/docs`. Even
  if the inner check is cheap, the wrapper adds overhead.

**Recommendation:** Mount the middleware on `/v1/data/*` instead of
`'*'`. This also fixes the global-failure mode in F4 — a receiver
misconfig only takes the paid tier down, not health checks.

---

### F12 [LOW] x402 receiver address only validated for hex shape; no on-chain checksum mismatch detection

**File:** `x402.ts:39-58`, `x402-client.ts:72-83`.

Both validate `0x` + 40 hex chars. The client-side wraps with
`getAddress()` for checksum (`x402-client.ts:82`); the middleware side
doesn't.

If an operator sets a non-checksummed address in env (e.g., all
lowercase), `x402.ts` accepts it unchanged. The downstream
`paymentMiddleware` will then include a non-checksummed `payTo` in the
402 challenge header. Most clients don't care (EIP-55 is
case-insensitive at the wire) but it makes ops debugging harder
("does that 402 challenge match my wallet?").

**Recommendation:** Add `getAddress(raw)` to `x402.ts:57` to checksum
on read. Cheap; no behavior change.

---

### F13 [LOW] No explicit DOS protection on cron secret leak; reconcile-duels and settle-tournaments retriggerable

**Files:** All six cron handlers in
`apps/orchestrator/src/app/api/cron/*/route.ts`. Auth pattern:
`isAuthorized(req)` checks `Authorization: Bearer ${CRON_SECRET}`.

If `CRON_SECRET` leaks (e.g., from a Vercel project pull, a build log,
or env-pull misconfig per the `vercel env pull` reference in memory):
- Attacker can hit `/api/cron/settle-tournaments` repeatedly. Each call
  invokes `runSettleTournaments()` which broadcasts settle txs (gas spend
  on settlement signer — likely STUDIO_PRIVATE_KEY).
- `runReconcileDuels` similarly broadcasts.
- No per-cron rate-limit; no replay-window check.

Mitigation factors (good):
- Cron is on Vercel orchestrator app, separate from public API.
- `force-dynamic` (`route.ts:14`, `reconcile-duels/route.ts:22`)
  prevents Vercel from caching the result.
- 401 on bad auth (line 24-26 of both files).

**Severity:** Low. CRON_SECRET leak is itself a high-severity event;
this is a secondary amplifier.

**Recommendation:** Pre-mainnet, add an idempotency guard at the cron
handler level — store last-run timestamp in `cron_runs` table (already
exists per `v2_20260507_cron_runs.sql`), refuse re-trigger if last
successful run is <N minutes ago.

---

### F14 [LOW] x402 paywall routes — no proof the payer's wallet identity matches API caller

**Files:** `data.ts:48-116, 118-171`. No header asserts a caller wallet
identity; the only auth signal is the EIP-3009 signature inside
PAYMENT-SIGNATURE.

A `Contract` (e.g., a multisig or 4337 smart wallet) could legitimately
sign and pay $0.01 to the receiver, but the *caller* of the API (the
EOA at the other end of the HTTP request) need not own the multisig. In
practice this matters less than for write endpoints (the data tier is
read-only), but it makes attribution claims sketchy:
- If `/v1/data/match-replay/{id}` is later used for purchase-tracking
  ("which agents have bought this replay?"), the on-chain `from` address
  is NOT a reliable proxy for the calling agent.

**Severity:** Low for now. Becomes relevant if data routes graduate to
write or stateful behavior.

**Recommendation:** When the data tier moves beyond stub responses, pair
the x402 payment with a SIWA-receipt header for caller identity.

---

## 4. Abuse Surface Inventory

| Vector | Auth required? | Cost to attacker | Cost to operator | Current mitigation | Gap | Severity |
|---|---|---|---|---|---|---|
| Spam SIWB nonce issuance | none | $0 | DB row writes, no limit | none | no rate-limit | Medium |
| Spam SIWB verify (burn nonces) | none | $0 | ECDSA verify CPU | nonce single-use | no rate-limit | Medium |
| Spam SIWA verify (burn nonces + base.dev fetch) | none | $0 | CPU + outbound API spend on `api.base.dev` | nonce single-use | no rate-limit, base.dev unbounded | Medium |
| Spam-submit T0 scores via `/v1/scores` | bearer JWT (24h) | $0 + valid JWT | gas on STUDIO wallet per submit | 60/min in-memory limit (per-wallet) | limiter per-instance only; N× bypass on Vercel | High |
| Spam-submit agent scores via `/v1/agents/scores` | SIWA + ERC-8128 | $0 + valid SIWA receipt | gas on STUDIO wallet per submit | 60/min in-memory limit (per-agent) | limiter per-instance only; N× bypass | High |
| Spam `/v1/agents/matches/start-solo` | **NONE** | $0 | $1.05 USDC/call from AGENT wallet + gas + Anthropic spend | IP-keyed 60/min in-memory limiter | unauth + spoofable IP + per-instance limit | **Critical** |
| Spam-pay $0.01 to `/v1/data/match-replay` | x402 payment | $0.01/call from attacker | Vercel invocation cost only | none | self-limiting (attacker pays) | Low |
| Spam-pay $0.10 to `/v1/data/cohort-snapshot` | x402 payment | $0.10/call | Vercel invocation + (Phase 2) DB query cost | none | will need limit when real data lands | Medium (P2) |
| Replay valid x402 PAYMENT-SIGNATURE header | n/a | $0 | $0 (USDC contract enforces nonce idempotency) | EIP-3009 `(from, nonce)` rejection at USDC contract | ✅ | Mitigated |
| Replay valid SIWA receipt (24h TTL) | n/a | $0 | per-call CPU until receipt expires | ERC-8128 per-request sig at write endpoints | ✅ for writes; reads not gated | Low |
| Forge x402 facilitator response | requires facilitator-side compromise | n/a | x402_settled rows written without actual on-chain settlement | API trusts response `transaction:` field | F3 — no on-chain receipt verification | High |
| DOS cron via leaked CRON_SECRET | CRON_SECRET | $0 (post-leak) | unbounded settle/reconcile re-triggers | bearer-token auth only | F13 — no idempotency guard | Low (secondary to leak) |
| Misuse `/v1/agents/profile` PATCH to grow in-memory map | SIWA receipt | $0 | per-instance memory leak | none | F: no rate-limit + in-memory store | Low |
| Fake `X402_RECEIVER_ADDRESS` (env-write attack) | env access | n/a | redirect funds to attacker wallet | hex-shape validation only | F9 — no role-distinct check | Medium (gated on env access) |

---

## 5. Cross-references for the audit report

| Finding | Related memory note |
|---|---|
| F1 (rate-limit) | project_phase2_nonce_store_unify (Upstash migration window) |
| F2 (unauth route) | none |
| F3 (no receipt verify) | x402 server-only install pattern (lazy-init OK; but downstream verify missing) |
| F5 (schema drift) | project_x15_8_payment_attempts_schema_lock (X15.5 apex rename PR OPEN; v4_20260515b applied to clizuq... but not in this branch) |
| F7 (no refund) | project_x15_chargeretryfee_first_paid_retry_race (Run 1 race documented; manual reconcile only) |
| F9 (receiver isolation) | project_x15_agent_wallet_split (canonical split), reference_secret_handling_split (wallet keys founder-only) |
| F11 (global mount) | x402 server-only install pattern (lazy-init); reference_apps_api_prebuilt_deploy_only (single-function topology) |
| F13 (cron secret) | project_tournaments_sprint_pre_task9 (CRON_SECRET reminder) |

---

## 6. Pre-mainnet blocker recommendations (ordered)

1. **F1 + F2** — Rate-limit must move to Upstash AND `/v1/agents/matches/start-solo` must require auth before mainnet routes a single real-USDC tournament. These two together are the difference between "demo-grade abuse risk" and "cost of $XXX/hour to drain operator wallets."
2. **F3** — On-chain receipt verification of every facilitator settle response. Catches malicious-facilitator scenarios that today are invisible.
3. **F5** — Schema-vs-code reconciliation. Either land the missing `v4_20260515b` migration in this branch or rewrite the code to match the two-column model. CI integration smoke against a live DB.
4. **F4** — Scope x402 middleware to `/v1/data/*` only; convert env-unset error to a tagged 503.
5. **F6** — Reconciliation cron for orphan payment-attempt rows.
6. **F7** — Operator runbook for manual refunds; dispute endpoint for users; long-term automation in X16.
7. **F9** — Wallet registry update; startup-time role-distinct assertion.

Findings F8 (amount semantics), F10 (x402 spam-pay), F11 (mount scope),
F12 (checksum), F13 (cron idempotency), F14 (caller-identity for x402)
are smaller surface and can land alongside or after the headline four.
