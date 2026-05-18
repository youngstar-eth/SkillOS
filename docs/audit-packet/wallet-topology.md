# SkillOS Wallet Topology — Audit Packet Companion

**Date:** 2026-05-17 (Phase 1 wrap declared)
**Scope:** Role-distinct architecture with current testnet consolidation state and mainnet rotation discipline
**Pairs with:** `skillos-threat-model.md` (Component 9 wallet topology row)
**Sources:** CR1 R3 §8 wallet inventory, UR Pass 1 Track B offchain-findings, memory canonical `apps_api_prebuilt_deploy_recipe` + `project_skillbase_trustedsigner` + `mainnet_wallet_rotation_discipline`

---

## Topology overview

**8 SkillOS-controlled wallet positions** across 3 trust zones, plus a permissionless external surface (anonymous sponsor wallets — not counted as SkillOS wallets). Phase 1 testnet acknowledges several consolidations (deployer = owner, STUDIO = trustedSigner). Mainnet activation requires full separation per rotation discipline + multi-sig owner role.

```
┌────────────────────────────────────────────────────────────────────┐
│  Mainnet cutover discipline                                        │
│  Zero on-chain connection between role-distinct addresses          │
│  Fresh fiat onramps mandatory per role                             │
└────────────────────────────────────────────────────────────────────┘

┌── Protocol authority ─────────────────────────────────────────────┐
│  [Deployer]      [Owner]         [trustedSigner]                  │
│  Deploy auth     Admin params    Score verifier                   │
│  Multi-sig P3 target                                              │
└───────────────────────────────────────────────────────────────────┘

┌── Operational broadcasters ───────────────────────────────────────┐
│  [STUDIO key]    [AGENT key]     [Legacy AGENT]                   │
│  4-5 jobs        X15.3 split     Unrevoked auth                   │
│  Role-split P2 target                                             │
└───────────────────────────────────────────────────────────────────┘

┌── Treasury endpoints ─────────────────┐  ┌── External ──────────┐
│  [feeVault]      [x402 receive]       │  │  [Sponsor]           │
│  Fee accumulator Paid data revenue    │  │  Anyone · anonymous  │
└───────────────────────────────────────┘  └──────────────────────┘
```

(In-chat SVG rendering uses the same 4-zone layout — this ASCII version is for portable audit packet export.)

---

## Wallet inventory — testnet state (8 SkillOS-controlled wallets)

| # | Role | Current EOA | Consolidation flag | Authorization scope | Mainnet rotation plan |
|---|---|---|---|---|---|
| 1 | **Deployer** | TBD verify (likely same as Owner) | Same EOA as Owner today | Contract deploy authority; deployment artifact owner | Fresh fiat onramp; deployer role retires after deploy (single-use intent) |
| 2 | **Owner** | `0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE` (verified May 18 via `owner()` eth_call) | **DISTINCT EOA from STUDIO/trustedSigner** (audit posture upgrade — concentration lower than originally documented). Possibly = Deployer; founder grep contract creation tx to confirm | `setFeeVault`, `emergencyWithdraw`, parameter config on TournamentPool v2.1 + SponsorshipModule | **Multi-sig at mainnet boot (X11.5 sprint)** — Safe Wallet, threshold TBD signer ceremony design |
| 2a | **Safe Wallet (Owner role, X11.5 cutover)** | TBD post-rehearsal (mainnet); testnet rehearsal address documented in REHEARSAL_LOG.md | New EOA via hardware wallet + Safe contract deployment; replaces direct EOA Owner role at mainnet boot | Owner of TournamentPool v2.2 mainnet, SponsorshipModule (ChallengeEscrow excluded — testnet only, sunset per founder Lock #3 / X22 scoping Section B) | **1-of-1 transitional with documented 2-of-2 / 2-of-3 upgrade path** per UPGRADE_PATH.md; signer key hardware-isolated; seed backed up offline geographically distributed |
| 3 | **trustedSigner** (TournamentPool v2.1) | `0xA24f9122568E98B72f4dDD61119C7D92D0975692` | **Same EOA as STUDIO_PRIVATE_KEY** (broadcaster #4 below) — verified May 17 via eth_call against `0x52049b812780134d2F69D6c20C2ef881D49702da` | ECDSA signature verifier for `submitSoloScore`, `submitScore`, `flagScore` | Mainnet rotation: fresh fiat-onramp EOA; ALSO retire STUDIO consolidation — trustedSigner becomes pure verifier, no broadcasting |
| 4 | **STUDIO_PRIVATE_KEY** (broadcaster) | `0xA24f9122568E98B72f4dDD61119C7D92D0975692` (nonce 529, history-contaminated) | **Same EOA as trustedSigner today** | Broadcaster for `createTournament` (×15), `submitSoloScore` (×8), `settle` (×1) on TournamentPool v2.1 + `settle` (×8), `walkover` (×1) on ChallengeEscrow | P2-Pre-B: STUDIO role-split (separate broadcaster per function class); mainnet boot = 4-5 fresh EOAs, not one |
| 5 | **AGENT_PRIVATE_KEY** (X15.3 split) | `0xf481b744c0CB432baD42babB30616790bbA69c91` | Distinct EOA from STUDIO (X15.3 split shipped) | Broadcaster for `chargeRetryFee` (agent path) | Mainnet rotation: fresh fiat onramp; preserves role separation already established |
| 6 | **Legacy AGENT wallet** | `0x1569A95eaF3bB970E5c03F53f026849864C39fdA` | Pre-X15.3 split wallet; distinct from current AGENT_PRIVATE_KEY | **Unrevoked authorization on ChallengeEscrow** (R3 Q-W2) + 1 historical `chargeRetryFee` call mixed with X15.3 split | P2-Pre-Contract: formal revoke before mainnet; ensure no live authorizations carry forward |
| 7 | **feeVault (v2.1)** | **N/A — fees accumulate in TournamentPool contract balance directly** (verified May 18: `feeVault()`, `treasury()`, `feeRecipient()` selectors all revert on v2.1). No separate feeVault EOA in v2.1 design. Owner withdraws fees from contract directly via `emergencyWithdraw` or similar. | v2.1 single-bucket withdrawal | USDC accumulator for retry fees (in contract storage, not separate EOA); v2.2 (X11 sprint) introduces dev address split via `withdrawFeesToDev` + `withdrawFeesToPlatform` | Mainnet v2.2 deploy: dev recipient + platform recipient = separate fresh fiat-onramp EOAs; coordinate with X11 contract changes |
| 8 | **x402 receive** | TBD verify against `apps/api` x402 facilitator config | Likely distinct from feeVault | USDC recipient for paid data tier endpoints (T2 $0.01 / T3 $0.10 per request, CDP facilitator-settled) | Mainnet boot: fresh fiat-onramp EOA; clean accounting separation from prize pool wallets |

### External permissionless surface (not a SkillOS-controlled wallet)

**Sponsor wallets** are anonymous EOAs operated by any third party. They are the external write surface of `SponsorshipModule.sponsorPool()`. They are NOT part of SkillOS-controlled wallet topology — no rotation, no key management, no consolidation analysis applies. Their permissionless-by-design status is an architectural invariant and survives mainnet cutover unchanged. Sanctions screening applies at the SponsorshipModule layer (MockSanctionsOracle testnet → Chainalysis mainnet, P3 swap).

---

## Authorization grants — by contract

### TournamentPool v2.1 (deployed `0x52049b812780134d2F69D6c20C2ef881D49702da` Base Sepolia)

| Function | Caller authorization | Current EOA |
|---|---|---|
| `submitSoloScore(player, score, sig)` | Anyone; sig must verify against `trustedSigner` | trustedSigner = STUDIO (consolidated) |
| `createTournament(...)` | `onlyOwner` OR `trustedBroadcaster` per implementation | STUDIO via broadcast |
| `settle(tournamentId)` | Anyone (idempotent) but typically broadcaster | STUDIO via cron |
| `flagScore(submissionId)` | `onlyTrustedSigner` | STUDIO consolidation |
| `setFeeVault(addr)` | `onlyOwner` | Owner = Deployer |
| `emergencyWithdraw(...)` | `onlyOwner` | Owner = Deployer |

### SponsorshipModule (deployed paired with TournamentPool)

| Function | Caller authorization |
|---|---|
| `sponsorPool(tournamentId, amount)` | **Anyone** (permissionless) — sanctions oracle check |
| `setSanctionsOracle(addr)` | `onlyOwner` |
| `pause` / `unpause` | `onlyOwner` |

### SponsorReceiptSBT (ERC-5192 soulbound)

| Function | Caller authorization |
|---|---|
| `mint(to, sponsorshipId)` | Called by SponsorshipModule on successful sponsor |
| `transferFrom(...)` | **Always reverts** (soulbound by design) |

### ChallengeEscrow (separate contract for duel path)

| Function | Caller authorization | Current EOA |
|---|---|---|
| `settle(...)` | Anyone but broadcasted by STUDIO | STUDIO |
| `walkover(...)` | trustedBroadcaster | STUDIO |
| `chargeRetryFee(...)` | AGENT_PRIVATE_KEY post-X15.3 | AGENT_PRIVATE_KEY (X15.3 split) |

---

## Current consolidation state (testnet) — flagged for audit

| Consolidation | Risk | Mitigation phase |
|---|---|---|
| **Deployer = Owner** | Single key compromise = full protocol takeover (setFeeVault, emergencyWithdraw) | **X11.5 Multi-sig at mainnet boot (P2)** — Owner role transferred to Safe Wallet; Deployer role retired post-deploy |
| **STUDIO = trustedSigner** (same EOA `0xA24f9122...`) | Single key compromise = arbitrary score signature + arbitrary tournament creation + settlement broadcast | Mainnet: separate at deploy. P2-Pre-B role-split for broadcaster jobs. Long-term: trustedSigner becomes pure verifier (no broadcast role) |
| **Owner ≠ trustedSigner ≠ STUDIO** (verified May 18 — `0x3A4F9eB7...` is distinct EOA) | **Positive finding — Owner role already separated from operational broadcasters** | Mainnet: Owner → multi-sig (X11.5); STUDIO role-split (P2-Pre-B); both already on independent rotation paths |
| **STUDIO broadcasts 4-5 distinct job classes** | Single key carries `createTournament` + `submitSoloScore` (agent path) + `settle` + ChallengeEscrow operations | P2-Pre-B: role-split into separate broadcasters per function class |
| **Legacy AGENT wallet unrevoked** | Pre-X15.3 wallet retains ChallengeEscrow authorization | P2-Pre-Contract: explicit revoke before mainnet boot |
| **Manifest declared trustedSigner stale** | Pre-Q-W1 fix, manifest pointed to orphan `0xf35c284D9a...` (zero-history wallet, never actually authorized on-chain) | **Resolved** via PR #119 May 17. P2-Pre-Contract adds pre-deploy assertion script: `assertEq(IPool(addr).trustedSigner(), manifest.trustedSigner)` |

---

## Mainnet rotation discipline (binding)

The following invariants are binding for mainnet activation. Audit firm sign-off requires verification that each is satisfied before cutover:

1. **Zero EOA overlap across trust zones.** Deployer, Owner, trustedSigner, STUDIO broadcasters (multiple), AGENT broadcasters (multiple), feeVault, x402 receive must all be distinct EOAs with no history of wallet-to-wallet transfers.

2. **Fresh fiat-onramp origin for each role-distinct EOA.** No wallet derived via internal transfer from another SkillOS wallet; each funded via separate fiat onramp transaction (e.g., separate Coinbase off-ramp transactions, separate centralized exchange withdrawals).

3. **Testnet wallet `0xA24f9122568E98B72f4dDD61119C7D92D0975692` is NOT mainnet-portable.** Current nonce 529, broadcast history makes it unsuitable for mainnet roles. Permissionless sponsor wallet claim requires zero history.

4. **Legacy AGENT wallet `0x1569A95eaF3bB970E5c03F53f026849864C39fdA` authorizations must be revoked.** Before mainnet redeploy, on-chain proof of revocation (or guarantee via fresh contract deploys with new permission set).

5. **Manifest ↔ chain assertion at deploy time.** `forge script` precondition: `assertEq(IPool(deployedAddr).trustedSigner(), deployment.trustedSigner)`. Manifest drift fails CI loudly. P2-Pre-Contract scope.

6. **Multi-sig owner role at mainnet boot (NOT P3).** Owner role on TournamentPool v2.1 + SponsorshipModule + ChallengeEscrow transitions from EOA to multi-sig (Safe Wallet) at mainnet cutover ceremony. Single-EOA mainnet boot is rejected. Sprint **X11.5 Multi-sig deployment** queued in Phase 2 mainnet pre-reqs — covers Safe Wallet deployment on Base mainnet, signer key generation + secure distribution, threshold + recovery flow design, and pre-cutover dry-run on testnet.

---

## Verification commands (for audit firm or founder pre-cutover)

**On-chain verified May 18, 2026 (BlockchainQuery + raw eth_call):**

```bash
# 1. Verify on-chain trustedSigner matches manifest
cast call 0x52049b812780134d2F69D6c20C2ef881D49702da \
  "trustedSigner()(address)" \
  --rpc-url https://sepolia.base.org
# VERIFIED: 0xA24f9122568E98B72f4dDD61119C7D92D0975692 (STUDIO key)

# 2. Verify owner is distinct from STUDIO/trustedSigner
cast call 0x52049b812780134d2F69D6c20C2ef881D49702da \
  "owner()(address)" \
  --rpc-url https://sepolia.base.org
# VERIFIED: 0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE (distinct EOA, audit posture upgrade)

# 3. feeVault — v2.1 has NO separate feeVault EOA
cast call 0x52049b812780134d2F69D6c20C2ef881D49702da \
  "feeVault()(address)" \
  --rpc-url https://sepolia.base.org
# REVERTS — v2.1 accumulates fees in contract balance; v2.2 will introduce split recipients

# 4. Audit broadcaster nonce + history (per EOA)
cast nonce 0xA24f9122568E98B72f4dDD61119C7D92D0975692 \
  --rpc-url https://sepolia.base.org
# STUDIO key: nonce 529 as of May 17 (history-contaminated, mainnet replacement mandatory)

# 5. Check legacy AGENT wallet for active authorizations
# (manual: scan ChallengeEscrow events for 0x1569A95eaF3bB970E5c03F53f026849864C39fdA)
```

**Additional pending verification (for founder pre-X11.5 multi-sig sprint):**

- Identify `0x3A4F9eB7...d95EEE` ownership: is this the original Deployer wallet, or was ownership transferred? Check `OwnershipTransferred` events on TournamentPool.
- Verify `0x3A4F9eB7...d95EEE` history: nonce + outgoing tx count to confirm it's purpose-distinct from STUDIO.
- Find x402 receive wallet: grep `apps/api` config or check `apps/api/src/lib/x402-config.ts` if exists.

---

## Trust assumptions specific to wallet topology

- **Private keys stored in Vercel environment variables** (per-project scope), not KMS/HSM. Phase 2 evaluation of KMS migration pre-mainnet.
- **Anthropic API key shared across surfaces** (SPF-8 from CR1 §4) — not part of wallet topology but cross-references this section.
- **STUDIO and AGENT broadcaster wallets carry ETH for gas** — depletion handled via X9.1 preflight check (PR #80); mainnet alerting layer Phase 2.
- **Sponsor wallets are anonymous by design** — sanctions screening via MockSanctionsOracle (testnet); Chainalysis at mainnet (P3 swap).

---

**End of wallet topology packet.**

Companion artifacts in audit firm engagement packet:
- `skillos-threat-model.md` (STRIDE matrix)
- Pre-deploy assertion script (P2-Pre-Contract scope, forthcoming)
- UR Pass 1 audit-prep reports (R1-R4 + SYNTHESIS)
- Architecture supplements v1.2 / v1.3 / v1.4
