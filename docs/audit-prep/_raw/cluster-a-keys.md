# Cluster A — trustedSigner Pipeline & Wallet Topology Audit

**Scope:** Pre-mainnet hygiene audit of the three load-bearing private keys
(`STUDIO_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `X402_RECEIVER_ADDRESS`) and the
on-chain trustedSigner / feeVault role registry on Base Sepolia.

**Canonical trustedSigner (Base Sepolia):** `0xA24f9122568e98b72f4dDD61119C7D92D0975692`
**Canonical feeVault post-X19b:** `0x455536e4bC148Eba4621d0AfB8EFD59e0654F596`

---

## Wallet Topology Map

| Env var | Loaded by (file:line) | Consumed by (file:line) | Role | Apps that need it |
|---|---|---|---|---|
| `STUDIO_PRIVATE_KEY` | `apps/api/src/lib/contracts-vendored/attestation.ts:25` (`getSignerAccount`) | `apps/api/src/lib/contracts-vendored/wallet-client.ts:47` (`getWalletClient`); `attestation.ts:95` (`signDigest`) | trustedSigner — signs EIP-191 `submitSoloScore` digests, broadcasts the submit tx | `apps/api`, `apps/orchestrator`, all 6 game apps (via `packages/lib-shared`) |
| `STUDIO_PRIVATE_KEY` | `packages/lib-shared/src/attestation.ts:30` (`requireSignerAccount`) | `packages/lib-shared/src/rpc.ts:58` (`getWalletClient`); `packages/duel-backend/src/{settle,cron/tournaments,cron/reconcile-duels,api/admin/reconcile,api/tournaments/{submit,solo}}.ts` | Settle/walkover EIP-191 signer for ChallengeEscrow; tournament create + settle broadcaster | `apps/orchestrator`, all 6 game apps |
| `AGENT_PRIVATE_KEY` | `apps/api/src/lib/contracts-vendored/attestation.ts:42` (`getAgentAccount`) | `apps/api/src/lib/contracts-vendored/wallet-client.ts:55` (`getAgentWalletClient`); `apps/api/src/lib/x402-client.ts:247` (signer fallback); `apps/api/src/lib/duel/charge-retry-fee.ts`; `apps/api/src/routes/agents-matches.ts:90` indirectly via `reserveSoloRun` | (1) Agent EOA — `msg.sender == player` for `chargeRetryFee` (D1); (2) EIP-3009 `transferWithAuthorization` signer for x402 USDC settlement; (3) on-chain `player` shown in spectator UI | **`apps/api` only** |
| `X402_RECEIVER_ADDRESS` | `apps/api/src/lib/x402.ts:43`; `apps/api/src/lib/x402-client.ts:76` (`readReceiver`) | `apps/api/src/lib/x402-client.ts:267` (payTo); paymentMiddleware route map | x402 USDC float — receives $1.05 per agent paid retry from `AGENT_PRIVATE_KEY` | **`apps/api` only** |
| `feeVault` (no env — on-chain only) | `ChallengeEscrow.feeVault` storage, settable by owner via `setFeeVault` | `contracts/src/ChallengeEscrow.sol` settle path | Collects ChallengeEscrow protocol fees | not exposed off-chain; rotated 2026-05-14 |

---

## Finding A-1 — No boot-time trustedSigner cross-check anywhere in the stack

**Severity: High**

**Files:**
- `apps/api/src/lib/contracts-vendored/attestation.ts:23-30` (`getSignerAccount`)
- `apps/api/src/lib/contracts-vendored/wallet-client.ts:46-49` (`getWalletClient`)
- `packages/lib-shared/src/attestation.ts:29-41` (`requireSignerAccount` / `getSignerAccount`)
- `packages/lib-shared/src/rpc.ts:54-68` (`getWalletClient`)

The `getSignerAccount()` lazy singleton derives an address from
`STUDIO_PRIVATE_KEY` and caches the viem `Account` (attestation.ts:21-30,
38-41), but nowhere in `apps/api`, `apps/orchestrator`, `packages/duel-backend`,
or `packages/lib-shared` does any code call
`publicClient.readContract({ functionName: 'trustedSigner' })` to verify the
derived address matches the on-chain `trustedSigner` storage slot of
TournamentPool v2.1 (`0x52049b8…`) or ChallengeEscrow (`0x52e5E45…`). I
confirmed this by grepping the entire `apps/`, `packages/`, and `scripts/`
trees for `functionName.*trustedSigner` and `trustedSigner.*functionName` —
zero hits.

The contract ABI declares `trustedSigner` (`abi.ts:94`), and the deploy
script `contracts/script/SetTournamentPoolSigner.s.sol:38-39` calls
`pool.trustedSigner()` as part of its ceremony, but no runtime path does.

The historical impact is documented: the
`reports/ultrareview-20260501.md:68` Task 2.1 finding records a v2.1 cutover
where the on-chain `trustedSigner` was an orphaned address
(`0xf35c284D…`) with no derivable key, while `STUDIO_PRIVATE_KEY` derived to
`0xA24f9122…`. The mismatch was caught by an external review hours before
the cutover; in production it would have caused every `submitSoloScore` to
revert with `BadSignature`. There is no mechanism in code that would have
surfaced this before the first revert.

**Recommendation:** Add a lazy boot-time assertion in `getWalletClient()`
(or a `/v1/health` route) that reads `trustedSigner()` from both
TournamentPool v2.1 and ChallengeEscrow once and `assert`s equality with
`getSignerAccount().address`. The check costs one RPC read per cold start
and converts a silent on-chain revert into a startup error. This is the
exact failure mode that motivated the Pattern #19 "vercel env paste ≠
wired" memo — the same discipline applies to the signer/contract binding.

---

## Finding A-2 — `feeVault` address not pinned in app code; rotation discoverable only via on-chain read

**Severity: Med**

**Files:**
- `contracts/deployments/wallets-base-sepolia.md:23` (canonical registry, post-X19b)
- `apps/api/src/lib/contracts-vendored/addresses.ts:25-27` (CHALLENGE_ESCROW_ADDRESS env override)
- `packages/contracts/src/addresses.ts` (mirror)

The X19b rotation (2026-05-14, tx `0x5695e66272…`) moved `feeVault` off the
trustedSigner address. The new address `0x455536e4bC148Eba4621d0AfB8EFD59e0654F596`
is documented in `contracts/deployments/wallets-base-sepolia.md:23` and
nowhere else in the source tree — I grepped all `*.ts`, `*.js`, `*.sol`,
`*.json` files and confirmed zero hard-coded occurrences. ChallengeEscrow's
`feeVault()` is read on-chain only.

This is the correct posture (the registry is the source of truth, not a
constant; rotation does not require a code change), but the absence of any
runtime cross-check (mirroring Finding A-1) means an unexpected rotation
that revokes the prior vault — or a re-rotation drift between testnet and
mainnet — would not be flagged. The mainnet flip will rotate this address
again; without an assertion, the only way to verify the new address took
effect is the post-deploy on-chain ceremony.

**Recommendation:** Mirror the Finding A-1 health check by reading
`ChallengeEscrow.feeVault()` at boot and emitting it on `/v1/health`.
Audit-grade: the operator and the auditor should have a single endpoint
they can curl that exposes the actual on-chain `trustedSigner`, `feeVault`,
and `owner` for both contracts. Today this requires a Foundry `cast call`
ceremony per address.

---

## Finding A-3 — `apps/2048` admin route hard-codes the studio address as a runtime constant

**Severity: Low**

**File:** `apps/2048/src/app/api/admin/system-health/route.ts:42`

```ts
const STUDIO_ADDRESS = "0xA24f9122568e98b72f4dDD61119C7D92D0975692" as const;
```

This is the only place in the source tree where the canonical
`trustedSigner` address (not the key) appears as a literal in shipped app
code. It is gated behind `ADMIN_API_TOKEN` Bearer auth (route.ts:90-104)
and is used only to read USDC + ETH balance for the wallet-health alerting
endpoint, so the public exposure is nil. The risk is rotation drift: a
future trustedSigner rotation will silently miss this constant and the
health endpoint will start reporting balances for the wrong wallet
(stale-but-plausible numbers are worse than no data).

**Recommendation:** Replace the hard-coded literal with a derivation from
`STUDIO_PRIVATE_KEY` via `privateKeyToAccount(...).address` (same pattern
as `getSignerAccount`), or — preferred — read `trustedSigner()` on-chain.
Document that the wallet-health endpoint exposes the canonical signer
address as part of its envelope.

---

## Finding A-4 — `AGENT_PRIVATE_KEY` env-var **name** (not value) leaks through API error envelope

**Severity: Med**

**Files:**
- `apps/api/src/lib/contracts-vendored/attestation.ts:43` (throw site)
- `apps/api/src/routes/agents-matches.ts:90-98` (propagation)
- `.claude/memory/feedback_patterns.md:52` (Pattern #18 — historical incident)

`getAgentAccount()` throws a literal `'AGENT_PRIVATE_KEY is not set'`
Error when the env var is absent (attestation.ts:43). The call site at
`agents-matches.ts:90` catches and re-throws via `ApiError(502,
'RESERVE_FAILED', err.message)` (line 96), which is serialized verbatim
into the public 502 JSON body. This is what Pattern #18 records: post-PR
#94 (X15.6), production briefly returned
`502 RESERVE_FAILED { "AGENT_PRIVATE_KEY is not set" }` to anonymous
callers until the env var was provisioned in Vercel.

The **value** of the key is never logged or serialized — `process.env.AGENT_PRIVATE_KEY`
is read once and immediately passed to `privateKeyToAccount`. The Error
message contains the env-var name only. But for an audit-firm threat model,
leaking the env-var name to an unauthenticated caller is reconnaissance
signal: it reveals (a) that a private-key env var exists, (b) its precise
name, and (c) a soft-failure trigger that gates a paid-retry path.

Same pattern applies to `STUDIO_PRIVATE_KEY is not set` (attestation.ts:26)
but that throw fires at a code path which is `process.env`-required at
deploy time and so rarely surfaces.

**Recommendation:** In `apps/api/src/routes/agents-matches.ts:96` and any
sibling re-throw site, swap `err.message` for a static
`'Failed to reserve match'` string when the underlying error originates
from a missing-env throw. Log the original `err.message` server-side
(`console.error`) for ops, but never echo env-var names into the public
response envelope. This is a one-line conditional at the catch site.

---

## Finding A-5 — Wallet topology drift between `apps/api` and `apps/orchestrator` env.example

**Severity: Med**

**Files:**
- `apps/api/.env.example:65,93,119` (lists STUDIO + X402_RECEIVER + AGENT)
- `apps/orchestrator/.env.local.example:23` (lists STUDIO only)
- `apps/{2048,clicker,wordle,sponsor,minesweeper,sudoku,match3}/.env.local.example:15` (each lists STUDIO only)
- `turbo.json:13-19` (build env list — STUDIO only)

The topology in source matches the role split: `apps/api` is the **only**
consumer of `AGENT_PRIVATE_KEY` and `X402_RECEIVER_ADDRESS` (verified by
grep across all 9 apps), and `apps/orchestrator` legitimately needs only
`STUDIO_PRIVATE_KEY` because it broadcasts settle/walkover/anchor from the
studio account. So the `.env.local.example` differences are correct.

The drift is structural — there is no canonical "wallet-env manifest"
documenting which apps need which keys. Pattern #18 (.claude/memory)
specifically called out that `AGENT_PRIVATE_KEY` was added to a rare path
(X15.3) then made unconditional in X15.6 without simultaneously rolling
the Vercel env in production. The same risk applies in reverse: if a
future PR adds `AGENT_PRIVATE_KEY` usage to a cron route hosted in
`apps/orchestrator` or `packages/duel-backend`, the
`orchestrator/.env.local.example` will silently lag, and the first call
will 502 in prod.

`turbo.json:13-19` lists `STUDIO_PRIVATE_KEY` in the `build.env` array
but omits `AGENT_PRIVATE_KEY` and `X402_RECEIVER_ADDRESS`. Today this is
correct (those keys are runtime-only, not consumed at build), but if a
future Next.js build-time prefetch or static manifest reads them, the
build cache won't invalidate.

**Recommendation:** Add a `docs/audit-prep/wallet-env-manifest.md` (or
extend `wallets-base-sepolia.md`) listing each env var → which apps must
have it → which build env array must list it. Make `.env.local.example`
files derived from this manifest. Pre-mainnet, lint the manifest against
the source-tree grep.

---

## Finding A-6 — Rotation runbook exists only as a Foundry script; no procedural doc covers Vercel-side env rotation

**Severity: Med**

**Files:**
- `contracts/script/SetTournamentPoolSigner.s.sol` (on-chain side)
- `docs/adr/0003-agent-x402-retry-payments.md:171` (forward reference: "X19b.1 key rotation expansion must add AGENT_PRIVATE_KEY mainnet rotation procedure")
- `contracts/deployments/wallets-base-sepolia.md:27-34` (X19b operations history)

`SetTournamentPoolSigner.s.sol:36-46` is the on-chain rotation primitive:
owner-signed `setTrustedSigner(newAddr)` call against the deployed pool.
The script's NatSpec (line 11-14) explicitly references the v2-cutover
incident where `SCORE_SIGNER_ADDRESS` env drifted from the address
`STUDIO_PRIVATE_KEY` derived to. There is, however, no companion runbook
covering:

1. The order of operations for a live rotation (Vercel env update → grace
   window → on-chain `setTrustedSigner` → final cutover).
2. The set of apps to roll across (`apps/api`, `apps/orchestrator`, all 6
   game apps — each has its own Vercel project).
3. Cache invalidation: the `cachedAccount` singleton in attestation.ts:21
   and `cachedStudio` / `cachedAgent` in wallet-client.ts:43-44 are
   module-level, surviving warm-start invocations on Vercel. A rotation
   that updates the env without redeploying will leave warm Lambdas
   broadcasting from the old key — they cache the parsed `Account` object,
   not the `process.env` lookup.
4. The AGENT_PRIVATE_KEY rotation procedure is explicitly deferred to
   "X19b.1" with no current draft (ADR 0003 line 171).

**Recommendation:** Author `docs/runbooks/key-rotation.md` covering both
STUDIO and AGENT keys, with a step for either (a) forcing redeploy after
env update to flush the singleton cache, or (b) refactoring the singletons
to revalidate on cache miss. Option (b) is the audit-firm-friendly answer
— rotation should not require a redeploy ceremony.

---

## Finding A-7 — Keys are not present in git history; no leaked hex values detected

**Severity: Info**

**Audit method:** Ran across the full monorepo git history at
`/Users/inancayvaz/MAS`:
- `git log --all -S "STUDIO_PRIVATE_KEY"` returned 20+ commits, all of
  which reference the env var by name only (sprint retrospectives, ADRs,
  env.example, README sections).
- `git log --all -p` filtered for `^\+.*(STUDIO_PRIVATE_KEY|AGENT_PRIVATE_KEY)\s*=\s*0x[a-fA-F0-9]{30,}`
  returned zero matches.
- `git log --all --diff-filter=A --name-only` filtered for `\.env\.local$`
  returned zero hits — `.env.local` has never been added to the index.
- `.gitignore` is not in this worktree (under `.claude/worktrees`), but
  the absence of committed values combined with the comment discipline in
  `apps/api/.env.example:7-14` (Pattern #20 "Generated secret save
  discipline") indicates an established norm.

**Recommendation:** No action required. Add a pre-mainnet `gitleaks` /
`trufflehog` scan to CI as belt-and-suspenders before audit kickoff.

---

## Finding A-8 — Keys are not present in deploy-artifact globs

**Severity: Info**

**File:** `apps/api/vercel.json:11`

The `includeFiles` glob enumerates `node_modules` subpaths only — no
`.env*` patterns, no `secrets/`, no `config/` patterns that would copy a
local secret into the deployed bundle. `apps/orchestrator/vercel.json`
has no `includeFiles` at all. Apps' `.env.local` files are git-ignored
(confirmed by absence in git history) and not copied by `vercel deploy`.

Keys ship via `vercel env add` only; the deployed Lambda reads them from
the platform-injected process.env at cold start.

**Recommendation:** No action required. Worth documenting in the rotation
runbook (Finding A-6) that the only authoritative copy of each key lives
in (a) the operator's password manager and (b) Vercel's encrypted env
store; nothing else.

---

## Cross-Cutting Observation

The 3-wallet topology (STUDIO / AGENT / X402_RECEIVER) is well-segregated
in source — each role has a dedicated singleton, dedicated cache, and the
defensive `signer_mismatch` check at `x402-client.ts:251` proves the team
is thinking about cross-wallet substitution attacks. The Findings A-1 and
A-2 above are not implementation bugs; they're missing **defensive
assertions** that would convert a class of silent on-chain revert into a
boot-time error. For the pre-mainnet audit, the single highest-leverage
mitigation is a `/v1/health` route (or a `getWalletClient()` first-call
assertion) that cross-checks every off-chain-derived signer address
against the on-chain storage slot it claims to be authorized for.
