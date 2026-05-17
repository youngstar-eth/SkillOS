# Sprint UR Pass 1 — Track C: Frontend Findings

**Branch:** `ur/track-c-frontend`
**Date:** 2026-05-17
**Scope:** apps/2048, wordle, sudoku, minesweeper, clicker, match3, sponsor (MAS monorepo) + skillbase-apex (separate repo, marketing-only).
**Method:** Read-only audit — no code changes. Findings only.
**Out-of-scope (this doc):** AI feature trust boundaries → `ai-features-trust-boundaries.md`. NEXT_PUBLIC env inventory → `frontend-env-inventory.md`.

---

## Executive summary

| ID | Axis | Severity | One-liner |
|---|---|---|---|
| F-3.2 | dataSuffix wiring | **blocker** (attribution) / **high** (functional) | Human-player `submitSoloScore` broadcasts WITHOUT `dataSuffix` from `packages/duel-backend/src/api/tournaments/solo.ts:477`. The headline X15 builder-code attribution claim does not apply to the human path. |
| F-2.1 | SIWB/SIWA | **high** | Internal `/api/tournaments/[id]/solo` route trusts body-supplied `playerAddress` — no SIWB bearer enforced. Anyone with a valid `feeTxHash` can submit an on-chain attestation for an arbitrary wallet. |
| F-2.3 | SIWB | **high** | SIWB JWT persisted to `localStorage` under key `skillos.bearer` — XSS-exfiltratable, 24h cross-device-portable. |
| F-6.4 | retry race | **high** | `chargeRetryFee` cross-RPC allowance race remains open (memory `project_x15_chargeretryfee_first_paid_retry_race`). No allowance re-read or revert-retry between approve receipt and chargeRetryFee broadcast. |
| F-6.6 | submit reliability | **high** | Fire-and-forget `submitSoloScore` has no retry/timeout/fallback (memory `project_paid_retry_broadcast_post_yc`). |
| F-2.10 | CORS | medium | `apps/api` CORS `origin: '*'` + bearer auth — any subdomain compromise spreads. |
| F-2.2 | SIWB | medium | EIP-4361 `uri` claim is parsed but never validated against an origin allowlist. |
| F-1.2 | wagmi RPC | medium | wagmi transport uses default public Base Sepolia RPC; rate-limit risk amplifies F-6.4. |
| F-6.5 | observability | medium | `payment_attempts` insert swallows non-42P01 errors silently now that X15.8 has shipped — obscures the chargeRetryFee race forensics. |
| F-3.3 | dataSuffix encoder | medium | `builderCodeToDataSuffix` duplicated in 2 places; encoder-compliance fix (memory `project_erc8021_encoder_spec_compliance`) is a foot-gun. |

**Positive controls verified:** 8/8 in-monorepo builder codes match canonical map (F-3.1); no env-override mechanism for builderCode (F-3.4); client-side `chargeRetryFee` and sponsor flows correctly attach `dataSuffix` (F-3.5/3.6); layered idempotency on retry (F-6.2/6.3); SIWB nonce TTL + single-use + replay protection sound (F-2.7); ERC-6492 wrapping correctly handled via viem (F-2.8).

---

## Axis 1 — wagmi + Base Account integration

### F-1.1 — Single shared wagmi config across all 7 apps (info)
- **File:** `packages/ui/src/wagmi.ts:13-27`, `packages/ui/src/Providers.tsx:8-27`
- All 7 apps re-export the same `wagmiConfig` from `@skillos/ui`. Chains: `[baseSepolia]` only (84532). Transport: `http()` (no URL).
- Connectors, in order:
  1. `farcasterMiniApp()`
  2. `coinbaseWallet({ appName: "SkillOS Duel", preference: { options: "smartWalletOnly" } })`
  3. `injected()`
- Single point of change is good for consistency; regression hits all 7 simultaneously. `appName: "SkillOS Duel"` is cosmetic post-rebrand stale.

### F-1.2 — Default HTTP transport, no Alchemy/CDP override (medium)
- **File:** `packages/ui/src/wagmi.ts:24`
- `transports: { [baseSepolia.id]: http() }` — viem falls back to public `https://sepolia.base.org`. No `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` override on the client wagmi config.
- Read paths (`useReadContract` for allowance/balance, `useWaitForTransactionReceipt`) will throttle under load. Directly exacerbates F-6.4.
- **Fix:** `http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? undefined)` with per-app override capability. Single edit.

### F-1.3 — No `wallet_sendCalls` / paymaster wiring on score-submit (info)
- **File:** `packages/ui/src/useSoloRetry.ts:69-73, 534-572`; `apps/2048/src/app/api/paymaster/route.ts:1-69`
- Hook explicitly disclaims EIP-5792 batched paymaster ("INTENTIONALLY NOT implemented here — see Phase 2 backlog"). A paymaster proxy route exists ONLY for `apps/2048` — the other 6 have nothing.
- 2-tx serial flow (approve → chargeRetryFee) is the only paid-retry path. Popup #2 may be silently suppressed by Chrome (acknowledged at lines 75-90).
- **Fix:** delete orphan 2048 paymaster route until universally wired, OR duplicate to all 7 with consistent `ALLOWED_METHODS` allowlist.

### F-1.4 — No `wallet_requestPermissions` / sub-account / spend-permission usage (info)
- Confirmed via `grep -rn "wallet_requestPermissions\|sub.account\|spend.permission" apps/ packages/` — zero hits in code.
- No session keys, no sub-accounts. Every retry requires user-presented wallet popups. Explains popup-hint UX in `useSoloRetry`. Phase 2 SPCKey/sub-account migration would compress this.

### F-1.5 — Apex has zero wagmi integration (info)
- **File:** `/Users/inancayvaz/skillbase-apex/app/layout.tsx:1-139` (no Provider wrapper)
- Apex is marketing-only. No wallet connect, no on-chain calls, no SkillOSProvider. `bc_z04mayz0` canonical code is unwired — but no execution path exists to mis-attribute.

### F-1.6 — Connector ordering risk on standalone web (low)
- **File:** `packages/ui/src/wagmi.ts:15-22`; `packages/sdk/src/react.tsx:185`
- `useSkillOSAuth.signIn()` grabs `connectors[0]` unconditionally — always `farcasterMiniApp` (a no-op outside Farcaster). Outside Farcaster context, SIWB via the SDK helper will hang/reject.
- **Fix:** filter `connectors` by `ready` state, or expose `preferredConnector` option.

---

## Axis 2 — SIWB / SIWA flow E2E

### Architecture summary

- **SIWB** (Sign-In With Base): `apps/api` (Hono). `POST /v1/auth/siwb/{nonce,verify}` → 24h HS256 JWT. Source: `apps/api/src/routes/auth.ts`, `apps/api/src/lib/{auth-store,siwe,jwt}.ts`.
- **SIWA** (Sign-In With Agent, ERC-8004): same API. `POST /v1/auth/siwa/{nonce,verify}` → HMAC-signed receipt (NOT a JWT). ERC-8128 per-request signature layered on top.
- **Client:** `packages/sdk/src/{react.tsx,vanilla.ts,agent.ts}` exposes `SkillOSProvider`, `useSkillOSAuth`, `useSkillOSAgent`. Wired in all 7 app `layout.tsx` files with `persistAuth: "localStorage"`.
- **`@buildersgarden/siwa`** imported from `/siwa` subpath, NOT barrel (per memory `reference_buildersgarden_siwa_barrel_trap`). Verified at `apps/api/src/lib/siwa.ts:23`, `packages/sdk/src/agent.ts:22`.

### F-2.1 — Internal solo-submit routes don't enforce SIWB/SIWA (high)
- **File:** `packages/duel-backend/src/api/tournaments/solo.ts` (whole handler), wired by `apps/{game}/src/app/api/tournaments/[id]/solo/route.ts:4`
- `createTournamentSoloHandler` reads `playerAddress` directly from JSON body and broadcasts on-chain. No `Authorization: Bearer` check, no SIWB JWT, no session linkage. The SDK `useSkillOSAuth` exists but is only wired in `apps/2048/src/app/dev/sdk-demo/page.tsx` (a dev demo). `apps/api`'s JWT bearer is enforced on `/v1/scores` — but games hit their internal Next route instead.
- **Why it matters:** anyone can POST `{playerAddress: <any>, score, feeTxHash}` and trigger an on-chain attestation signed by the studio key for an arbitrary wallet, given a valid `feeTxHash`. Free-tier submissions (no fee) let an attacker grief any wallet with attestations, polluting leaderboards. Identity is unauthenticated on the production write path.
- **Fix:** gate `createTournamentSoloHandler` on a SIWB bearer obtained from `apps/api` (bind body `playerAddress` to JWT `sub`), OR accept SIWE message+signature in body and verify per-request, OR explicitly document the threat model accepting fee-payment binding (chargeRetryFee tx `msg.sender`) as the only identity check on paid submissions.

### F-2.2 — SIWE `uri` claim is unvalidated server-side (medium)
- **File:** `apps/api/src/lib/siwe.ts:44-85`; `apps/api/src/routes/auth.ts:99-105`
- `parseAndValidate()` checks `domain`, `chainId`, optional `expirationTime`, address match — but `uri` claim is parsed and discarded. With CORS `origin: '*'` (F-2.10) and shared `JWT_SECRET` across all subdomains, a malicious site rendering a SkillOS-branded SIWE prompt under a foreign origin can mint a valid bearer.
- **Fix:** validate `parsed.uri` against an allowlist of expected origins; reject mismatch with `AUTH_SIGNATURE_INVALID`.

### F-2.3 — SIWB bearer JWT persisted to `localStorage` (high)
- **File:** `packages/sdk/src/react.tsx:75,87-102,116-127`; all 7 app `layout.tsx` files set `persistAuth: "localStorage"`
- `BEARER_STORAGE_KEY = 'skillos.bearer'` — 24h HS256 JWT written via `window.localStorage.setItem`.
- **Why it matters:** localStorage is readable by any script on the origin (XSS exfil). Any compromised npm dep (analytics, ads, embeds — apps/2048 ships `<SimplAd />` from a separate component) can read `skillos.bearer` and impersonate the user for 24h. JWT not bound to UA or IP; exfiltrated token is fully portable.
- **Fix:** move bearer to same-site httpOnly Secure cookie issued by `apps/api`. If localStorage must remain for cross-origin (mini-app) flows, shorten TTL to ≤1h and add refresh flow.

### F-2.4 — SIWA agent receipt opt-in localStorage persistence (medium, latent)
- **File:** `packages/sdk/src/react.tsx:415,445-472`
- `AGENT_BEARER_STORAGE_KEY = 'skillos.agent.receipt'`. Default memory-only; option exposed. No call site enables it today.
- **Fix:** remove the `'localStorage'` option entirely (file comment recommends memory-only for receipts); or apply httpOnly-cookie pattern when enabled.

### F-2.5 — No refresh flow on bearer expiry (low, UX)
- **File:** `packages/sdk/src/react.tsx:253-262`
- `setTimeout(() => setBearer(null), ms)` at expiry. No `/v1/auth/refresh`, no sliding window. Tab-close re-open will load a still-valid (maybe near-expired) token and not auto-clear until expiry.

### F-2.6 — Nonce stores split (SIWB / SIWA) — unsynchronized (info)
- **File:** `apps/api/src/lib/auth-store.ts:21` (`skillos_auth_nonces`); `apps/api/src/lib/siwa-nonce-store.ts:21` (`skillos_siwa_nonces`)
- Matches memory `project_phase2_nonce_store_unify`. Identical TTL (5 min); SIWB wallet-bound at issue (REPLACE-on-reissue), SIWA wallet-agnostic at issue (PK-collision retry).
- Architectural debt; Redis unification planned.

### F-2.7 — SIWB nonce TTL + replay protection — OK (info)
- **File:** `apps/api/src/lib/auth-store.ts:43-113`; `apps/api/src/routes/auth.ts:107-138`
- 128-bit hex nonce, 5-min TTL, atomic consume (single UPDATE with `consumed=false AND expires_at>now()`, RETURNING distinguishes success/race). Wallet-bound at issue + checked at consume. Nonce consumed BEFORE crypto verify (protects against signature-grinding). Failed verify still burns nonce. **OK.**

### F-2.8 — ERC-6492 wrapping — OK via viem (info)
- **File:** `apps/api/src/lib/siwe.ts:87-98`; `apps/api/src/lib/siwa.ts:92-98`
- SIWB uses `client.verifyMessage` (viem PublicClient) which transparently unwraps ERC-6492 wrappers, then either `ecrecover` (EOA) or `eth_call(isValidSignature)` (ERC-1271). Comments at `siwe.ts:1-16` explicitly call out that `siwe`'s own `.verify()` is unreliable for 6492. SIWA delegates to `@buildersgarden/siwa/siwa.verifySIWA` (same PublicClient). **OK.**

### F-2.9 — `JWT_SECRET` length guard is structural, not entropy (low)
- **File:** `apps/api/src/lib/jwt.ts:23-32`
- Boot-time check `raw.length < 32`. No entropy check; `"a".repeat(32)` passes.
- **Fix:** document required entropy in env contract; optionally Shannon-entropy check or require base64 prefix.

### F-2.10 — CORS `origin: '*'` paired with bearer auth (medium)
- **File:** `apps/api/src/app.ts:25-29`
- CORS allows any origin to `Authorization`. Bearer in localStorage on game origins is not readable cross-origin, but combined with F-2.2 (unvalidated `uri`) + F-2.3 (localStorage) → single compromised subdomain → all of `apps/api`.
- **Fix:** pin CORS to allowlist (`*.skillos.games`, `skillos.network`).

---

## Axis 3 — dataSuffix client-side wiring

### Canonical registry locations
- **Server authoritative map:** `apps/api/src/lib/games.ts:43-50` — `BUILDER_CODES: Record<KnownGame, string>`
- **Per-app client wiring:** each app's `app/layout.tsx`
- **Docs of record:** `packages/skills/references/testnet-endpoints.md:50-58`; `packages/skills/prompts/wire-builder-code.md:24-31`
- **Encoding function (duplicated):** `packages/sdk/src/contracts.ts:78-86` and `apps/api/src/lib/games.ts:62-67`

### F-3.1 — 8/8 Builder-Code Attestation Table (info, positive)

| App | Canonical | Actual in `app/layout.tsx` | Match? |
|---|---|---|---|
| 2048 | `bc_o6szuvg1` | `bc_o6szuvg1` (`apps/2048/src/app/layout.tsx:46`) | ✅ |
| wordle | `bc_l0drfg77` | `bc_l0drfg77` (`apps/wordle/src/app/layout.tsx:45`) | ✅ |
| sudoku | `bc_ixx8hzql` | `bc_ixx8hzql` (`apps/sudoku/src/app/layout.tsx:45`) | ✅ |
| minesweeper | `bc_6gsgkv5q` | `bc_6gsgkv5q` (`apps/minesweeper/src/app/layout.tsx:45`) | ✅ |
| clicker | `bc_m59xxykm` | `bc_m59xxykm` (`apps/clicker/src/app/layout.tsx:45`) | ✅ |
| match3 | `bc_iqoz78rc` | `bc_iqoz78rc` (`apps/match3/src/app/layout.tsx:45`) | ✅ |
| sponsor | `bc_2hg1v71w` | `bc_2hg1v71w` (`apps/sponsor/src/app/layout.tsx:79`) | ✅ |
| apex | `bc_z04mayz0` | **NOT WIRED** (no SkillOSProvider, no wagmi in apex) | ⚠️ (no surface) |

All 7 in-monorepo apps match canonical. Apex's `bc_z04mayz0` has no executing path (see F-1.5).

### F-3.2 — Server-side `submitSoloScore` in `@skillos/duel-backend` MISSING dataSuffix (BLOCKER for attribution)
- **File:** `packages/duel-backend/src/api/tournaments/solo.ts:477-492` and `packages/duel-backend/src/api/tournaments/submit.ts:303-317`
- Per-game routes `/api/tournaments/[id]/solo` (all 7 apps re-export `createTournamentSoloHandler` from this package) broadcast `submitSoloScore` from the studio wallet via `getWalletClient().writeContract(...)` **with no `dataSuffix`**. The X10 fix (memory `project_api_server_side_datasuffix_attribution_gap`) was applied in `apps/api/src/routes/agents.ts:118-132` and `apps/api/src/lib/duel/runner.ts:315-329` — but NOT in `packages/duel-backend/src/api/tournaments/solo.ts`, which is what game frontends use for human players.
- Cross-check: `apps/2048/src/app/api/tournaments/[id]/solo/route.ts` (4 lines total) re-exports `createTournamentSoloHandler({ game: "2048" })`. Same for wordle/sudoku/minesweeper/clicker/match3.
- **Why it matters:** HEADLINE ATTRIBUTION CLAIM IS FALSE FOR HUMAN PLAYERS. The "734-hex calldata with ASCII tail bc_xxxxxxxx" attestation in `docs/pitch/X15-summary.md` and the X10 closure memory only describe the *agent* path. Every human-played solo submit lands on-chain via `packages/duel-backend/src/api/tournaments/solo.ts:477` with standard 712-hex calldata (no builder code). The 8/8 client-side wiring above is correct for *agent* attribution (dataSuffix flows through `useSoloRetry`'s `chargeRetryFee` call, not `submitSoloScore`), but the studio-broadcast `submitSoloScore` itself has no per-game builder code attached.
- **Fix:** thread `config.game` (already at line 99) into `dataSuffix: dataSuffixForGame(config.game)` on the writeContract at line 477. Replicate to `submit.ts:303-317`. Single-line addition per call site. Recommend extracting `BUILDER_CODES` + `builderCodeToDataSuffix` into `packages/contracts` (which both `apps/api` and `packages/duel-backend` already depend on).

### F-3.3 — `builderCodeToDataSuffix` duplicated in 2 places (medium)
- **File:** `packages/sdk/src/contracts.ts:78-86` AND `apps/api/src/lib/games.ts:62-67`
- Two identical implementations. Comment at `games.ts:53-60` admits this is intentional ("kept inline to avoid public-API → SDK workspace dep"). Both produce 11-byte raw ASCII.
- Per memory `project_erc8021_encoder_spec_compliance`, spec says 16-byte structured. When compliance fix lands, both implementations must change in lockstep.
- **Fix:** extract `builderCodeToDataSuffix` + `BUILDER_CODES` into `packages/contracts`. Single source.

### F-3.4 — No env-var override mechanism for builderCode (positive)
- Confirmed via `grep -rn "NEXT_PUBLIC_BUILDER\|BUILDER_CODE.*process\|process.env.*BUILDER" apps/ packages/` — zero hits.
- All 7 builder codes are literal strings in per-app `layout.tsx`. No `process.env.NEXT_PUBLIC_BUILDER_CODE` fallback that could mis-attribute a deploy via misconfigured Vercel env. PR-reviewable supply-chain bound. **Keep it this way.**

### F-3.5 — Client `useSoloRetry` correctly wires dataSuffix on `approve` + `chargeRetryFee` (positive)
- **File:** `packages/ui/src/useSoloRetry.ts:108` (import), `:298` (hook call), `:381, :540, :563` (write sites)
- Hook reads `dataSuffix` from `useSkillOSDataSuffix()` (reads `config.builderCode` from `SkillOSProvider`) and spreads conditionally `...(dataSuffix && { dataSuffix })` on every writeContract. Encoded suffix lands on USDC.approve AND chargeRetryFee. **Correct.**

### F-3.6 — Sponsor flow correctly attaches dataSuffix (positive)
- **File:** `packages/sdk/src/react.tsx:530-559`; `apps/sponsor/src/app/[tournamentId]/page.tsx:129-136,209`
- Sponsor sends both USDC.approve and `sponsorPool` with `bc_2hg1v71w` dataSuffix via `useSkillOSSponsor.fundCalldata`. **OK.**

---

## Axis 6 — Score-submit retry logic (`useSoloRetry` pattern)

### F-6.1 — Single shared hook across 6 game apps (info)
- **File:** `packages/ui/src/useSoloRetry.ts:287-644`
- 2048/sudoku/wordle/minesweeper/clicker/match3 all import same hook. Sponsor flow is separate (inline in `apps/sponsor/src/app/[tournamentId]/page.tsx`).

### F-6.2 — Client-side double-submit guards (positive)
- **File:** `packages/ui/src/useSoloRetry.ts:300-312` (state refs); `:373-374` (`chargeStartedRef`); `:478-500` (replay-on-mount via `replayedRef`); `:589-590` (`handleGameOver` early-returns)
- Layered: `chargeStartedRef` (auto-chain approve→charge), `replayedRef` (mount-time replay one-shot), `handleGameOver` (status/finalScore guards), `walletBusy` (button-disable during approve/charge). **OK.**

### F-6.3 — Idempotency: `feeTxHash` is server-side dedupe authority (positive)
- **File:** `packages/duel-backend/src/api/tournaments/solo.ts:444-468` (insert+unique-violation); `:613-673` (on-chain `RetryFeePaid` event verification)
- **Primary:** Postgres partial-unique index on `v2_tournament_solo_runs.fee_tx_hash` → HTTP 409 `fee_tx_already_used` on replay.
- **Secondary:** `verifyRetryFeeTx` scans on-chain receipt logs for `RetryFeePaid(tournamentId, player, amount >= RETRY_FEE)` from `TOURNAMENT_POOL_V2_ADDRESS`. Mismatch → HTTP 400 `fee_tx_mismatch`/`fee_tx_reverted`/`fee_tx_not_found`.
- runId is server-generated `randomBytes32()` (`:429-430`); NOT a client-supplied idempotency key.
- **Sub-finding (low):** free-path (priorSoloRuns == 0) has no `feeTxHash` and no equivalent unique constraint. Concurrent burst within a few ms could theoretically let two free runs land. Low practical risk.

### F-6.4 — `chargeRetryFee` cross-RPC allowance race is OPEN (high)
- **File:** `apps/api/src/lib/duel/charge-retry-fee.ts:106-133`; client-side parallel `packages/ui/src/useSoloRetry.ts:363-399`
- Memory `project_x15_chargeretryfee_first_paid_retry_race` captures Run 1: approve receipt landed via public RPC, chargeRetryFee simulation via Alchemy still saw allowance=0. Current state at `:132`:
  ```
  await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
  ```
- Comment at `:131-133` says "Wait for confirmation before chargeRetryFee — otherwise both can mine in the same block in arbitrary order and the charge reverts." This guards block-order but NOT cross-RPC propagation lag. The chargeRetryFee writeContract goes through the SAME walletClient (Alchemy) while the receipt was confirmed via `getPublicClient()` (also Alchemy but separate connection/round-trip). Allowance is NOT re-read between approve confirmation and chargeRetryFee broadcast.
- Client-side parallel correctly latches on `approveDone` (not on `hasAllowance` refetch) — comment at `:357-362` says so. Server uses same pattern but the simulation step inside walletClient.writeContract is what bit Run 1.
- **Fix:** after `waitForTransactionReceipt`, add bounded poll `do { allowance = readContract(...) } while (allowance < RETRY_FEE && elapsed < 5s)` against SAME `walletClient.transport`. OR catch `ERC20InsufficientAllowance` revert and retry once after 1s sleep.

### F-6.5 — `payment_attempts` insert swallows non-42P01 errors silently (medium)
- **File:** `apps/api/src/lib/duel/charge-retry-fee.ts:200-230` (`recordPaymentAttempt`)
- Per memory `project_x15_8_payment_attempts_schema_lock`, X15.8 migration applied 2026-05-15 (v4_20260515b on clizuqvtkekzxiflbsyr) — table now exists. But swallow-and-warn at `:216-228` remains: non-42P01 errors (RLS misconfig, column-type mismatch) silently warn rather than fail. Obscures evidence for the F-6.4 race.
- **Fix:** tighten swallow to ONLY 42P01 (relation does not exist) — bubble all others. Or remove now that X15.8 is shipped.

### F-6.6 — Fire-and-forget `submitSoloScore` has no retry/timeout/fallback (high)
- **File:** `packages/duel-backend/src/api/tournaments/solo.ts:474-503` (try/catch logs+continues); no waitUntil for submit
- writeContract failure (RPC down, nonce conflict) logs and returns `null` txHash; client gets `txHash: null`. No background retry, no waitUntil, no `submit_tx_hash` schema persistence.
- Matches memory `project_paid_retry_broadcast_post_yc` — three fix options (A: viem transport `retryCount: 3, retryDelay: 500`; B: submit_tx_hash schema; C: poller worker) all unimplemented.
- **Fix:** Option A is the quickest (2-line transport config).

### F-6.7 — `submission-queued` buffer drop is silent if tournament closed (low)
- **File:** `packages/ui/src/useSoloRetry.ts:455-470, 478-500`
- Network-failure path persists `{feeTxHash, score, durationSeconds, gameSlug, timestamp}` to `localStorage.skillos:pendingSubmit:{tournamentId}`. Replay on mount fires once. If `tournamentEndsAt` is past at replay moment, buffer dropped silently (`:488-492`) and paid retry is lost (no UI surface).
- **Fix:** when dropping a stale buffer, surface a one-time toast/banner so player has paper trail for manual recovery. Or keep buffer indefinitely + "pending-paid-runs" dashboard view.

### F-6.8 — `submission-queued` status enum exists but consumer UI parity not verified (low)
- **File:** `packages/ui/src/useSoloRetry.ts:113-122, 455-469`
- Status enum is well-typed; consumers like 2048's `tournament/solo/page.tsx` need explicit handling. Distinction exists; per-app UI verification out of scope for this read-only pass.

---

## Axis 7 — localStorage / sessionStorage inventory

### Storage-key inventory

| App / Package | Key | Class | Source (file:line) | Notes |
|---|---|---|---|---|
| All 7 apps (via `@skillos/sdk/react`) | `skillos.bearer` | **FLAG** | `packages/sdk/src/react.tsx:75,90,121,123` | 24h HS256 JWT + sessionId + address. See F-2.3. |
| All 7 apps (via `@skillos/sdk/react`) | `skillos.agent.receipt` | **FLAG (latent)** | `packages/sdk/src/react.tsx:415,448,466,468` | SIWA receipt; only persists when caller opts in. No production opt-in. See F-2.4. |
| All 7 game apps (via `@skillos/ui`) | `skillos:pendingSubmit:{tournamentId}` | **WATCH** | `packages/ui/src/useSoloRetry.ts:184,189-230` | `{feeTxHash, score, durationSeconds, timestamp, gameSlug}`. See F-7.3. |
| All 7 game apps (legacy migration) | `skillbase:pendingSubmit:{tournamentId}` | **WATCH (legacy)** | `packages/ui/src/useSoloRetry.ts:187,200-205` | Pre-rebrand key; read+migrate-then-delete on first access. TODO removes after 2026-06-01. |
| skillbase-apex | (none) | — | — | Zero localStorage/sessionStorage in production files. Only `.claude/worktrees/agent-*` scratch references. |
| wagmi / coinbase-wallet | `wagmi.*`, `cbwsdk.*` | OK (transitive) | not our source | Standard ecosystem behavior. |

### F-7.1 — `skillos.bearer` JWT in localStorage (high — duplicate of F-2.3)
- See F-2.3. Migrate to httpOnly Secure SameSite=Lax cookie issued by `apps/api`; frontend reads `isSignedIn` from a `/v1/auth/whoami` ping.

### F-7.2 — `skillos.agent.receipt` opt-in localStorage persistence (medium, latent — duplicate of F-2.4)
- See F-2.4. Receipts grant ERC-8128-signed write authority on `/v1/agents/*` for 24h.

### F-7.3 — `skillos:pendingSubmit:{tournamentId}` paid-retry buffer (low)
- **File:** `packages/ui/src/useSoloRetry.ts:184-230,401-417,455-468,477-500`
- Contains `feeTxHash` (public on-chain id, not a secret) + `score` + `durationSeconds`. Server-side enforcement is `v2_tournament_solo_runs.fee_tx_hash` partial-unique index, which prevents replay across multiple runs — so XSS exfil ≠ free score (server rejects 2nd use).
- The `score` value is locally stored and replayed, but the per-tournament internal handler trusts the body value anyway (separate issue, F-2.1).
- Cross-device replay explicitly NOT supported (commented at `useSoloRetry.ts:65-67`).
- **No action required** — behavior intentional and documented. Auditor-facing note: this key intentionally outlives sign-out (logout doesn't clear `pendingSubmit` buffers — by design, paid-retry credit is wallet-bound on-chain).

---

## Cross-cutting observations

1. **Two distinct API trust models coexist:**
   - `apps/api` (Hono, deployed at `api.skillos.network`): bearer-enforced, SIWB/SIWA gated.
   - Per-app Next routes via `@skillos/duel-backend`: unauthenticated body-trust.
   - The SDK + SIWB story only protects the former. Apps' game flow uses the latter. Largest finding (F-2.1).

2. **Apex repo has no auth/storage surface** — confirmed via grep. Static marketing/landing + read-only `/watch/[runId]` viewer pulling from Supabase via `lib/supabase.ts`. Out-of-scope for Axes 1/3/6/7 (execution paths).

3. **Memory hints validated:**
   - `@buildersgarden/siwa` imported from `/siwa` subpath, not barrel (memory: `reference_buildersgarden_siwa_barrel_trap`) ✅
   - Nonce stores ARE split SIWB/SIWA (memory: `project_phase2_nonce_store_unify`) ✅
   - ERC-6492 wrapping handled via viem, not siwe's own verify ✅
   - chargeRetryFee race remains open (memory: `project_x15_chargeretryfee_first_paid_retry_race`) ✅
   - `submitSoloScore` fire-and-forget unfixed (memory: `project_paid_retry_broadcast_post_yc`) ✅

---

## Pre-mainnet blocker shortlist

1. **F-3.2** — thread `dataSuffix` into `packages/duel-backend` `submitSoloScore` + `submit.ts` writeContract calls. Without this, the human-player attribution claim is false. **Trivial fix; required before any external audit references the attribution path.**
2. **F-2.1** — gate solo-submit on SIWB bearer (or document fee-payment binding as sole identity check).
3. **F-2.3** — move bearer out of localStorage.
4. **F-6.4** — close the `chargeRetryFee` allowance race.
5. **F-6.6** — wire viem `retryCount: 3, retryDelay: 500` on the studio walletClient transport.

---

## Key files referenced

- `packages/ui/src/wagmi.ts`, `packages/ui/src/Providers.tsx`, `packages/ui/src/useSoloRetry.ts`
- `packages/sdk/src/{react.tsx,vanilla.ts,agent.ts,contracts.ts}`
- `packages/duel-backend/src/api/tournaments/{solo,submit}.ts`
- `apps/api/src/routes/{auth,auth-siwa}.ts`
- `apps/api/src/lib/{siwe,siwa,auth-store,siwa-nonce-store,jwt,agent-receipt,games}.ts`
- `apps/api/src/middleware/{bearer,agent-auth}.ts`
- `apps/api/src/app.ts` (CORS)
- `apps/api/src/lib/duel/charge-retry-fee.ts`
- `apps/{2048,wordle,sudoku,minesweeper,clicker,match3,sponsor}/src/app/layout.tsx`
