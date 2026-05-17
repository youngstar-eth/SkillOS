# Off-Chain Key Management — Signer + Wallet Topology (Current State)

**Purpose:** for the pre-mainnet audit pack, document who-holds-what, who-signs-what, who-broadcasts-what, where each key lives, how it rotates, and the gap inventory between intended and actual posture.
**Companion:** `offchain-findings.md` for severity-ranked write-ups, `offchain-trust-boundaries.md` for per-endpoint hops.
**Source of truth (on-chain side):** `contracts/deployments/wallets-base-sepolia.md`. This document mirrors and extends it for the off-chain pipeline.

---

## 1. Canonical addresses

| Role | Address (Base Sepolia) | Source |
|---|---|---|
| `TournamentPool` v2.1 `trustedSigner` | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` | `contracts/deployments/wallets-base-sepolia.md` |
| `ChallengeEscrow` `feeVault` (rotated 2026-05-14, X19b) | `0x455536e4bC148Eba4621d0AfB8EFD59e0654F596` | `contracts/deployments/wallets-base-sepolia.md:23` (registry); zero literal occurrences elsewhere in tree |
| `X402_RECEIVER_ADDRESS` | env-configured per deploy | NOT YET in `wallets-base-sepolia.md` — gap (M14) |

**Verification:** literal address `0xA24f9122…` appears in shipped code at exactly one location: `apps/2048/src/app/api/admin/system-health/route.ts:42` (admin-gated, but rotation-fragile — see L4).

---

## 2. Off-chain key inventory

Three private keys + one receive-only address. The X15.3 split moved AGENT out of STUDIO; X19b separated `feeVault` from `trustedSigner`. The settle-side broadcaster is **still STUDIO** (M11).

### `STUDIO_PRIVATE_KEY`

| Field | Value |
|---|---|
| Derived address | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` (must equal on-chain `trustedSigner`) |
| Loaded by | `apps/api/src/lib/contracts-vendored/attestation.ts:25` (`getSignerAccount`); `packages/lib-shared/src/attestation.ts:30` (`requireSignerAccount`) |
| Cache | Module-level `let cachedAccount` at `attestation.ts:21`; `cachedStudio` at `wallet-client.ts:43-44` (apps/api); also cached inside `getSignerAccount` per lib-shared (`attestation.ts:38-41`) |
| Consumers | apps/api: signs `submitSoloScore` EIP-191 digests (`attestation.ts:95`); broadcasts `submitSoloScore` (`wallet-client.ts:47`). packages/duel-backend: broadcasts `settle`/`flagScore`/`anchorSnapshot`/`createTournament` and acts as **sponsor wallet funding the prize pool** (`cron/tournaments.ts:329-331, 962-970`; `apps/orchestrator/src/app/api/cron/anchor-sp-snapshot/route.ts:111-118`) |
| Roles in one phrase | trustedSigner + cron broadcaster (settle/flag/anchor/create) + prize-pool funder |
| Apps that need the env var | `apps/api`, `apps/orchestrator`, all 6 game apps (via lib-shared) |

### `AGENT_PRIVATE_KEY`

| Field | Value |
|---|---|
| Derived address | env-configured; currently `0x7e7568f0c…` (per memory `project_x15_agent_wallet_split`) |
| Loaded by | `apps/api/src/lib/contracts-vendored/attestation.ts:42` (`getAgentAccount`) |
| Cache | `cachedAgent` at `wallet-client.ts:44`; per-call read via `getAgentAccount` |
| Consumers | (1) Agent EOA — `msg.sender == player` for `chargeRetryFee` (`lib/duel/charge-retry-fee.ts`); (2) EIP-3009 `transferWithAuthorization` signer for x402 USDC settlement (`x402-client.ts:247`); (3) on-chain `player` shown in spectator UI |
| Roles in one phrase | x402 USDC payer + `chargeRetryFee` broadcaster |
| Apps that need the env var | **`apps/api` only** (verified by grep across all 9 apps) |

### `X402_RECEIVER_ADDRESS` (receive-only, NO key on server)

| Field | Value |
|---|---|
| Address shape | hex; validated `0x` + 40 chars at `x402.ts:43-58`; checksummed via `getAddress()` at `x402-client.ts:75-83` (middleware side does NOT checksum — L7) |
| Loaded by | `apps/api/src/lib/x402.ts:43` (`readReceiver`); `apps/api/src/lib/x402-client.ts:76` |
| Consumers | `x402-client.ts:267` (payTo for EIP-3009); paymentMiddleware route map (`x402.ts:67-122`) |
| Role | x402 USDC float — receives $1.05 per agent paid retry from `AGENT_PRIVATE_KEY` |
| Distinctness from STUDIO/AGENT | NOT runtime-asserted (M14) — operator can misconfigure |
| Apps that need the env var | `apps/api` only |

### `feeVault` (on-chain storage; no off-chain key by design)

| Field | Value |
|---|---|
| Address | `0x455536e4bC148Eba4621d0AfB8EFD59e0654F596` (post X19b rotation 2026-05-14) |
| Set by | `ChallengeEscrow.setFeeVault(addr)` from contract owner |
| Read by | `ChallengeEscrow.feeVault()` storage slot; ONLY at on-chain settle time; NOT cross-checked off-chain (M1) |
| Role | Collects ChallengeEscrow protocol fees |
| Off-chain exposure | none — no env var, no app-side key |

---

## 3. Wallet topology map

A consolidated view of env var → loader file:line → consumer file:line → role → which apps must have it set in Vercel.

| Env var | Loader (file:line) | Consumer (file:line) | Role | apps/api | apps/orchestrator | game apps (×6) |
|---|---|---|---|---|---|---|
| `STUDIO_PRIVATE_KEY` | `apps/api/.../attestation.ts:25`; `packages/lib-shared/src/attestation.ts:30` | `apps/api/.../wallet-client.ts:47` (broadcast); `attestation.ts:95` (sign); `packages/duel-backend/src/{settle,cron/tournaments,cron/reconcile-duels,api/admin/reconcile,api/tournaments/{submit,solo}}.ts` | trustedSigner + settle/anchor/create broadcaster + sponsor | ✅ required | ✅ required | ✅ required |
| `AGENT_PRIVATE_KEY` | `apps/api/.../attestation.ts:42` | `wallet-client.ts:55` (broadcast); `x402-client.ts:247` (sign EIP-3009); `lib/duel/charge-retry-fee.ts` | x402 payer + chargeRetryFee broadcaster | ✅ required | ❌ not used | ❌ not used |
| `X402_RECEIVER_ADDRESS` | `apps/api/.../x402.ts:43`; `apps/api/.../x402-client.ts:76` | `x402-client.ts:267`; paymentMiddleware route map | x402 USDC float (receive-only) | ✅ required | ❌ not used | ❌ not used |
| `JWT_SECRET` (≥32 chars) | `apps/api/.../jwt.ts:24-32` | SIWB JWT sign/verify | bearer auth secret | ✅ required | ❌ | ❌ |
| `SIWA_RECEIPT_SECRET` (≥32 chars) | `apps/api/.../agent-receipt.ts:28-34` | SIWA receipt HMAC sign/verify | agent receipt secret | ✅ required | ❌ | ❌ |
| `CRON_SECRET` | each cron `route.ts` line 18 | cron auth | cron entry secret | ❌ | ✅ required (else cron is open in non-prod) | ❌ |

`.env.local.example` files for the game apps and orchestrator currently list **STUDIO only** — correct today (no agent/x402 usage outside apps/api) but undocumented manifest (M4).

---

## 4. Singletons and the warm-start rotation hazard

All three off-chain keys derive `Account` objects cached at module level:

| Cache | Location | Lifetime |
|---|---|---|
| `cachedAccount` (STUDIO) | `apps/api/src/lib/contracts-vendored/attestation.ts:21` | Lambda lifetime |
| `cachedStudio` (STUDIO wallet client) | `apps/api/src/lib/contracts-vendored/wallet-client.ts:43` | Lambda lifetime |
| `cachedAgent` (AGENT wallet client) | `apps/api/src/lib/contracts-vendored/wallet-client.ts:44` | Lambda lifetime |
| `cachedAccount` (STUDIO, lib-shared mirror) | `packages/lib-shared/src/attestation.ts:38-41` | Lambda lifetime |
| `cached` (x402 middleware build, indirectly receiver) | `apps/api/src/lib/x402.ts:123` | Lambda lifetime |

**Rotation hazard (M3):** these caches survive Vercel warm-start invocations. Updating `STUDIO_PRIVATE_KEY` in Vercel env **without redeploying** leaves warm Lambdas broadcasting from the old key until the next cold start. Audit-friendly remediation: refactor singletons to revalidate `process.env` on each lookup, or codify "force redeploy after env update" in the rotation runbook (which does not yet exist for off-chain keys — only on-chain via `SetTournamentPoolSigner.s.sol`).

---

## 5. Missing assertions inventory

These are defensive invariants the code does not yet enforce. Each is a low-LOC patch with high blast-radius savings.

| # | Assertion | Where to put it | Severity | Cluster ref |
|---|---|---|---|---|
| KM-1 | `getSignerAccount().address === publicClient.readContract({ functionName: 'trustedSigner', … })` for TournamentPool v2.1 AND ChallengeEscrow | first call to `getWalletClient()` or `/v1/health` route | **High** | H1 |
| KM-2 | `getAgentAccount().address` ≠ `getSignerAccount().address` (AGENT must not collapse onto STUDIO) | `getAgentAccount()` lazy first-call | Medium | extension of M14 |
| KM-3 | `X402_RECEIVER_ADDRESS` ≠ `STUDIO_ADDRESS` ∧ ≠ `AGENT_ADDRESS` ∧ ≠ deployer | `readReceiver()` lazy first-call or boot `validateWalletTopology()` | Medium | M14 |
| KM-4 | `ChallengeEscrow.feeVault()` matches registry expectation | `/v1/health` exposure | Medium | M1 |
| KM-5 | `STUDIO` has ETH balance ≥ threshold before each cron sweep | top of `runSettleTournaments`/`runCreateTournaments` (mirror `preflightSponsorBalance`) | Medium | M11 |
| KM-6 | Process.env read at every lookup (no module-level Account cache OR explicit revalidate) | refactor `getSignerAccount`/`getAgentAccount` | Medium | M3 |

---

## 6. Git history + deploy-artifact verification (defensive)

- `git log --all -S "STUDIO_PRIVATE_KEY"` → only references by name (20+ commits across retros/ADRs/env.example/README); zero hex values.
- `git log --all -p | grep '^\+.*PRIVATE_KEY\s*=\s*0x[a-fA-F0-9]{30,}'` → zero matches.
- `git log --all --diff-filter=A --name-only` filtered for `\.env\.local$` → zero hits (file never indexed).
- `apps/api/vercel.json:11` `includeFiles` enumerates `node_modules/*` only — no `.env*`, no `secrets/`.
- `apps/orchestrator/vercel.json` has no `includeFiles` at all.

**Authoritative storage of each key:**
1. Operator password manager.
2. Vercel encrypted env store, per Vercel project (apps/api, apps/orchestrator, each game app).

Nothing else. ✅ (Recommendation: add `gitleaks`/`trufflehog` to CI as belt-and-suspenders.)

---

## 7. Mainnet pre-flip checklist (key management subset)

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | Generate new STUDIO + AGENT keys (mainnet fresh, do not re-use testnet) | Pending | Founder only — no agent path |
| 2 | Rotate `feeVault` on mainnet ChallengeEscrow to a distinct address (don't re-use trustedSigner) | Pending | X19b pattern already proven on Sepolia |
| 3 | Choose mainnet `X402_RECEIVER_ADDRESS` — must be distinct from STUDIO/AGENT/deployer; ideally a multisig or dedicated EOA that NEVER signs | Pending | Per memory `reference_secret_handling_split`, no `X402_RECEIVER_PRIVATE_KEY` should exist anywhere |
| 4 | Pin `X402_FACILITATOR_URL` to Coinbase CDP (or chosen facilitator); remove `x402.org` default reliance | Pending | Per `lib/x402.ts:21` |
| 5 | Add startup `validateWalletTopology()` (KM-2, KM-3) | Pending | Low-LOC, high-value |
| 6 | Add `/v1/health` exposure of `trustedSigner()`, `feeVault()`, `owner()` for both contracts (KM-1, KM-4) | Pending | Single endpoint operators and auditors can curl |
| 7 | Author `docs/runbooks/key-rotation.md` covering STUDIO + AGENT off-chain rotation (M3) | Pending | ADR 0003 line 171 defers AGENT rotation to X19b.1 |
| 8 | Decide STUDIO role-split (settle broadcaster ≠ trustedSigner) (M11) | Decision pending | Audit pack should at minimum acknowledge the current conflation in scope |
| 9 | Land `gitleaks`/`trufflehog` in CI | Pending | Pre-mainnet posture |
| 10 | Update `contracts/deployments/wallets-base-sepolia.md` to include `X402_RECEIVER_ADDRESS` row | Pending | Closes M14 documentation gap |
| 11 | Rotate `JWT_SECRET` and `SIWA_RECEIPT_SECRET` for mainnet; document the rotation cascade (all sessions/receipts invalidated) | Pending | M10 |
| 12 | Confirm legacy `apps/2048` cron host disabled before mainnet (avoid dual-host anchor race) | Pending | L5 |

---

## 8. Open questions for audit kickoff

1. Will the mainnet x402 facilitator be Coinbase CDP, an in-house facilitator, or x402.org? Affects H5 trust posture and TLS-pinning requirement.
2. Will `X402_RECEIVER_ADDRESS` be a multisig (e.g., Safe), a dedicated EOA, or `getAddress(operator-controlled-EOA)`? Affects H8 (refund path requires receiver to sign).
3. Does the team intend to split STUDIO into trustedSigner-only + settle-broadcaster keys before mainnet (M11), or accept the conflation and audit it as-is?
4. Is the X19b.1 AGENT rotation procedure in scope for this audit window, or post-audit?
5. Will Vercel cron stay on Hobby (24 h indexer cadence — L6/C12) or move to Pro pre-mainnet?
