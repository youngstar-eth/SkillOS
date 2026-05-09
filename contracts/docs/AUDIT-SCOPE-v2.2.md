# Audit Scope — TournamentPool v2.2

**Document version:** 1.0
**Date:** 2026-05-09
**Companion document:** [ADR-001 — v2.2 migration](./ADR-001-v2.2-migration.md)

This document defines what the audit firm should review for the TournamentPool v2.2 release. It is the canonical artifact handed off at engagement start.

## Scope

### In-scope contracts

| File | Approx LOC (post-PR-4) | Role |
|---|---|---|
| `contracts/src/TournamentPool.sol` | ~820 | Core sweepstakes-tournament contract: prize pools, score submission (duel + solo), settle/distribute, fee collection (70/30 split), dev/platform withdraws, dev NFT mint integration |
| `contracts/src/DevAttributionNFT.sol` | ~110 | Soulbound (ERC-5192) ERC-721 representing dev attribution; minted by `TournamentPool.createTournament` |

**Total in-scope: ~930 LOC of Solidity** (excluding comments, blank lines, and OpenZeppelin imports).

### Out-of-scope contracts (referenced by tests but not modified in v2.2)

| File | Approx LOC | Role | Why out of scope |
|---|---|---|---|
| `contracts/src/SponsorshipModule.sol` | 157 | Permissionless prize-pool top-up gateway (sanctions screening + soulbound receipt mint) | Unchanged surface; only `setUp()` of `SponsorshipModuleTest` updated for the new `TournamentPool` constructor signature |
| `contracts/src/SponsorReceiptSBT.sol` | 172 | Soulbound receipt token minted by `SponsorshipModule` to record sponsor contributions | Unchanged |
| `contracts/src/MockSanctionsOracle.sol` | 45 | Testnet-only sanctions screening; production swap is a separate sprint | Unchanged; production oracle swap is gated separately |
| `contracts/src/ISanctionsOracle.sol` | 13 | Sanctions oracle interface | Unchanged |
| `contracts/src/SkillbaseAnchor.sol` | 123 | Phase-1 result anchor contract (separate flow) | Not part of the v2.2 sweepstakes path |
| `contracts/src/ArcadePool.sol` | 150 | Legacy v1 challenge pool | Pre-v2 design; not deployed in production for v2.x |
| `contracts/src/ChallengeEscrow.sol` | 323 | F2 1v1 challenge escrow | Separate product surface; unchanged |

The audit firm may review out-of-scope contracts at their discretion if they materially affect in-scope code paths. The most likely interaction is `SponsorshipModule → TournamentPool.fundPrizePool` (sponsor top-up flow), which is exercised by `SponsorshipModuleTest` against the v2.2 pool.

### External dependencies

- **OpenZeppelin Contracts v5.0+** — `ERC20`, `IERC20`, `SafeERC20`, `ReentrancyGuard`, `Ownable`, `ECDSA`, `ERC721`, `IERC165`. Imported via the `@openzeppelin/contracts/` path remapping.
- **Forge-Std v1.10+** — used in tests only (`Test`, `Vm`).
- **No other external dependencies.** No oracles (production sanctions oracle is a separate sprint), no proxies, no bridges, no multi-call routers.

### Solidity version

`pragma solidity 0.8.26;` pinned exactly. Optimizer enabled, 200 runs, `via_ir = false` per `foundry.toml`. All in-scope code compiles cleanly under these settings.

## Critical paths to focus on

These are the call sequences where a defect would have material impact. Audit attention here should exceed proportional LOC effort.

### CP-1: Entry-fee 70/30 split (INV1 + INV2)

```
chargeEntryFee(id, player)
  → USDC.safeTransferFrom(player, this, ENTRY_FEE)
  → devShare      = (ENTRY_FEE * DEV_BPS)      / TOTAL_BPS
  → platformShare = (ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS
  → feePaidByPlayer[id][player] += ENTRY_FEE
  → feeCollected_dev[id]        += devShare
  → feeCollected_platform[id]   += platformShare
  → emit EntryFeePaid(id, player, ENTRY_FEE)
```

**Properties to verify:**
- `devShare + platformShare == ENTRY_FEE` exactly at locked constants (no dust stranded).
- `feeCollected_dev[id]` and `feeCollected_platform[id]` are the only state mutated; `prizePool` and other tournament state are untouched.
- Reentrancy: protected by `nonReentrant`; USDC ERC-20 has no callbacks.
- `msg.sender == player` enforced (no third-party fee charges).
- All four lifecycle gates (tournament exists / not settled / started / not ended) enforced.

### CP-2: Settle + prize distribution

```
settle(id, sortedRanking)
  → verify ranking is non-excluded participants in monotone-descending order
  → t.settled = true
  → distribute prizes per the curve (top-3 fixed bps + tier-4 + tier-5 split)
  → refund leftover to sponsor
  → emit TournamentSettled / PrizePaid
```

**Properties to verify:**
- `feeCollected_dev[id]` and `feeCollected_platform[id]` are NEVER read or written by `settle()`.
- Total payouts ≤ `t.prizePool` (no over-distribution).
- Refund to `t.sponsor` accounts for every wei not distributed (no dust stranded post-settle except for the legitimate unused-pool amount).
- `t.settled = true` set BEFORE any USDC transfer (CEI; reentrancy belt-and-suspenders).

### CP-3: Withdraw access control (PR 3)

```
withdrawFeesToDev(id):
  require msg.sender == _tournaments[id].devAddr [revert OnlyDev]
  drain feeCollected_dev[id] to msg.sender; emit DevFeesWithdrawn

withdrawFeesToPlatform(id):
  require onlyOwner
  drain feeCollected_platform[id] to msg.sender; emit PlatformFeesWithdrawn
```

**Properties to verify:**
- Caller-authenticated transfer in both functions: identity (auth) and destination (payout) cannot diverge.
- Each function reads/writes ONLY its own bucket — never the other, never `prizePool`.
- TournamentNotFound naturally caught by `devAddr == 0` mismatch (no real caller has `address(0)` as their msg.sender).
- CEI ordering: bucket zeroed BEFORE transfer.

### CP-4: DevAttributionNFT mint integration (PR 4)

```
createTournament(id, devAddr, ...):
  ...validation + storage writes + emit...
  if (!devNFTMinted[devAddr]) {
      devNFTMinted[devAddr] = true;     // CEI: cache before external call
      devNFT.mint(devAddr);              // bound NFT, immutable address
  }
```

**Properties to verify:**
- Cache flipped BEFORE external call (CEI; bound NFT is trusted code with no callbacks but defense-in-depth still warranted).
- Idempotency: second `createTournament` for the same `devAddr` (any tournament id) skips the mint via cache hit.
- `DevAttributionNFT.mint`'s OZ `_safeMint` reverts on duplicate `tokenId` — defensive backstop for any future cache desync.
- Authorization on `DevAttributionNFT.mint`: only `tournamentPool` may call.
- Soulbound enforcement on `DevAttributionNFT`: `_update` rejects all non-mint movements; `approve` and `setApprovalForAll` revert; `locked()` returns true (reverts on non-existent per ERC-5192 spec).
- Deterministic `tokenId = uint256(uint160(devAddr))` is correctly derived and matches off-chain expectations.

### CP-5: Score submission and ranking math (legacy, unchanged in v2.2)

The duel path (`submitScore`) and solo path (`submitSoloScore`) signatures, signature-verification logic, and the effective-score formula are unchanged from v2.1. Audit firm should still review them since they're in the same contract, but the v2.1 tests + the existing MAS testnet usage form a baseline.

## Invariants list (canonical)

These four invariants are the load-bearing safety properties of v2.2. The test suite contains explicit invariant tests for each (cited).

### INV1 — Sweepstakes-safety storage segregation

`feeCollected_dev[id]`, `feeCollected_platform[id]`, and `t.prizePool` occupy disjoint keccak256-derived storage slots. No code path may read or write across buckets.

**Pinning tests:**
- `test_invariant_feeCollectedDev_isolated_from_prizePool`
- `test_invariant_feeCollectedPlatform_isolated_from_prizePool`
- `test_invariant_settle_does_not_touch_feeCollected_anything`
- `test_invariant_fundPrizePool_does_not_touch_feeCollected_anything`
- `test_invariant_balanceReconciliation_acrossTwoTournaments`
- `test_invariant_feeBuckets_survive_full_lifecycle`
- `test_withdrawFeesToDev_drawsOnlyFromFeeCollectedDev`
- `test_withdrawFeesToPlatform_drawsOnlyFromFeeCollectedPlatform`

**Live-state reconciliation:** for unsettled tournaments,
`USDC.balanceOf(this) == Σ feeCollected_dev[*] + Σ feeCollected_platform[*] + Σ prizePool[*]`

### INV2 — On-chain 70/30 enforcement

`chargeEntryFee` deposits `(ENTRY_FEE * DEV_BPS) / TOTAL_BPS` to `feeCollected_dev[id]` and `(ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS` to `feeCollected_platform[id]` in a single atomic operation. At locked constants the two shares sum exactly to `ENTRY_FEE` (no dust).

**Pinning tests:**
- `test_chargeEntryFee_atomicSplit_70_30`
- `test_BPS_constants_match_locked_values`
- `testFuzz_chargeEntryFee_noDust_holdsForFutureEntryFees`
- `test_chargeEntryFee_noDust_offBy1_introducesDust`

### INV3 — Developer attribution permanence

`Tournament.devAddr` is set at `createTournament` time and cannot be changed. The `DevAttributionNFT` minted to that address is soulbound and cannot be transferred or burned.

**Pinning tests:**
- `test_createTournament_storesDevAddr`
- `test_createTournament_revert_zeroDevAddr`
- `test_transferFrom_revert`
- `test_safeTransferFrom_revert`
- `test_safeTransferFromWithData_revert`
- `test_mintedToken_remainsWithDev_afterRevertedTransferAttempt`

### INV4 — Soulbound NFT compliance + idempotent mint policy

`DevAttributionNFT` implements ERC-5192 fully: `locked()` returns `true` for minted tokens, reverts on non-existent. All non-mint paths through `_update` revert. `approve` and `setApprovalForAll` revert. Mint is idempotent per `devAddr` via `TournamentPool.devNFTMinted` cache, with OZ `_safeMint` as the defensive backstop.

**Pinning tests:**
- `test_locked_returnsTrue_forMintedToken`
- `test_locked_revert_onNonexistentToken`
- `test_approve_revert_explicit`
- `test_setApprovalForAll_revert_explicit`
- `test_mint_revert_onDoubleMintSameDev`
- `test_mint_revert_onNonTournamentPool`
- `test_mint_revert_onZeroDev`
- `test_mint_tokenId_isDeterministicFromDevAddr`
- `test_supportsInterface_includesERC5192`
- `test_createTournament_mintsNFT_onFirstCallPerDev`
- `test_createTournament_skipsNFTMint_onSecondCallSameDev`
- `test_createTournament_differentDevs_mintSeparately`

## Test coverage report (post-PR-4)

| Suite | Tests | Pass rate |
|---|---|---|
| `TournamentPoolTest` | 99 | 100% (99/99) |
| `DevAttributionNFTTest` | 16 | 100% (16/16) |
| `SponsorshipModuleTest` | 11 | 100% (11/11) |
| `ArcadePoolTest` | 15 | 100% (15/15) |
| `ChallengeEscrowTest` | 25 | 100% (25/25) |
| `SkillbaseAnchorTest` | 14 | 100% (14/14) |
| `SponsorReceiptSBTTest` | 14 | 100% (14/14) |
| **Total** | **194** | **100%** |

Run with `forge test`. Snapshot file at `contracts/.gas-snapshot` is regenerated and committed at each merge.

## Known acceptable findings

The following are not bugs but design choices the audit firm may flag. We document the deliberate intent here so the report can categorize them appropriately.

### A1 — `withdrawFeesToPlatform` has no `to` parameter

Identity (`onlyOwner`) and destination (`msg.sender`) cannot diverge. Operationally, the contract owner is expected to be either a treasury multisig (set at deploy) or an admin EOA that performs an ad-hoc transfer to treasury post-withdraw. This was a deliberate design choice for symmetry with `withdrawFeesToDev` and to remove the destination-spoofing surface entirely.

### A2 — `BPS_DENOMINATOR` and `TOTAL_BPS` both equal `10_000`

Two named constants for the same numeric value. Deliberately separate: `BPS_DENOMINATOR` is the prize-curve denominator (used by `BPS_PLACE_1` ... `BPS_TIER5_POOL`); `TOTAL_BPS` is the fee-split denominator (used by `DEV_BPS` and `PLATFORM_BPS`). Future tuning of one domain must not constrain the other. The deliberate-separation comment in the source is the audit-explicit annotation.

### A3 — First-tournament-per-dev gas cost (~78K)

Each developer's first `createTournament` triggers an ERC-721 `_safeMint` and a cache SSTORE — about 78K gas total. Subsequent tournaments hit the cache and add only ~2K (the SLOAD overhead). The cost is an explicit feature, not a regression. Optimization options (lazy mint, plain `_mint`) are documented in ADR-001 §"Open questions" Q1.

### A4 — `t.prizePool` is not zeroed after `settle`

After settle, `t.prizePool` retains the original deposit value in storage; the USDC has been distributed/refunded out. View-layer staleness, not a safety concern (`t.settled = true` gates re-settlement). Founder decision pending — fits naturally into PR 5 integration tests. Surfaced for audit-firm visibility.

### A5 — Permissionless `createTournament`

Any USDC holder can create a tournament with arbitrary `devAddr`. The mint cost (~78K + sponsor's own USDC for prize pool) makes flooding economically unviable, but a determined attacker could mint NFTs to addresses the holder doesn't control. This is an attribution-spoofing surface: a sponsor could falsely attribute a tournament to a developer who didn't author it. Mitigation is off-chain (UI doesn't show un-claimed devAddrs as having attribution; SDK validates devAddr ownership before allowing tournament creation through the SDK path). The audit firm may flag this as a UX/social concern, not a safety bug.

### A6 — Sanctions oracle is a mock on testnet

`MockSanctionsOracle` is a stub; production swap to a real provider (e.g., Chainalysis) is gated separately. Out of v2.2 audit scope. Audit firm should verify that `SponsorshipModule` correctly routes through `ISanctionsOracle` so the production swap can land without contract changes.

## Compilation + deployment artifacts

- **Toolchain:** Foundry, Solc 0.8.26.
- **Build command:** `forge build` (clean, only Foundry's optional asm-keccak256 lint warning, not an error).
- **Format check:** `forge fmt --check` passes on all in-scope files.
- **Test command:** `forge test`.
- **Snapshot:** `forge snapshot --check` passes against the committed `.gas-snapshot`.
- **Static analysis:** Slither is recommended; we do not run it in CI today (Phase 2 discipline transition adds it).
- **Deploy script:** `contracts/script/DeployTournamentPool.s.sol` deploys `DevAttributionNFT` first (via address-prediction), then `TournamentPool` with the NFT address; asserts the prediction held. Targets Base Sepolia (`chainid == 84532`); reverts on any other chain (mainnet deploy gated post-audit).
- **Stack deploy:** `contracts/script/DeploySponsorStack.s.sol` deploys NFT + pool + sanctions oracle + receipt SBT + sponsorship module in one shot, also using address-prediction for the SBT/Module circular dependency.

## Engagement notes

- Audit firm receives this document plus the `e31ce9f` (post-PR-3) main branch + the four merged v2.2 PRs (#49, #50, #51, #52). Final audited commit is the post-PR-4 `main` HEAD.
- Capital trigger: $30–80K engagement budget, post-funding. Mainnet deploy follows audit clearance.
- Communication: GitHub PR comments on the audit report PR; founder is the ADR/scope owner.
- Remediation cadence: each finding gets its own PR; the audit firm re-tests against the patched commit.
