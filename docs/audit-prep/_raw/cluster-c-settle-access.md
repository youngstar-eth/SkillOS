# Cluster C — Cron Settle Pipeline + apps/api Write-Path Access Control

**Audit scope:** apps/orchestrator cron entries, packages/duel-backend cron logic (the real work behind the orchestrator routes), apps/api routes (auth requirements), middleware (bearer / agent-auth / errorEnvelope), wallet topology, idempotency, and post-YC paid-retry broadcast reliability.

**Method:** static read of every file under apps/orchestrator/src/app/api/cron/\*, apps/api/src/{routes,middleware,lib/contracts-vendored}/\*, packages/duel-backend/src/cron/\*, packages/lib-shared/src/{rpc,attestation}.ts. Cross-referenced memory claims (issue #79, X9 silent-swallow, X15.3 wallet split) against the on-disk source. No code changes.

**Working tree:** `/Users/inancayvaz/MAS/.claude/worktrees/ur-track-b-offchain` (ur-track-b-offchain worktree).

**Memory verification headline:**
- Memory item `project_settle_tournaments_silent_swallow_phase2` claims a `TournamentAlreadySettled` substring-match swallow at `apps/api/src/routes/tournaments.ts ~line 739`. **REFUTED.** `apps/api/src/routes/tournaments.ts` is 279 lines total (verified via `wc -l`); there is no line 739. The substring-match swallow actually lives at **`packages/duel-backend/src/cron/tournaments.ts:977`** inside `settleOneTournament`. The memory entry is mis-pathed — same pattern, wrong file. The apps/api `routes/tournaments.ts` is read-only (three GET handlers — list / get / leaderboard); it has no settle path and no substring-match catch anywhere. Memory should be updated to point at the cron package file. See Finding C-2 for the actual surviving instance.

---

## Cron Routes Audit (apps/orchestrator)

Schedule source: `apps/orchestrator/vercel.json`. All routes are GET, run on the Node.js runtime, are `force-dynamic`, and gate behind the same `isAuthorized()` helper.

| Cron path | File:line of guard | Method | Auth check | Schedule (UTC) | Maximum duration | State touched |
|---|---|---|---|---|---|---|
| `/api/cron/create-tournaments` | `apps/orchestrator/src/app/api/cron/create-tournaments/route.ts:14-22` (`isAuthorized`), called at `:25` | GET | `Bearer ${CRON_SECRET}` against `authorization` header (`===` string compare); dev fallback allows unauthenticated if `NODE_ENV !== 'production'` and `CRON_SECRET` missing | `0 0 * * *` | 120s | USDC.approve(TournamentPoolV2, MAX), USDC.balanceOf preflight, `TournamentPool.createTournament` × 6 daily (+ 6 on Monday), `v2_tournaments` UPSERT |
| `/api/cron/settle-tournaments` | `apps/orchestrator/src/app/api/cron/settle-tournaments/route.ts:16-22`, called at `:25` | GET | Same as above | `5 0 * * *` | 300s | `v2_cron_runs` lock, batch-read on-chain state via Multicall3, `flagScore` per implausible entry, `settle` × pending tournament count, `v2_tournaments` UPDATE, `v2_tournament_entries` UPSERT, SP-award side effects |
| `/api/cron/index-sponsor-events` | `apps/orchestrator/src/app/api/cron/index-sponsor-events/route.ts:20-27`, called at `:30` | GET | Same as above | `15 0 * * *` | 60s | `v2_sponsor_events` writes (indexer) |
| `/api/cron/index-tournaments-created` | `apps/orchestrator/src/app/api/cron/index-tournaments-created/route.ts:20-27`, called at `:30` | GET | Same as above | `23 0 * * *` | 60s | `v2_tournaments` UPDATE (backfills creation_tx_hash/creator_address when null) |
| `/api/cron/reconcile-duels` | `apps/orchestrator/src/app/api/cron/reconcile-duels/route.ts:24-30`, called at `:33` | GET | Same as above, plus `?dryRun=1` query parameter for non-mutating execution | `13 1 * * *` | 300s | Stuck `v2_duels` row sweep; may broadcast settle() per stuck duel |
| `/api/cron/anchor-sp-snapshot` | `apps/orchestrator/src/app/api/cron/anchor-sp-snapshot/route.ts:50-56`, called at `:59` | GET | Same as above | `7 2 * * *` | 60s | `v2_sp_snapshots` INSERT, `SkillbaseAnchor.anchorSnapshot` tx, UPDATE with confirmed tx hash |

**All six cron entries** implement the same guard pattern and refuse unauthenticated requests in production. **No missing guards.**

Identical guard implementations also mean identical weaknesses (see Finding C-1 timing leak, Finding C-7 missing-secret fallback semantics in prod).

---

## Access Control Matrix (apps/api Routes)

Source: `apps/api/src/app.ts` (route registration order, global middleware order) cross-referenced with each route module.

Global middleware order (`app.ts:22-59`):
1. `requestId()` — sets X-Request-Id header (no auth effect)
2. `cors({ origin: '*' })` — open CORS, exposes Authorization/payment headers
3. `getX402Middleware()` — applied with `app.use('*', ...)` but **self-scopes** to paths registered in `lib/x402.ts` (currently `/v1/data/match-replay/:id` and `/v1/data/cohort-snapshot`); falls through to `next()` for everything else.

Per-route `.use()` middleware order is registered immediately before the matching `.openapi()` handler in each file.

| Method + Path | File:line | Auth requirement | Modifies (DB / on-chain) | Bypass surface |
|---|---|---|---|---|
| `POST /v1/auth/siwb/nonce` | `apps/api/src/routes/auth.ts:42-53` | none (issues nonce by design) | `siwb_nonces` table INSERT (or REPLACE on existing wallet's outstanding nonce) | none |
| `POST /v1/auth/siwb/verify` | `apps/api/src/routes/auth.ts:85-152` | nonce + signature self-validating | `siwb_nonces` consume, JWT issued | none |
| `POST /v1/auth/siwa/nonce` | `apps/api/src/routes/auth-siwa.ts:63-92` | none (issues nonce) | `skillos_siwa_nonces` INSERT | none |
| `POST /v1/auth/siwa/verify` | `apps/api/src/routes/auth-siwa.ts:124-172` | nonce + SIWA sig + onchain ownerOf | `skillos_siwa_nonces` consume, receipt issued; outbound fetch to api.base.dev | none |
| `GET /v1/tournaments` | `apps/api/src/routes/tournaments.ts:93-134` | none (read) | none | n/a (read) |
| `GET /v1/tournaments/{id}` | `apps/api/src/routes/tournaments.ts:163-199` | none (read) | none | n/a (read) |
| `GET /v1/tournaments/{id}/leaderboard` | `apps/api/src/routes/tournaments.ts:226-279` | none (read) | none | n/a (read) |
| `GET /v1/scores/{wallet}` | `apps/api/src/routes/scores.ts:73-121` | none (read) | none | n/a (read) |
| **`POST /v1/scores`** | `apps/api/src/routes/scores.ts:174-258` | `requireBearer()` (SIWB JWT, HS256, 24h) — registered at `scores.ts:174` | Broadcasts `submitSoloScore` on-chain with STUDIO_PRIVATE_KEY signature; on-chain state of TournamentPoolV2.1 mutated | **Per-wallet rate-limit guards 60 req/min via `check()` in-memory bucket** — no other bypass; `tier !== 'T0'` returns 400 early |
| `GET /v1/sponsors/{wallet}/receipts` | `apps/api/src/routes/sponsors.ts:61-108` | none (read) | none | n/a (read) |
| **`POST /v1/agents/scores`** | `apps/api/src/routes/agents.ts:74-161` | `requireSiwaAuth()` (SIWA receipt + ERC-8128 per-request sig) — registered at `agents.ts:73` | Broadcasts `submitSoloScore` with STUDIO key, agent address as player | 60 req/min per agent address |
| **`PATCH /v1/agents/profile`** | `apps/api/src/routes/agents.ts:202-217` | `requireSiwaAuth()` — registered at `agents.ts:201` | **In-memory `profileStore: Map` (process-local, not durable across restarts)** | Comment at line 167 acknowledges X4.5 will swap to Supabase. Today's state means redeploy wipes all stored profiles |
| **`POST /v1/agents/matches/start-solo`** | `apps/api/src/routes/agents-matches.ts:71-149` | **NONE** | `duel_runs` row reservation, `x15_payment_attempts` INSERT, schedules background `waitUntil` orchestration that performs x402 settlement + on-chain `chargeRetryFee` | Per-IP rate-limit only (`agent-matches-start-solo:${ip}` bucket, 60/min); IP derived from `x-forwarded-for` first hop (header spoofable). **Note:** `start-solo` is intentionally NOT in the x402 paywall map per the comment at `lib/x402.ts:107-122` because the agent (not the spectator) is the payer; the handler settles x402 internally inside the background worker. |
| `GET /v1/data/match-replay/{id}` | `apps/api/src/routes/data.ts:82-116` | **x402 (paymentMiddleware)** — registered globally at `app.ts:59`, scoped to this path in `lib/x402.ts` | none (returns stubbed sample data) | If `X402_RECEIVER_ADDRESS` env unset, middleware factory **throws on construction** (`lib/x402.ts:48-50`) — handler unreachable |
| `GET /v1/data/cohort-snapshot` | `apps/api/src/routes/data.ts:167-171` | x402 — same as above | none | same as above |
| `GET /v1/health` | `apps/api/src/routes/health.ts:27-38` | none (liveness) | none | n/a |
| `GET /openapi.json`, `GET /openapi.yaml`, `GET /docs`, `GET /` | `app.ts:119-181` | none | none | n/a |

**Critical state-modifying paths discovered with weakened or zero authentication:**
1. `POST /v1/agents/matches/start-solo` — unauthenticated; per-IP rate-limit only. Spends `AGENT_PRIVATE_KEY` x402 USDC on every request. See Finding C-3.
2. `PATCH /v1/agents/profile` — authenticated, but writes to **process-memory map** that is wiped on each Vercel function cold start. Functionally a no-op as durable storage. See Finding C-8.

---

## Findings

### C-1 — Cron secret string-equality compare (low severity, defense-in-depth)

**Severity:** Low (timing-attack viability against a 32-byte cron secret is negligible; flag for posture).
**Files:** `apps/orchestrator/src/app/api/cron/{settle-tournaments,reconcile-duels,create-tournaments,anchor-sp-snapshot,index-tournaments-created,index-sponsor-events}/route.ts` — line 21 in each (`return req.headers.get("authorization") === \`Bearer ${secret}\`;`).

All six cron route guards use vanilla JavaScript `===` to compare the Authorization header with `Bearer ${CRON_SECRET}`. Compare with `packages/duel-backend/src/api/admin/flags.ts:79` and `…/admin/reconcile.ts:165`, which both use `node:crypto.timingSafeEqual` for the analogous admin-token compare.

`===` short-circuits on the first byte mismatch, leaking a CPU-time signal proportional to the length of the matching prefix. With a 32-byte high-entropy `CRON_SECRET` over the public internet (Vercel edge → orchestrator function, network jitter ≫ per-byte timing delta) the timing channel is not practically exploitable. The finding is included for two reasons:

1. **Internal consistency** — the same codebase already has a constant-time comparator in duel-backend; reusing it for cron entry is a one-line lift.
2. **Pre-audit posture** — external reviewers (e.g., the Sprint X9 auditor in memory) will flag the inconsistency on first pass; pre-empt the back-and-forth.

**Recommendation:** Lift the comparator into `packages/lib-shared` or a shared `apps/orchestrator/src/lib/auth.ts` helper that uses `timingSafeEqual` after a constant-time length check, then call it from each of the six route guards. Single-PR change.

---

### C-2 — Settle silent-swallow at packages/duel-backend/src/cron/tournaments.ts:977 (medium severity)

**Severity:** Medium (verified; isolated to the documented idempotency case but pattern is fragile).
**Files:** `packages/duel-backend/src/cron/tournaments.ts:977` (the actual location). Memory pointed at the wrong file — see headline.

The relevant code:
```
} catch (err) {
  const msg = err instanceof Error ? err.message : "unknown";
  if (msg.includes("TournamentAlreadySettled")) {
    // Idempotent: someone else already settled.
    …mark DB settled but leave settle_tx_hash null…
    result.skipped.push({ dbId: t.id, reason: "already settled on-chain" });
    return;
  }
  throw new Error(`settle: ${msg}`);
}
```
This is the *exact* substring-match anti-pattern that the X9 createTournament fix replaced with selector-based `decodeRevertErrorName()` (`tournaments.ts:194-203`, reused at `:480-481`). The class of bug is:

- viem's `err.message` includes ABI metadata, function names, arg lists, and other contextual strings.
- A revert from an unrelated call site whose error context happens to contain the literal `"TournamentAlreadySettled"` (for example, an upstream multicall introspection that decodes the ABI and includes all error names in a diagnostic) will be silently swallowed as "already-settled" and the cron will mark the DB `settled_at` non-null **without ever broadcasting a real settle**.
- Memory entry `project_settle_tournaments_silent_swallow_phase2` cites this risk; the in-file comment at `tournaments.ts:192-193` explicitly acknowledges "Phase 2 backlog" status of this remediation.

Also worth noting: the *failure mode* is asymmetric — false-positive (swallow a genuine revert as already-settled) is the dangerous direction because it marks the DB as settled when no on-chain settlement occurred. A subsequent verify-on-chain run will detect the divergence (DB says settled, contract says not), but only on a reconcile sweep, not at write time.

Two sub-points reinforce the urgency:
1. `settle-guard.readSettleGuardBatch` runs the pre-flight multicall (`tournaments.ts:777-780`) and pre-skips already-settled tournaments via a structured `reason === 'already_settled'` check (`tournaments.ts:855`) that does **not** rely on substring matching. The substring-match path at line 977 is only hit when the multicall returns "OK to settle" but the broadcast tx still reverts — i.e., a tight race window between the pre-flight and the broadcast. That window is bounded by the multicall→broadcast latency, but it exists.
2. The settle-guard pre-flight uses `getTournament(id).settled` from on-chain state to compute the `reason: 'already_settled'` verdict (`packages/duel-backend/src/cron/settle-guard.ts:7` references the classification). That code path is already a structured decode and demonstrates the team knows the substring approach is wrong.

**Recommendation:** Replicate `decodeRevertErrorName` (`tournaments.ts:194`) inside the settle catch block at line 977. Change `if (msg.includes("TournamentAlreadySettled"))` to `if (errorName === "TournamentAlreadySettled")`. Single-line semantic change, no behavioural side effects for the happy path. Add a unit test that simulates a non-revert error whose `.message` contains the substring (mocked viem error or wrapped RPC failure with embedded error context) and asserts the catch falls through to `throw`. The auditor will assess this as a low-cost X9 follow-up that the team already knew about and would resolve before mainnet.

---

### C-3 — `POST /v1/agents/matches/start-solo` is unauthenticated and spends agent-controlled USDC (high severity)

**Severity:** High (open endpoint moves real funds — testnet today, but the trust posture itself is the audit issue).
**File:** `apps/api/src/routes/agents-matches.ts:71-149`.

The route declaration:
```
agentMatchesRoutes.openapi(startSoloRoute, async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? …;
  const limited = rateLimit(`agent-matches-start-solo:${ip}`);
  …
  // Reserve duel_runs row, insert x15_payment_attempts pending row, return 202.
  // Background waitUntil() then performs:
  //   - settleX402Payment() (sends USDC out of AGENT_PRIVATE_KEY's wallet)
  //   - chargeRetryFeeIfRequired() (broadcasts an on-chain tx with AGENT_PRIVATE_KEY)
  //   - runSoloMatch() (game loop + submitSoloScore at end)
});
```
The handler has zero authentication middleware. Module-top comment at `agents-matches.ts:6-7` is explicit: "Public (no auth) for the testnet demo era; X21 adds SIWA + matchmaker queue routes."

What an unauthenticated caller can trigger per request:
- One row in `duel_runs` reserved (DB cost).
- One row in `x15_payment_attempts` inserted (DB cost).
- One **x402 USDC settlement** out of the agent's x402 receiver float (the agent's wallet → server's `X402_RECEIVER_ADDRESS`). Amount per `X402_PRICES.agentMatchRetry`: $1.05 (1,050,000 USDC base units, `apps/api/src/lib/x402.ts:32`).
- One **on-chain `chargeRetryFee` tx** (gas + USDC fee) if `priorSolo > 0` for the configured demo tournament.
- A full `runSoloMatch` game loop in the background worker (DB writes + final `submitSoloScore` tx with STUDIO key).

The rate limiter caps this at **60 requests per minute per IP** based on `x-forwarded-for` (`agents-matches.ts:73-76`). The first hop of `x-forwarded-for` is a client-controllable header — Vercel does override it at the edge with the actual client IP, but the bucket key is still per-IP, not per-authenticated-identity. A modest distributed scrape from a botnet can drain the AGENT wallet's testnet USDC float in minutes.

Today this is testnet ($1.05/run on Base Sepolia USDC funded by the team), so the **direct dollar loss** is bounded by the AGENT wallet's testnet float. **Pre-mainnet**, this route flips into a hot path: mainnet USDC at $1.05/req with no caller identity is an open-checkbook endpoint. Even on testnet, a malicious caller can:
- Cycle the AGENT wallet to zero balance, creating a "match3 chronic"-style outage (cf. memory `project_match3_chronic_and_510_outage_post_yc`) for legitimate users.
- Generate noise in `duel_runs`/`x15_payment_attempts` that interferes with operator review queues (`needs_manual_review: true` rows after settlement failures, `agents-matches.ts:322`).

Beyond the unauthenticated nature, the handler has a separate concern: it does **NOT verify** that the agent address actually exists in the registry or is owned by the caller. `reserveSoloRun({ game })` derives the agent address internally; the caller has no say. So the abuse vector is *not* "impersonate an agent" — it's "drain the operator's float by triggering legitimate-looking agent runs from arbitrary callers."

**Recommendation:** Two-step.
1. **Pre-mainnet hard requirement:** require `requireSiwaAuth()` (or a lighter `requireSiwaReceipt()` if ERC-8128 per-request sig is too heavy for the spectator UX). The middleware fits the existing pattern at `agents.ts:73, 201`. Bucket key becomes `agent-matches-start-solo:${agentAddress}` instead of per-IP, which also restores the documented 60-req/min cap to its intended semantic.
2. **Defense-in-depth:** add a server-side **AGENT wallet USDC balance pre-flight** mirroring the X9.1 sponsor preflight at `packages/duel-backend/src/cron/tournaments.ts:273-309`. Drop the request with a structured 503 when the AGENT float is below `2 × X402_PRICES.agentMatchRetry` (one in-flight + one buffer). This implements the same RCA pattern the team already adopted for the sponsor wallet.

Memory item: `project_phase2_mainnet_blocker_plausibility` already gates real-USDC tournaments behind a separate T1+ plausibility blocker; the X3 finding here adds **auth on /v1/agents/matches/start-solo** to that pre-mainnet checklist.

---

### C-4 — Settle iteration touches a single STUDIO wallet as signer, broadcaster, AND sponsor funder (medium severity — wallet-conflation)

**Severity:** Medium (canonical role registry exists, but the cron path conflates them).
**Files:**
- `packages/lib-shared/src/rpc.ts:54-68` — `getWalletClient()` builds a single wallet client using `getSignerAccount()`.
- `packages/lib-shared/src/attestation.ts:30-31, 38` — `getSignerAccount()` reads `STUDIO_PRIVATE_KEY`.
- `packages/duel-backend/src/cron/tournaments.ts:329-331` — `runCreateTournaments` derives `sponsor = walletClient.account?.address`, i.e., the STUDIO address.
- `packages/duel-backend/src/cron/tournaments.ts:962-970` — `settleOneTournament` broadcasts `settle()` using the same `walletClient` (STUDIO key).
- Memory `project_x15_agent_wallet_split` documents the intended split: STUDIO (trustedSigner + submitSoloScore), AGENT (chargeRetryFee), X402_RECEIVER (x402 float).

The intended Sprint X15.3 wallet split keeps **AGENT** distinct from **STUDIO**. But on the orchestrator/cron path:

- `runCreateTournaments` uses STUDIO as **the sponsor that funds the prize pool** (USDC.approve + ERC20 balance preflight read `balanceOf(sponsor)`, `tournaments.ts:289-294`). So STUDIO is **both** trustedSigner **and** prize-funder.
- `runSettleTournaments` uses STUDIO as the **broadcaster of `settle()` and `flagScore()`**. So STUDIO is also the cron broadcaster — not just the attestation signer for solo submits.
- `anchor-sp-snapshot/route.ts:111-118` calls `wallet.writeContract` with the STUDIO wallet (no separate snapshot key).

The X9.1 preflight at `tournaments.ts:273-309` correctly catches sponsor (= STUDIO) burndown for the create path. **But** the same burndown affects settle: a depleted STUDIO USDC balance does not block settle (settle pays gas, not USDC), but a depleted STUDIO **ETH** balance breaks settle (and create, and anchor). There is no ETH-balance preflight anywhere in the cron pipeline.

Concretely: iteration N of `runSettleTournaments` exhausts STUDIO's ETH float during gas spikes; iteration N+1 reuses STUDIO without checking and burns through the in-flight nonce slots (the in-memory NonceManager at `cron/nonce-manager.ts` allocates nonces optimistically), leaving every settle in the sweep stuck in mempool until the operator tops up. The pre-mainnet runbook needs an explicit ETH-balance preflight equivalent to the USDC one.

**Wallet topology mapped per current code:**
| Wallet (env var) | Roles | Used by |
|---|---|---|
| `STUDIO_PRIVATE_KEY` | trustedSigner (attestations); broadcaster for `submitSoloScore`; broadcaster for `createTournament`, `settle`, `flagScore`, `anchorSnapshot`; sponsor / prize-pool funder for daily/weekly tournaments | apps/api `submitSoloScore`; all crons via `lib-shared.getWalletClient` |
| `AGENT_PRIVATE_KEY` | Broadcaster for `chargeRetryFee`; payer of x402 USDC for agent retries | apps/api `chargeRetryFee` (via `lib/duel/charge-retry-fee.ts`) and `lib/x402-client.ts` |
| `X402_RECEIVER_ADDRESS` | Receives x402 settlements (no key on server — receive-only) | x402 paymentMiddleware (`lib/x402.ts:44-50`) |
| `feeVault` (rotated to `0x455536e4…` per memory `project_x19b_fee_vault_separated`) | Off-chain receiver for ChallengeEscrow fees | ChallengeEscrow contract only — no orchestrator-side key |

**Receivers in a single settle iteration:** ranking participants (USDC prize transfers internal to `settle`), `flagScore` target addresses (no funds, on-chain flag bit), SP-award (off-chain DB only).

**Concurrent-run mutex:** `v2_cron_runs` unique-key lock (`packages/duel-backend/src/cron/run-lock.ts:66-96`) protects against **two settle runs in the same minute window**. The lock granularity is 1 minute (`currentMinuteWindow`). **Manual triggers** within the same minute as a Vercel-fired run will lose the race and exit with `lockSkipped: true`. **Different-cron** runs (settle + reconcile-duels) do NOT share a lock; they use distinct `cron_name` values (`tournaments.ts:692`, `reconcile-duels` uses its own name). This is correct — different crons doing different work — but reconcile-duels *also* broadcasts `settle()` for stuck Accepted-with-both-scores rows (route module comment at `reconcile-duels/route.ts:16-18`), so the lock partition is not fully isolating broadcast targets.

**Recommendation:**
1. Add a STUDIO **ETH-balance** preflight at the start of `runSettleTournaments` (and `runCreateTournaments`) modeled on `preflightSponsorBalance` — threshold = `gas estimate × pending count × safety factor`. Throw a structured error on insufficient balance.
2. Split STUDIO's roles formally: settle/flag broadcaster as a third key (`SETTLE_BROADCASTER_PRIVATE_KEY`), distinct from the attestation signer. This is a bigger lift but it's what the X15.3 wallet-split memory intends; the cron path lags the apex path. At minimum, audit-prep posture should *acknowledge* this conflation explicitly in the audit scope.
3. Make `runSettleTournaments` and `runReconcileDuels` share the same `cron_name` lock when both are touching `settle()`. Or, lock per-tournament-id with a unique-key insert into a `v2_settle_attempts` table.

---

### C-5 — Settle iteration order × wallet depletion (match3 chronic, verified) (informational — fix already shipped, with caveats)

**Severity:** Informational (RCA closed per memory; verify the fix locations and idempotency).
**Files referenced:**
- `packages/duel-backend/src/cron/tournaments.ts:78-86` — `TOURNAMENT_GAMES` order: `["2048", "wordle", "sudoku", "minesweeper", "clicker", "match3"]` (memory contradicts: "match3 is first to be unfunded as balance depletes" at `tournaments.ts:265-266` but iteration as written iterates in declared order so match3 IS LAST; the *fix comment* on the same line acknowledges "first to be unfunded" — confusingly worded but consistent with "last to broadcast, first to revert when balance depletes").
- `packages/duel-backend/src/cron/tournaments.ts:273-309` — `preflightSponsorBalance` exported function (the X9.1 fix).
- `packages/duel-backend/src/cron/tournaments.ts:386-393` — call site inside `runCreateTournaments`.

**Verified:**
- Iteration order is deterministic by source-order of `TOURNAMENT_GAMES`. With match3 last in the list, it's the last to attempt `createTournament` per sweep; if sponsor USDC depletes mid-sweep, match3 is the first to revert with `ERC20InsufficientBalance` (rendered downstream as the X9 strict `TournamentCreateError`).
- The X9.1 preflight check **halts the whole iteration before any broadcasts** (throw at the top means none of the targets run if the total need exceeds balance). This is the correct behavior — fail loud at the top, retry next tick.
- The X9.1 preflight runs **only inside `runCreateTournaments`** (`tournaments.ts:386`). It is NOT replicated inside `runSettleTournaments`. Settle is paid in **gas**, not USDC (the prize pool is funded at create-time), so a USDC preflight on settle would be moot. But — see Finding C-4 — there is no gas/ETH preflight either. A drained STUDIO ETH balance during settle silently no-ops the sweep at the broadcast layer.
- **Reservation/lock for the iteration's duration:** the preflight does *not* lock USDC for the upcoming `createTournament` calls. A parallel `runCreateTournaments` from a manual trigger (different minute window) or an admin sponsorship deposit happening mid-loop could drift the balance under the preflight's snapshot. The `v2_cron_runs` lock (1-minute window) prevents parallel runs of *this specific cron* in the same minute, but **NOT** other call paths that consume USDC from the same wallet (e.g., manual `cast send` of `USDC.transfer` by an operator). For a single-author operator team this is a non-issue; for an audit story this is a "reservation invariant" gap.

**Iteration determinism vs. failure-smearing trade-off:** the team chose deterministic order over randomization. This is the right call — randomization would smear the failure across games and complicate RCA (memory `project_match3_chronic_and_510_outage_post_yc` shows how iteration-order-aware RCA was useful). The preflight-then-halt design lets the operator find the burn in a single log line instead of chasing per-game reverts.

**No action required.** This is included to confirm verification for the audit pack.

---

### C-6 — Settle idempotency: on-chain idempotent, DB race window present (medium severity)

**Severity:** Medium (race window exists; mitigated by lock-skip semantics, not eliminated).
**Files:**
- `packages/duel-backend/src/cron/tournaments.ts:687-728` — `v2_cron_runs` lock acquire/release wrapping the sweep.
- `packages/duel-backend/src/cron/tournaments.ts:962-989` — settle tx broadcast and post-update of `v2_tournaments.settled_at + settle_tx_hash`.
- `packages/duel-backend/src/cron/tournaments.ts:855-864` — pre-flight already-settled path that ALSO writes `settled_at` from DB.

**Sequence of writes in the happy path:**
1. Multicall pre-flight reads `getTournament(id).settled` → false (`tournaments.ts:777-780`).
2. Broadcast `settle(onChainId, ranking)` (line 962).
3. Wait for receipt with 60s timeout (line 971-974).
4. UPDATE `v2_tournaments` set `settled_at = now, settle_tx_hash = settleHash` (line 998-1004).
5. Best-effort SP awards across ranking (line 1030-1048).

**Race windows:**

(a) **Between step 3 and step 4:** if the function process is killed between receipt-confirmed and the DB UPDATE, the on-chain state shows settled but `v2_tournaments.settled_at` is still NULL. Next cron tick will:
- Re-fetch this row (pending criteria match).
- Multicall pre-flight returns `reason: 'already_settled'` (line 855).
- The pre-flight path writes `settled_at = now` and pushes `skipped: 'on-chain already settled (pre-flight)'` (line 856-865). **Recovery is automatic**, but `settle_tx_hash` ends up NULL in the DB row because the recovery path doesn't fetch the original tx hash.
- **Audit implication:** for tournaments recovered via this path, the on-chain audit trail is intact but the DB-side `settle_tx_hash` column is permanently null. The audit story requires looking at `getSettleEvent` on-chain to recover the hash. Acceptable for forensics but degraded for dashboards.

(b) **Between step 1 (pre-flight multicall) and step 2 (broadcast):** if a third party broadcasts `settle()` for the same id in the window between pre-flight and our broadcast, our `walletClient.writeContract` will revert at the contract level. The catch at line 975-989 handles it via the **substring-match** swallow path described in C-2. The window is short (single block + RPC roundtrip) but non-zero.

(c) **Two concurrent runs (Vercel platform retry + manual `curl`):** the `v2_cron_runs` lock at line 687-700 short-circuits one of them with `lockSkipped: true`. **Verified:** the lock is acquired at *function entry*, before any DB reads or broadcasts; the unique-key insert provides strong serialization. This is correctly implemented.

(d) **The lock window is 1 minute (`currentMinuteWindow` truncates `setUTCSeconds(0, 0)`).** If `runSettleTournaments` takes longer than 1 minute (possible given `maxDuration: 300`), the next minute's cron tick can acquire the lock for that next minute and run in parallel with the slow first run. The team's mitigation is the `force-dynamic` + 300s maxDuration combination + p-limit(5) concurrency; in practice the sweep completes within ~30s for the typical pending-count, but **under load (post-mainnet)**, parallel overlapping runs become possible. The lock's granularity is the audit gap.

**Recommendation:**
- Extend the lock granularity from "1-minute window" to "cron_name as singleton-while-running": insert a `started_at` row at function entry, delete it at function exit, and `acquireCronLock` should `SELECT … WHERE completed_at IS NULL`. The current best-effort `releaseCronLock` (lines 717-727 in tournaments.ts, body at `run-lock.ts:104-114`) is reactive cleanup; rotating to "must-not-overlap regardless of window" is a stronger invariant.
- On the pre-flight recovery path at line 856-865, backfill `settle_tx_hash` from on-chain logs (one `getLogs` call filtered by `topic[1] = onChainId`). This is the same Blockscout-based forensic recovery pattern the team already used in X9 per memory `project_match3_5_13_audit_backfill_x9_forensic`.

---

### C-7 — Cron auth degrades in production if `CRON_SECRET` is unset (low severity, posture)

**Severity:** Low (production deploy should fail loudly; included for completeness).
**Files:** Lines 18-19 in each of the six cron `route.ts` files.

```
if (!secret) {
  return process.env.NODE_ENV !== "production";
}
```

If `CRON_SECRET` is **unset** in the prod environment, the guard refuses all requests (returns `false`). If `CRON_SECRET` is **unset** in any non-prod environment, the guard accepts all requests unauthenticated. The semantics are correct for the documented intent. But:

- There is no startup-time check that `CRON_SECRET` is present in production. Vercel preview/prod env var management is the line of defense.
- A misconfigured deploy where `NODE_ENV` is not "production" (e.g., a preview deployment that mints transactions against the same on-chain TournamentPool) would accept unauthenticated cron triggers. Today this is the case if a developer hits a preview URL's `/api/cron/settle-tournaments` without the bearer header — the preview env happily settles tournaments. This is the same Base Sepolia contract the production cron writes to; nothing distinguishes "prod cron run" from "preview cron run" at the contract level.

**Recommendation:**
- Add a startup-time invariant in `apps/orchestrator` that throws if `CRON_SECRET` is missing AND `BASE_SEPOLIA_RPC_URL` points at the same chain the production wallet is on. Preview deploys should either share `CRON_SECRET` with prod (with rotation policy) or be flipped to a separate dev contract.
- Memory item `reference_vercel_env_sensitive_default` notes that sensitive-by-default vars don't pull back through `vercel env pull`; ensure this preflight runs at function cold-start, not at build time.

---

### C-8 — `PATCH /v1/agents/profile` writes to in-memory map; persists nothing (medium severity — feature broken)

**Severity:** Medium (auth is correct; storage is wrong).
**File:** `apps/api/src/routes/agents.ts:177` — `const profileStore = new Map<number, AgentProfile>();`

The agent profile store is a module-level `Map`. Vercel functions cold-start at the slightest provocation (deploy, idle timeout, function code change, region failover). Every cold start wipes this Map. The route's own comment at `agents.ts:166-168` ("X4 v0.1: in-memory store keyed by agentId. Process-local, not durable across restarts. Sufficient for SIWA + ERC-8128 smoke; X4.5 swaps to Supabase-backed table `skillos_agent_profiles`.") acknowledges this.

**Audit framing:** this is not an access-control vulnerability — `requireSiwaAuth()` is correctly registered (line 201). But it is a state-modifying authenticated endpoint that **does not modify durable state**. From an audit perspective, the OpenAPI contract advertises a PATCH that "updates" a profile; clients have no way to distinguish "their write succeeded" from "the function cold-started and forgot." This will surface as user-facing data loss bug reports the moment X4.5 is delayed.

**Recommendation:** Ship the X4.5 Supabase migration before mainnet. The audit pack should note this as "documented v0.1 known-limitation" if the team chooses to mark it `wontfix` for the audit window, OR migrate before the audit. The cleanest framing for external auditors: have a single PR ready that swaps the Map for `skillos_agent_profiles` table reads/writes; the auditor will see "active development on this surface" and adjust their risk weighting.

---

### C-9 — Error envelope leakage: bounded, currently safe (informational)

**Severity:** Informational.
**File:** `apps/api/src/middleware/errorEnvelope.ts:24-38`.

The error handler:
- `ApiError` instances: returns `{ error: { code, message, details? } }` with the developer-authored message and details. Code reviewers must avoid placing addresses, env values, or private state in `ApiError.message` or `details`.
- `ZodError`: returns `{ error: { code: 'INVALID_PARAMS', message: 'Request validation failed', details: err.issues } }`. The `err.issues` payload contains user-supplied input values (Zod includes the failing input in its issue paths). This is benign for typical inputs but could echo sensitive header values if the schema validates headers — currently, no route schemas validate headers, so this is theoretical.
- `HTTPException`: returns the framework's `.message`. Hono's HTTPException carries developer-set messages — same hygiene caveat as ApiError.
- **Default branch (line 36-37):** `console.error('[unhandled]', err);` then `c.json(envelope('INTERNAL', 'An unexpected error occurred'), 500);`. The client gets only the literal string "An unexpected error occurred" — **no stack trace, no error message, no env value leakage to the client.** Server-side stderr captures the full error for Vercel logs.

**Tested mental-model with a thrown error containing addresses or env-style values:**
- If a route handler throws `new Error("STUDIO_PRIVATE_KEY=0xabc…")`, the client sees `{"error":{"code":"INTERNAL","message":"An unexpected error occurred"}}`. Vercel logs see the full message. ✓ Safe.
- If a route throws `new ApiError(409, 'CHAIN_REVERT_…', "submitSoloScore reverted: ${errorName}")` — the body is `{"error":{"code":"CHAIN_REVERT_…","message":"submitSoloScore reverted: …"}}`. Safe (no addresses unless `errorName` includes one, which `decodeRevertErrorName` doesn't).
- If a route throws a Zod validation error where the schema rejected a malformed bearer header, the issues would include the malformed token. **This is the only realistic leak vector.** Bearer parsing happens in `requireBearer()` (`middleware/bearer.ts:18-25`), which throws `ApiError` with a fixed message — it doesn't surface the token. ✓ Safe.

**Recommendation:** Document the convention in `middleware/errorEnvelope.ts` (one-line comment): "ApiError.message and ApiError.details are exposed to the client. Never embed secrets, addresses with key material context, or env values. Log-only fields go to `console.error` before throwing." Codify in CONTRIBUTING.md if not already present.

---

### C-10 — Submit broadcast: viem transport-level retry is wired, but no submission table / poller fallback (low severity)

**Severity:** Low (memory partially out of date).
**Files:**
- `apps/api/src/lib/contracts-vendored/wallet-client.ts:31-41` — viem `http()` transport with `retryCount: 3, retryDelay: 250, timeout: 30_000`.
- `apps/api/src/routes/scores.ts:213-226` — `submitSoloScore` broadcast inside try/catch (handles `ContractFunctionRevertedError` only).
- `apps/api/src/routes/agents.ts:118-132` — same pattern in agent path.

Memory item `project_paid_retry_broadcast_post_yc` claims "fire-and-forget submitSoloScore has no RPC retry/timeout/fallback." **Partially refuted.** The wallet client transport at `wallet-client.ts:31-41` has:
- `retryCount: 3` — viem retries failed RPC calls 3 times.
- `retryDelay: 250` ms.
- `timeout: 30_000` ms per call.

This is "Option A (2-line transport config)" from the memory; it's already shipped.

**Still missing per the memory's option B/C:**
- No `submit_tx_hash` column or `score_submissions` durable table that tracks broadcast attempts before / during / after the RPC call. If the broadcast succeeds at viem level but the function process is killed before the HTTP response returns to the client, the tx is on-chain but the client doesn't know its hash. No reconciliation worker exists in apps/api to recover this.
- The `chargeRetryFee` flow has `x15_payment_attempts` rows tracking each attempt with structured status (`apps/api/src/routes/agents-matches.ts:202-225`), which is the pattern that should be lifted to score-submission. Currently `submitSoloScore` only writes the result to the response body — there is no DB-side trail.
- **Idempotency caveat:** the `onChainNonce` (`scores.ts:199`, `agents.ts:98`) is a random 32-byte value generated per request. The on-chain contract uses it to prevent replay of the *attestation*, but if the client retries the API call after a network-cut, a fresh `onChainNonce` is generated and a duplicate score broadcast can land on-chain. This is correct from the attestation-protocol point of view but means score submissions are NOT replay-safe at the API boundary — duplicate user requests duplicate on-chain submissions.

**Recommendation (post-YC backlog, not pre-audit blocker):**
- Add a `v2_score_submissions` table with `(player, tournamentId, soloRunId)` uniqueness, status enum (`pending|broadcast|confirmed|reverted`), tx_hash, last_attempt_at. Insert pending on entry, update broadcast on tx hash, finalize on receipt. Mirrors the X15.6 `x15_payment_attempts` pattern.
- A poller worker in apps/orchestrator that scans `pending` rows older than N seconds and re-attempts broadcast with the same nonce — this is the only way to recover from "tx broadcast to mempool, function killed before response, client never learns the hash" today.
- Add a `submitSoloScore` idempotency key parsed from a client-supplied `Idempotency-Key` header; cache the resulting tx hash for N minutes so a client retry of a successfully-submitted score returns the prior hash instead of generating a duplicate.

---

### C-11 — anchor-sp-snapshot dual-host race documented but unresolved (informational)

**Severity:** Informational.
**File:** `apps/orchestrator/src/app/api/cron/anchor-sp-snapshot/route.ts:18-23`.

The route comment acknowledges: "During the migration cutover, if the legacy host (apps/2048) and orchestrator both fire in the same second, the second tx reverts cleanly and its DB row is left with anchor_tx_hash NULL (operator cleanup is a single SQL DELETE)."

This is a deliberate post-migration cleanup pattern. The `v2_cron_runs` lock is NOT applied here (settle uses it; snapshot doesn't). If both hosts persist post-migration, this is a permanent race. Memory item `project_packages_sdk_circular_build_dep` and the surrounding ecosystem suggest the migration is in flight; confirm before audit whether the legacy 2048 host is still firing this cron.

**Recommendation:** confirm legacy host disabled before audit kickoff. If not, add `v2_cron_runs`-style lock to this route.

---

### C-12 — `index-tournaments-created` and `index-sponsor-events` indexer cadence drift (informational)

**Severity:** Informational (acceptable for testnet; pre-mainnet review needed).
**Files:**
- `apps/orchestrator/src/app/api/cron/index-tournaments-created/route.ts:1-11` (24h cadence).
- `apps/orchestrator/src/app/api/cron/index-sponsor-events/route.ts:1-9` (24h cadence).

Both indexers run daily because Vercel Hobby rejects sub-daily crons (per route-level comments). This means:
- `v2_tournaments` rows missing on-chain audit fields (`creation_tx_hash`, `creator_address`, `creation_block_number`) for permissionless `createTournament` calls are backfilled up to 24h late.
- Sponsor events show up in the sponsor dashboard up to 24h late.

Memory `project_post_yc_tournament_created_indexer` references this gap. The pre-mainnet plan is to flip to Pro and use minute-grain cadence, OR to use an external scheduler hitting the routes with the bearer token. Audit posture: acknowledge as known testnet limitation, document mainnet remediation.

**Recommendation:** before mainnet, switch orchestrator to Vercel Pro or set up an external scheduler. The current cadence is fine for the testnet audit window.

---

## Cross-cutting observations

**1. Inconsistent comparator hygiene.** duel-backend admin uses `timingSafeEqual` (`api/admin/flags.ts:79`, `api/admin/reconcile.ts:165`); orchestrator cron uses `===`. Both are accepting the same kind of bearer secret. Pick one pattern. C-1.

**2. Substring-match anti-pattern survives in one place.** C-2.

**3. The STUDIO key is overloaded.** trustedSigner + cron broadcaster + sponsor wallet for prize funding + anchor-snapshot broadcaster, all one key. Documented `project_x15_agent_wallet_split` memory items show the team is splitting this incrementally; settle-side broadcaster is the next candidate. C-4.

**4. Wallet pre-flight is USDC-only.** No ETH/gas preflight anywhere in the cron pipeline. C-4 recommendation.

**5. Lock granularity is per-minute, not per-singleton.** Cron runs that exceed 60s can overlap with the next-minute cron tick. C-6.

**6. Public endpoint hidden in the agents-matches module.** Pre-mainnet auth gap. C-3.

**7. PATCH endpoint that doesn't persist.** Functional bug rather than security bug, but auditors will see it. C-8.

**8. Error envelope is well-disciplined.** No leakage of stack traces, env values, or addresses through the standard path. C-9.

**9. Score-submission durability lags chargeRetryFee durability.** The X15.6 pattern (`x15_payment_attempts`) is the gold standard; `submitSoloScore` should adopt it. C-10.

**10. Memory ground-truth correction.** `apps/api/src/routes/tournaments.ts` has no settle path. The settle silent-swallow lives in `packages/duel-backend/src/cron/tournaments.ts:977`. Update memory item `project_settle_tournaments_silent_swallow_phase2` to reflect the correct path. Failing to do so will mislead future RCA.

---

## Recommended pre-mainnet ordering

| Order | Finding | Effort | Blocker for audit? |
|---|---|---|---|
| 1 | C-3 — auth on `/v1/agents/matches/start-solo` | Low (lift `requireSiwaAuth`) | **Yes** (open state-modifying endpoint) |
| 2 | C-2 — selector-based decode at cron/tournaments.ts:977 | Low (replicate decodeRevertErrorName) | Yes (substring-match anti-pattern still surviving) |
| 3 | C-4 — ETH-balance preflight in cron/tournaments.ts | Low (mirror preflightSponsorBalance) | Yes (operator-recovery story) |
| 4 | C-6 — singleton lock + tx-hash backfill on pre-flight recovery | Medium | No (defense-in-depth) |
| 5 | C-1 — timingSafeEqual cron secret | Trivial | No (posture) |
| 6 | C-8 — Supabase-backed agent profile store | Medium | No (feature broken, not security) |
| 7 | C-10 — `v2_score_submissions` durability table + idempotency key | Medium-high | No (post-YC backlog per memory) |
| 8 | Memory correction (settle silent-swallow file path) | Trivial | No (process hygiene) |
