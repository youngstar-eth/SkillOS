# Sprint X11.0 — v2.2 TournamentPool Extension Spec Freeze

**Status:** SPEC FREEZE (no implementation, no Foundry tests, no deploys)
**Date:** 2026-05-18
**Branch:** `feat/x11-0-spec-freeze`
**Author:** scoping agent (paste-ready prompt execution)
**Founder lock invoked:** May 18, 2026 (Tier 1 + Tier 2 lock, 18 Q approved)
**Critical-path position:** X11 → X11.5 multi-sig cutover → X22 v2.3 redeploy (per v1.6 §3.20 architectural humility sequencing)

---

## Pre-flight verification (executed before write)

| Check | Result |
|---|---|
| `cd /Users/inancayvaz/MAS && git fetch origin` | ✓ |
| Worktree branched from `origin/main` HEAD `5bde6e3` (PR #132) | ✓ via `git worktree add` |
| `docs/architecture/supplements/architecture-doc-supplement-v1.4.md` §3.11 Track A M-1/M-2/M-3 | ✓ canonical audit source |
| `docs/architecture/supplements/architecture-doc-supplement-v1.6.md` §3.20 + §2.9 | ✓ sequencing + velocity calibration sourced |
| `contracts/src/TournamentPool.sol` (832 lines) full read | ✓ codebase v2.2 dev fee splitter shipped; EIP-191 + permissive emergencyWithdraw confirmed |
| `contracts/src/DevAttributionNFT.sol` (121 lines) full read | ✓ ERC-5192 + deterministic tokenId + OnlyTournamentPool guard shipped |
| `contracts/src/ArcadePool.sol` lines 124-134 | ✓ unbounded `for` loop in `refundIfEmpty` confirmed |
| `contracts/src/SponsorReceiptSBT.sol` (172 lines) | ✓ ERC-5192 reference pattern (not the binding template — DevAttributionNFT supersedes for dev attribution) |
| `/tmp/x22-bracket-scoping.md` (649 lines) | ✓ `startBracketRound()` signature constraint sourced from §C.2 + §I.1 |

**Pre-flight drift catalog (forwarded to §K founder docket, NOT acted on in this PR):**

1. **Task referenced "PR #133 merged" — does NOT exist on `origin/main`.** Latest merge is PR #132 (`5bde6e3`). The "drift-cleanup PR #133" the task assumes shipped has not. Proceeding from PR #132 HEAD as ground truth; CLAUDE.md + wallet-topology.md drift fixes therefore still pending (matches the X22 scoping doc §I.9 docket).
2. **Task header said "New contract: DevAttributionSBT.sol".** That contract does not need to be created — `DevAttributionNFT.sol` (121 lines) already ships full ERC-5192 implementation with deterministic `tokenId = uint160(devAddr)`, OnlyTournamentPool guard, defense-in-depth `_update` override. **Section F therefore describes integration of the existing contract, not authorship of a new one.**
3. **TournamentPool.sol IS ALREADY codebase-v2.2** — dev fee splitter (`feeCollected_dev` / `feeCollected_platform`), `chargeEntryFee` 70/30 atomic split, `withdrawFeesToDev` / `withdrawFeesToPlatform`, `IDevAttributionNFT devNFT` binding all shipped. Deployed `0x52049b812780134d2F69D6c20C2ef881D49702da` on Base Sepolia is still v2.1. **Section E therefore locks invariants of what's shipped in code; it does not redesign.**
4. **CLAUDE.md drift (matches X22 scoping §I.9 + memory `project_claudemd_nextjs_version_stale` + `feedback_claudemd_ci_state_stale`):** Next.js version stale, "No CI today" stale, "no via_ir" stale per Foundry dual-profile (X19a.2). Out of scope for this PR; queued for X8 axis-6.

---

## Section A — Scope statement

### A.1 What this spec freezes

v2.2 is an **extension** to the already-deployed v2.1 `TournamentPool` (`0x52049b812780134d2F69D6c20C2ef881D49702da` Base Sepolia). It is **NOT** a replacement, **NOT** an upgradeable proxy, and **NOT** a sibling contract. The single-contract evolutionary path is:

```
v2.1 (deployed testnet, no dev splitter)
   │   ◄── codebase delta merged — devAddr, dev/platform buckets, NFT binding
   ▼
v2.2 (this sprint X11 implements remaining audit remediations + redeploys for mainnet)
   │   ◄── §I.1 path: X22 layers on v2.2; cannot revert M-2 schema
   ▼
v2.3 (X22 bracket extension — adds startBracketRound + BracketType to Tournament struct)
```

The currently merged TournamentPool.sol (the source of truth in `contracts/src/`) corresponds to **codebase v2.2**: dev fee splitter and DevAttributionNFT binding are committed but not audit-blessed nor deployed for mainnet. **X11 v2.2 (the deployable artifact) = codebase v2.2 + the three Track A audit remediations (M-1, M-2, M-3).** Audit firm engagement (X12) reviews this combined artifact.

### A.2 In-scope deliverables (X11 sub-sprints, queued by §J)

| Domain | Status pre-X11.0 | X11 lifts to |
|---|---|---|
| **M-1** `ArcadePool.refundIfEmpty` unbounded loop | Unbounded `for` over `playerList`, single-revert DoS | OpenZeppelin PullPayment (per-player withdraw) |
| **M-2** Signature schema | EIP-191 `\x19Ethereum Signed Message:\n32` on `submitScore` + `submitSoloScore` | EIP-712 typed-data + ERC-6492 unwrap for undeployed smart wallets |
| **M-3** `emergencyWithdraw` | Single `onlyOwner` line, full-balance drain to arbitrary address | Timelock (48h proposal window) + per-bucket scope (sweepstakes-safe) |
| **Dev fee splitter** | Already implemented (codebase v2.2) | **Lock** invariants (§E) + add invariant test stubs (§H) |
| **DevAttributionNFT** | Already implemented + bound in pool constructor | **Lock** mint policy + cache invariant (§F) + add Foundry coverage (§H) |
| **`startBracketRound()` signature** | Does not exist (X22 forward scope) | **Reserve** EIP-712 typehash + auth model (§G); X22 implements unchanged |

### A.3 Out of scope (explicit anti-creep)

- **No Solidity implementation.** This PR ships only `SPEC.md` and (optionally) interface stub `*.sol` files marked clearly as non-implementation. The current SPEC.md commit ships zero `.sol`.
- **No Foundry test bodies.** Section H lists invariant test stubs (file paths, signatures, intended invariants). Test bodies land in X11.4-X11.5.
- **No deploy scripts.** X11.7 ships `DeployTournamentPoolV22.s.sol` + nonce-prediction wiring; out of scope here.
- **No multi-sig cutover.** X11.5 is the cutover sprint; see PR #127 + memory `project_skillbase_sprint_push_policy` for branch-protection invariants. This PR does not touch ownership.
- **No bracket logic.** `startBracketRound()` is signature-locked but not implemented. X22 v2.3 fills the function body.
- **No `apps/api` schema changes.** Bracket-format endpoints are X22.4 scope.
- **No CLAUDE.md or wallet-topology drift fix.** Acknowledged in §K but queued for a standalone drift-cleanup PR (or folded into X22.0 spec-freeze if founder chooses).

### A.4 Sequencing constraint (per v1.6 §3.20 architectural humility)

**X11 → X11.5 → X22** is non-negotiable order:

- X22's `startBracketRound()` MUST use the same EIP-712 schema X11 v2.2 introduces (§C, §G). If X22 ships before X11, it would introduce a second EIP-712 schema or, worse, regress to EIP-191 — either is an audit-rescope event.
- X11.5 multi-sig cutover MUST happen before any mainnet contract deploy. Single-EOA owner concentration is a centralization disclosure surface the audit firm will flag; multi-sig elimination of that disclosure earns audit hours back.
- Reversing the order (X22 → X11) means v2.3 inherits v2.1 EIP-191, then has to re-deploy as v2.4 to fix M-2 — two contract redeploys + two audit cycles instead of one.

This is canonical "instinct correct, structural constraint blocking" — the structural constraint is audit-firm scope amortization, and the response is sequencing discipline, not parallelization.

### A.5 v1.6 §2.9 velocity-calibrated effort summary

| Sub-sprint | Founder-velocity estimate | Agent-velocity (per §2.9 ÷ ~10) |
|---|---|---|
| X11.0 (this PR — SPEC freeze) | 0.5d | **DONE** in single session |
| X11.1 (M-1 PullPayment) | 2-3d | 4-6h |
| X11.2 (M-2 EIP-712 + ERC-6492) | 3-5d | 6-10h |
| X11.3 (M-3 timelock) | 2-3d | 4-6h |
| X11.4 (dev splitter test backfill + invariants) | 2d | 3-5h |
| X11.5 (DevAttributionNFT test backfill) | 1-2d | 2-3h |
| X11.6 (startBracketRound signature freeze in code) | 1d | 2h |
| X11.7 (audit-packet deploy script + NatSpec sweep) | 3-5d | 6-10h |
| **TOTAL** | **~14-21 founder-days** | **~30-45 agent-hours = 4-6 working days sustained** |

Critical path observation: engineering bottleneck collapsed; X12 (audit firm 4-8 weeks) + X13 (Cayman 4-8 weeks) dominate timeline.

---

## Section B — M-1 PullPayment pattern (ArcadePool.refundIfEmpty)

### B.1 Current (vulnerable) implementation

`contracts/src/ArcadePool.sol:124-134`:

```solidity
function refundIfEmpty(uint256 tournamentId) external nonReentrant {
    Tournament storage t = tournaments[tournamentId];
    require(block.timestamp > t.endTime, "Still active");
    require(!t.settled, "Already settled");
    require(t.winner == address(0), "Has winner");
    t.settled = true;
    address[] memory players = playerList[tournamentId];
    for (uint256 i = 0; i < players.length; i++) {
        USDC.safeTransfer(players[i], t.entryFee);
    }
}
```

### B.2 Failure modes

1. **Single-revert DoS.** If `players[i]` is a contract that reverts on USDC `safeTransfer` (e.g., a smart wallet with a custom `_beforeTokenReceive`-style hook that reverts, or a wallet that ran out of gas-stipend handling), the entire `refundIfEmpty` call reverts. Every other player loses access to their refund until the offending player is removed (no such mechanism exists).
2. **Gas-griefing.** Even without a revert, a player can deploy a contract whose receive consumes all forwarded gas, pushing the loop past block gas limit. Refund permanently bricked at N+ players.
3. **No partial recovery.** The `t.settled = true` flag is set BEFORE the loop. If the loop reverts on player i, t.settled remains true on revert (state rolls back), but a subsequent re-attempt with the same input has the same outcome — no progress made.

### B.3 OpenZeppelin PullPayment migration target

Migrate to OpenZeppelin's `PullPayment` mixin pattern (or equivalent escrow-mapping pattern). Each player accrues a withdrawable balance; players pull their own refund.

```solidity
// State delta (replaces the trailing loop):
mapping(uint256 => mapping(address => uint256)) public refundableBalance;

function refundIfEmpty(uint256 tournamentId) external nonReentrant {
    Tournament storage t = tournaments[tournamentId];
    require(block.timestamp > t.endTime, "Still active");
    require(!t.settled, "Already settled");
    require(t.winner == address(0), "Has winner");
    t.settled = true;
    address[] memory players = playerList[tournamentId];
    for (uint256 i = 0; i < players.length; i++) {
        refundableBalance[tournamentId][players[i]] = t.entryFee;
    }
    emit RefundsAccrued(tournamentId, players.length, t.entryFee);
}

function withdrawRefund(uint256 tournamentId) external nonReentrant {
    uint256 amount = refundableBalance[tournamentId][msg.sender];
    if (amount == 0) revert NoRefundAvailable();
    refundableBalance[tournamentId][msg.sender] = 0;  // CEI: zero before transfer
    USDC.safeTransfer(msg.sender, amount);
    emit RefundWithdrawn(tournamentId, msg.sender, amount);
}
```

### B.4 Trade-off analysis

| Concern | Push (current) | Pull (target) |
|---|---|---|
| Block gas limit | Loop bounded by N players × per-transfer gas; bricks at high N | O(1) per withdraw call |
| Single-receiver revert | DoSes entire batch | Affects only that receiver's own pull (refundableBalance unaffected) |
| UX | Auto-refund (no player action) | Player must call `withdrawRefund` (one extra tx, gas-paid by player) |
| Forensics | Single `RefundsAccrued` event | Per-pull `RefundWithdrawn` event; full audit trail |
| Storage cost | None (transient) | One slot per (tournament, player) until withdrawn |
| Sponsor side-effects | If push reverts, sponsor's USDC is stranded in contract | Sponsor's USDC still in contract until each player pulls; no stranding |

### B.5 ArcadePool's role and audit-narrative framing

`ArcadePool` is the **legacy first-iteration entry-fee tournament contract** preceding TournamentPool's sweepstakes-safe architecture. Per v1.4 §3.11 Track A audit, Phase 1 sponsor stack contracts are on the `phase1-legacy` Foundry profile (see memory `project_foundry_dual_profile_phase1_legacy`).

**Disposition options for X11.1:**

| Option | Effort | Audit firm reception |
|---|---|---|
| **(a) Apply PullPayment to ArcadePool.refundIfEmpty in place** | Low | "M-1 fixed in canonical contract" — clean |
| **(b) Sunset ArcadePool, exclude from mainnet, mark M-1 N/A** | Low–Medium | "M-1 dispositioned via contract sunset" — requires legacy-disposition narrative similar to ChallengeEscrow (X22.1) |
| **(c) Leave as-is in legacy profile, document the DoS as Phase-1-only known issue** | Lowest | "Acknowledged + not deployed mainnet" — weakest framing; audit firm may still flag |

**Recommendation candidate (founder Q in §K):** (a) under all paths. The fix is cheap (~30 LOC delta), the audit narrative is cleanest, and even if ArcadePool stays Phase-1-only the fix demonstrates remediation discipline for the audit packet exhibit set.

### B.6 Events emitted

```solidity
event RefundsAccrued(uint256 indexed tournamentId, uint256 playerCount, uint256 entryFee);
event RefundWithdrawn(uint256 indexed tournamentId, address indexed player, uint256 amount);
```

`RefundsAccrued` replaces the implicit "transfers happened" signal of the current loop; `RefundWithdrawn` is per-pull forensic granularity.

---

## Section C — M-2 EIP-712 + ERC-6492 consolidation

### C.1 Current (mixed) implementation

TournamentPool.sol uses **EIP-191 personal-sign** (`\x19Ethereum Signed Message:\n32`) on both submit paths:

```solidity
// _verifySubmitSignature, line 728:
bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
address signer = ECDSA.recover(ethDigest, signature);

// _verifySoloSubmitSignature, line 745: same pattern with a different `digest`
```

The inner `digest` is `keccak256(abi.encode(...fields...))` — structured but not EIP-712.

### C.2 Failure modes

1. **No domain separator.** Same `digest` can be replayed across two contracts on the same chain if they happen to encode identical fields. Currently mitigated only by `address(this)` being inside the encode payload — fragile.
2. **No smart-wallet compat.** EIP-191 personal-sign requires an EOA; counterfactual smart wallets (Base Account, Smart Account, ERC-4337) cannot produce a valid `\x19...`-prefixed signature pre-deployment. The pool currently rejects all smart-wallet submitters that haven't yet executed their first tx.
3. **Tooling friction.** EIP-712 typed-data has UI support in every major wallet (MetaMask, Rabby, Frame, Base Account); EIP-191 displays as opaque bytes. UX cost for the human-path submit cron and any direct-call flows.
4. **No canonical schema.** Bracket extension (X22 `startBracketRound`) needs to add a new signed message type. If it inherits EIP-191, the audit firm flags inconsistency. If it introduces EIP-712 mid-tree, two schemas coexist — worse.

### C.3 EIP-712 target

Add an `EIP712Domain` to TournamentPool:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// In TournamentPool constructor:
//   EIP712("SkillOS-TournamentPool", "1")

// EIP-712 typehashes (locked):
bytes32 public constant SCORE_SUBMIT_TYPEHASH = keccak256(
    "ScoreSubmit(bytes32 id,address player,uint256 score,uint256 matchCountDelta,bytes32 nonce)"
);

bytes32 public constant SOLO_SCORE_SUBMIT_TYPEHASH = keccak256(
    "SoloScoreSubmit(bytes32 id,address player,uint256 score,bytes32 soloRunId,uint256 matchCountDelta,bytes32 nonce)"
);

// X22 forward (locked in this spec; implemented in X11.6 + X22):
bytes32 public constant BRACKET_ROUND_START_TYPEHASH = keccak256(
    "BracketRoundStart(bytes32 id,uint8 round,address[] pairings,bytes32 nonce)"
);
```

`EIP712Domain` provides `name`, `version`, `chainId`, `verifyingContract` — replacing the ad-hoc inclusion of `address(this)` and `block.chainid` inside the message payload. Standard OZ `EIP712._hashTypedDataV4(structHash)` produces the final digest.

### C.4 ERC-6492 unwrap for smart-wallet pre-deployment

Counterfactual smart wallets (Base Account, ERC-4337) signing before they're deployed embed deployment data in the signature per ERC-6492. Two-step verification:

1. Detect ERC-6492 wrapper (signature ends with magic suffix `0x6492...6492`).
2. If wrapped: unpack `(factory, factoryCalldata, innerSignature)`, simulate-deploy the wallet via `eth_call` to the factory, then call `isValidSignature` on the (now-deployed-virtually) wallet.
3. If not wrapped: standard EOA ECDSA recovery.

OpenZeppelin's `SignatureChecker.isValidSignatureNow(signer, digest, signature)` (v5.x) supports both EOA and ERC-1271. For ERC-6492 unwrap, the pool needs to either:

- (i) Use the canonical reference unwrap implementation from the Coinbase Smart Wallet SDK (audited dependency), OR
- (ii) Implement an inline `_isValidERC6492Signature` helper using `SignatureChecker` + `eth_call` pre-deploy simulation.

**Implementation recommendation (founder Q in §K):** (i) if the canonical unwrap is available as a Solidity library; (ii) otherwise as inline helper. The audit firm will pattern-match against the canonical implementation either way.

### C.5 Signature versioning + migration

EIP-712 introduction is a **breaking change** for the backend signer. Migration sequence:

1. **Pre-deploy:** Backend `STUDIO_PRIVATE_KEY` signer is updated to produce EIP-712 typed-data signatures using `viem.signTypedData()` or `ethers.signTypedData()`. SDK + duel-backend cron emit sites all touch.
2. **Deploy v2.2:** New contract address; old v2.1 contract stays live for in-flight tournaments to settle.
3. **Cut-over:** Cron `runCreateTournaments` flips to v2.2 address; in-flight v2.1 tournaments settle on old contract.
4. **Decommission v2.1:** After last v2.1 tournament settles, v2.1 address goes read-only (no new createTournament).

`trustedSigner` slot on v2.2 stays the same EOA; only the *signature format* changes. Smart-wallet trustedSigner (post-X11.5) is a separate sub-sprint dependency.

### C.6 X22 inheritance constraint

**Lock:** `startBracketRound()` (X22.2 implementation) MUST verify signatures using `BRACKET_ROUND_START_TYPEHASH` against the same `EIP712Domain("SkillOS-TournamentPool", "1")` v2.2 introduces. No EIP-191 fallback. No second domain.

This is the single most important sequencing invariant in this spec — see §A.4 + §I.1 cross-ref.

---

## Section D — M-3 emergencyWithdraw timelock + bucket-scoped

### D.1 Current (over-powered) implementation

TournamentPool.sol:636:

```solidity
function emergencyWithdraw(address to) external onlyOwner {
    if (to == address(0)) revert ZeroAddress();
    uint256 balance = USDC.balanceOf(address(this));
    USDC.safeTransfer(to, balance);
}
```

A single owner-only call drains the **entire USDC balance** to an arbitrary destination. The owner is currently the EOA `0xA24f9122…` deployer; post-X11.5 it becomes a Safe multi-sig.

### D.2 Failure modes

1. **Cross-bucket exfiltration.** Today's contract balance is `sum(prizePool[id]) + sum(feeCollected_dev[id]) + sum(feeCollected_platform[id]) + sponsor top-ups + dust`. A single `emergencyWithdraw` call zeroes all four buckets in the on-chain accounting view from the *players'* perspective, even though the storage slots aren't actually zeroed (they're "stranded" while the underlying USDC is gone). Withdrawals against `prizePool` after this point would underflow on `safeTransfer`.
2. **No delay window.** Compromised owner key → instant drain. No on-chain warning. No opportunity for players or sponsors to react. No timelock means the operational-security perimeter is "key custody must never be compromised, ever" — a high bar even with multi-sig.
3. **No bucket-scoped recovery.** Real-world emergency cases — recovering a stuck USDC top-up that missed a tournament id, sweeping dust below the prize curve resolution — would benefit from per-bucket access. Currently the function is all-or-nothing.

### D.3 Timelock + bucket-scoped target

```solidity
enum EmergencyBucket {
    PrizePoolOf,         // requires bytes32 tournamentId argument
    FeeCollectedDevOf,   // requires bytes32 tournamentId argument
    FeeCollectedPlatformOf, // requires bytes32 tournamentId argument
    DustOnly             // USDC.balanceOf(this) − sum(all tracked buckets); strict
}

struct EmergencyProposal {
    EmergencyBucket bucket;
    bytes32 tournamentId;   // 0x00..00 for DustOnly
    address to;
    uint256 amount;
    uint64 executeAfter;
    bool executed;
    bool cancelled;
}

uint64 public constant EMERGENCY_DELAY = 48 hours;
mapping(bytes32 => EmergencyProposal) public emergencyProposals;
// proposalId = keccak256(abi.encode(bucket, tournamentId, to, amount, nonce))

function proposeEmergencyWithdraw(
    EmergencyBucket bucket,
    bytes32 tournamentId,
    address to,
    uint256 amount
) external onlyOwner returns (bytes32 proposalId);

function cancelEmergencyWithdraw(bytes32 proposalId) external onlyOwner;

function executeEmergencyWithdraw(bytes32 proposalId) external onlyOwner nonReentrant;

event EmergencyWithdrawProposed(
    bytes32 indexed proposalId,
    EmergencyBucket bucket,
    bytes32 indexed tournamentId,
    address indexed to,
    uint256 amount,
    uint64 executeAfter
);
event EmergencyWithdrawCancelled(bytes32 indexed proposalId);
event EmergencyWithdrawExecuted(bytes32 indexed proposalId);
```

### D.4 Execution semantics

`executeEmergencyWithdraw` must verify:

1. `proposal.executed == false` and `proposal.cancelled == false`
2. `block.timestamp >= proposal.executeAfter`
3. Bucket-scoped balance check:
   - `PrizePoolOf`: `amount <= _tournaments[tournamentId].prizePool` AND `!_tournaments[tournamentId].settled`
   - `FeeCollectedDevOf`: `amount <= feeCollected_dev[tournamentId]`
   - `FeeCollectedPlatformOf`: `amount <= feeCollected_platform[tournamentId]`
   - `DustOnly`: `amount <= USDC.balanceOf(address(this)) - _sumAllTrackedBuckets()`

After execution, decrement the corresponding storage slot (CEI), then transfer.

`_sumAllTrackedBuckets()` is the expensive case (O(N) over all tournaments). Two implementation choices:

- (i) **On-the-fly compute** — accept O(N) gas hit on `DustOnly` execute; acceptable because this is an admin path called rarely.
- (ii) **Running accumulator** — maintain a `uint256 _trackedTotal` that all bucket mutations update atomically. O(1) dust check; ~100 gas overhead on every chargeEntryFee, settle, createTournament, fundPrizePool. **Recommended** (founder Q in §K) for the cleaner pattern, especially under cron-heavy load.

### D.5 Sweepstakes-safe storage invariant preserved

Per CLAUDE.md architectural invariant #1: `prizePool`, `feeCollected_dev`, `feeCollected_platform` live on disjoint keccak slots. M-3 promotes that disjointness from a storage-layout invariant to a **function-level invariant** — `executeEmergencyWithdraw` literally cannot reach more than one bucket per call.

This is the audit-narrative upgrade: "you don't just need to trust the storage layout, you can verify the per-call access restriction in code."

### D.6 Multi-sig interaction (post-X11.5)

Once X11.5 cuts ownership to a Safe multi-sig:

- `proposeEmergencyWithdraw` requires multi-sig signers (threshold per X11.5 decision).
- 48h delay window starts ticking from the proposal block.
- Multi-sig can `cancelEmergencyWithdraw` during the window (single canceler call OR threshold? — see §K Q).
- `executeEmergencyWithdraw` requires multi-sig signers again (same threshold OR lower? — see §K Q).

**Pre-X11.5 transitional posture:** owner is single EOA. Same proposal-delay-execute flow, just signed by one key. Audit firm flags transitional centralization but the timelock protects against owner-key compromise.

---

## Section E — Dev fee splitter (lock invariants of shipped code)

### E.1 What's already in code (TournamentPool.sol)

```solidity
// Constants (lines 176-182):
uint256 public constant DEV_BPS = 7000;          // immutable 70%
uint256 public constant PLATFORM_BPS = 3000;     // immutable 30%
uint256 public constant TOTAL_BPS = 10_000;
uint256 public constant ENTRY_FEE = 1_000_000;   // 1 USDC (6 decimals)

// Storage (lines 251, 258):
mapping(bytes32 => uint256) public feeCollected_dev;
mapping(bytes32 => uint256) public feeCollected_platform;

// Struct field (line 112):
struct Tournament {
    address sponsor;
    address devAddr;             // immutable per-tournament
    // ... other fields ...
}

// createTournament (lines 330-370): devAddr parameter required, ZeroAddress check, recorded immutably
// chargeEntryFee (lines 524-542): atomic 70/30 split into the two buckets
// withdrawFeesToDev (lines 609-617): onlyDev (msg.sender == storedDevAddr), drains dev bucket
// withdrawFeesToPlatform (lines 627-633): onlyOwner, drains platform bucket
```

### E.2 Invariants locked (audit-firm verification surface)

**INV-S1 (Sweepstakes segregation):** For every tournament `id` and every block `b`:
```
storage_slot(prizePool[id]) ≠ storage_slot(feeCollected_dev[id]) ≠ storage_slot(feeCollected_platform[id])
```
All three are derived from distinct `keccak256(abi.encode(id, mappingSlot))` paths. No code path in the contract writes to more than one of these slots in a single call (verified by `static-analysis Slither`'s storage-write trace).

**INV-S2 (Atomic split conservation):** For every successful `chargeEntryFee(id, player)`:
```
ΔfeeCollected_dev[id] + ΔfeeCollected_platform[id] == ENTRY_FEE
ΔfeeCollected_dev[id] / ΔfeeCollected_platform[id] == DEV_BPS / PLATFORM_BPS  (exact at locked constants)
```
At `ENTRY_FEE = 1_000_000` and `DEV_BPS = 7000`, `PLATFORM_BPS = 3000`: `devShare = 700_000`, `platformShare = 300_000`, sum = `1_000_000` exact. No stranded dust.

**INV-S3 (Per-player accounting):** For every (id, player) pair:
```
feePaidByPlayer[id][player] == ENTRY_FEE × number_of_successful_chargeEntryFee_calls(id, player)
```
And: `soloSubmissionCount[id][player] ≥ 1 ⇒ feePaidByPlayer[id][player] >= (soloSubmissionCount[id][player] - 1) × ENTRY_FEE` (the "first solo free" rule).

**INV-S4 (Identity-payout coupling):** `withdrawFeesToDev` MUST transfer to `msg.sender == _tournaments[id].devAddr`. `withdrawFeesToPlatform` MUST transfer to `msg.sender == owner()`. **No destination parameter.** The audit-firm-friendly framing: "access-control identity and payout destination are physically coupled; they cannot diverge."

**INV-S5 (No prize-pool reachability from fee paths):** Static-analysis trace from `withdrawFeesToDev` + `withdrawFeesToPlatform` cannot write to `prizePool` or `_tournaments[id].prizePool`. Settle path cannot write to either fee bucket. Verified by Slither's `data-flow-write` rule.

### E.3 Locked constants and immutable parameters

Per §A.2 task line "Hard-coded 70/30 Phase 2 (immutable, audit firm friendly)":

| Parameter | Value | Mutability | Rationale |
|---|---|---|---|
| `DEV_BPS` | `7000` | Immutable | Audit-firm friendly: zero owner-tuneable revenue surface. Any change = audit-rescope event. |
| `PLATFORM_BPS` | `3000` | Immutable | Same. |
| `TOTAL_BPS` | `10_000` | Immutable | Standard denominator. |
| `ENTRY_FEE` | `1_000_000` (1 USDC) | Immutable | Locked at audit-firm-friendly constant; future per-game variable-fee = v2.4+ scope. |

If founder later wants variable per-tournament fees → v2.4 sprint (post-mainnet). NOT in X11 scope.

### E.4 What this section does NOT do

- Does **not** propose adding the dev splitter (already in code).
- Does **not** propose deploying — that's X11.7 packaging.
- Does **not** add tests — that's X11.4 backfill.
- Does **lock** the five invariants above as audit-firm-presentable text.

### E.5 Backwards-compatibility note

v2.1 (deployed) does not have `devAddr` on Tournament. v2.2 redeploys with the new struct layout. **In-flight v2.1 tournaments must finish on v2.1 contract.** Cron `runCreateTournaments` switches to v2.2 only after the operational cutover window (per §C.5 migration sequence).

---

## Section F — DevAttributionNFT integration (existing contract — lock binding)

### F.1 What's already in code

`contracts/src/DevAttributionNFT.sol` (121 lines) ships:

- ERC-721 with `IERC5192` (soulbound interface) declared via `supportsInterface(0xb45a3c0e)`.
- Constructor parameter `_tournamentPool` (immutable) — pinned via address-prediction (`vm.computeCreateAddress` in tests, nonce arithmetic in deploy scripts).
- `mint(address dev)` — `OnlyTournamentPool` guard + `ZeroAddress` guard + deterministic `tokenId = uint256(uint160(dev))`.
- `locked(uint256 tokenId)` — returns `true` for any existing token; reverts on nonexistent.
- `approve` / `setApprovalForAll` — revert `Soulbound()` (no silent no-op).
- `_update` override — allows mint (`from == address(0)`); rejects all other transitions (transfers AND duplicate mints, because `_ownerOf` returns existing owner making `from != 0` on second mint of same tokenId).
- `Locked` event emitted at mint; `Unlocked` event declared but never emitted (locked status is permanent).

### F.2 Pool-side integration (already in code)

TournamentPool.sol:

```solidity
// Storage (line 202):
IDevAttributionNFT public immutable devNFT;

// Cache (line 212):
mapping(address => bool) public devNFTMinted;

// Constructor (lines 305-312):
constructor(IERC20 _usdc, address _trustedSigner, address _devNFT) Ownable(msg.sender) {
    if (address(_usdc) == address(0)) revert ZeroAddress();
    if (_trustedSigner == address(0)) revert ZeroAddress();
    if (_devNFT == address(0)) revert ZeroAddress();
    USDC = _usdc;
    trustedSigner = _trustedSigner;
    devNFT = IDevAttributionNFT(_devNFT);
}

// createTournament integration (lines 366-369):
if (!devNFTMinted[devAddr]) {
    devNFTMinted[devAddr] = true;       // set BEFORE external call (CEI)
    devNFT.mint(devAddr);
}
```

### F.3 Invariants locked

**INV-N1 (Idempotent mint):** For every `devAddr`, the NFT mints **exactly once** across the lifetime of the contract. Tested by:
- Pool-side cache `devNFTMinted[devAddr]` short-circuits the second-and-onward `createTournament(devAddr, ...)` calls.
- NFT-side `_update` override revert-fires on duplicate `tokenId` even if pool cache is desynced (defense-in-depth — see line 49 of DevAttributionNFT.sol NatSpec).

**INV-N2 (CEI ordering):** Pool sets `devNFTMinted[devAddr] = true` BEFORE calling `devNFT.mint(devAddr)`. Even though the NFT is trusted code with no callbacks, the order means a reentrant call into pool would see `devNFTMinted = true` and skip the mint.

**INV-N3 (Pinned binding):** `IDevAttributionNFT public immutable devNFT` + `address public immutable tournamentPool` on NFT side. Neither contract can re-target the other after deployment. Address-prediction at deploy time is required (see §I.7 deploy ordering).

**INV-N4 (Soulbound enforcement at lowest hook):** All transitions (transfer, safeTransferFrom, burn) revert via `_update` override. `approve` + `setApprovalForAll` revert directly (defense-in-depth — marketplace UIs see the constraint at the approve site, not later at transferFrom).

**INV-N5 (Deterministic discoverability):** `ownerOf(uint256(uint160(devAddr)))` returns `devAddr` ⇔ NFT minted for that wallet. No off-chain index required. Audit-firm-friendly: any explorer can verify dev attribution without trust.

### F.4 Why this section does NOT propose a new contract

The task header initially read "New contract: DevAttributionSBT.sol (ERC-5192 pattern copy from SponsorReceiptSBT)". Pre-flight read found:

- `DevAttributionNFT.sol` already shipped with stronger guarantees than the SponsorReceiptSBT pattern:
  - SponsorReceiptSBT allows burn (`to == address(0)` permitted in `_update`); DevAttributionNFT rejects burn (`from != address(0)` revert path catches it).
  - SponsorReceiptSBT uses monotonic `nextTokenId`; DevAttributionNFT uses deterministic `uint160(devAddr)` — superior for explorer discoverability.
  - SponsorReceiptSBT mints from a single immutable `MINTER` (the SponsorshipModule); DevAttributionNFT mints from immutable `tournamentPool` — same pattern, different counterparty.

Authoring a second contract would either duplicate `DevAttributionNFT` (waste) or supersede it (breaks the existing pool binding and forces a contract redeploy + audit re-engagement). **The correct X11 disposition is: keep `DevAttributionNFT.sol`, lock its invariants per §F.3, backfill Foundry coverage per §H.**

### F.5 Metadata strategy (founder Q in §K)

Current `DevAttributionNFT` does NOT override `tokenURI`. The default OZ ERC-721 returns empty unless `_baseURI()` is overridden. Two options:

- (i) **No metadata** — Phase 2 launch as "data-light SBT" — discoverable via tokenId arithmetic only; no JSON. Audit-firm reception: clean, minimum surface.
- (ii) **On-chain JSON metadata** (mirror `SponsorReceiptSBT._buildJSON` pattern) — embed `{ devAddress, firstTournamentId, mintedAt }`. Requires adding `firstTournamentId` + `mintedAt` storage. ~30 LOC delta. Audit-firm reception: marginal — metadata isn't a security surface, but the per-NFT storage cost is.
- (iii) **IPFS metadata** — `tokenURI` returns `ipfs://...` pointing to off-chain JSON. Reject: violates the "no off-chain dependency" pattern SponsorReceiptSBT chose for soulbound NFTs.

**Recommendation candidate:** (i) for X11; (ii) deferred to v2.4 if dev attribution discoverability becomes a UX priority.

---

## Section G — `startBracketRound()` signature reservation (X22 v2.3 forward)

### G.1 Purpose of this section

X22 v2.3 (per `/tmp/x22-bracket-scoping.md` §C.2 + §I.1) will add a `startBracketRound()` function. The function body is X22's scope, **but the function signature, EIP-712 typehash, and authorization model MUST be locked here** so X22 inherits the M-2 EIP-712 schema unchanged.

This is the **single most important inter-sprint coupling in the X11 → X22 chain** (per §A.4).

### G.2 Locked function signature

```solidity
/// @notice Start the next round of a single-elim bracket tournament.
/// @dev    Records the round's pairings on-chain via EIP-712 attestation.
///         Authorized: trustedSigner (server-side cron-keeper). May be lifted to
///         a dedicated cron-keeper EOA in X11.6 — see §K Q4.
/// @param  id        Tournament identifier (must exist, must have
///                   bracketType == BracketType.SingleElim, must be in window).
/// @param  round     Round index (0..bracketTotalRounds-1). Must equal current
///                   bracketCurrentRound at call time.
/// @param  pairings  Array of pairings for this round; layout is players[]
///                   flattened — index 2i and 2i+1 face each other.
///                   pairings.length == bracketSize >> round.
/// @param  nonce     Unique per-attestation nonce.
/// @param  signature EIP-712 typed-data signature from trustedSigner.
function startBracketRound(
    bytes32 id,
    uint8 round,
    address[] calldata pairings,
    bytes32 nonce,
    bytes calldata signature
) external;
```

### G.3 Locked EIP-712 typehash (X11.2 implements, X22.2 consumes)

```solidity
bytes32 public constant BRACKET_ROUND_START_TYPEHASH = keccak256(
    "BracketRoundStart(bytes32 id,uint8 round,address[] pairings,bytes32 nonce)"
);
```

EIP-712 struct encoding for `address[] pairings`: hash of `keccak256(abi.encodePacked(pairings))` per EIP-712 spec for dynamic arrays.

Domain: same `EIP712("SkillOS-TournamentPool", "1")` X11.2 introduces. **No second domain. No EIP-191 fallback.**

### G.4 Locked authorization model

`startBracketRound` MUST verify:

1. `usedNonces[nonce] == false` (replay protection via the existing global nonce set — X11 keeps this; X22 inherits).
2. EIP-712 typed-data signature recovers to `trustedSigner` (or to the X22-introduced `bracketKeeperSigner`, if §K Q4 founder decision lifts the role).
3. `_tournaments[id].bracketType == BracketType.SingleElim` (X22 adds this struct field; not in X11 scope).
4. `round == _tournaments[id].bracketCurrentRound`.
5. `pairings.length == _tournaments[id].bracketSize >> round`.
6. `block.timestamp >= _tournaments[id].startsAt` and `block.timestamp < _tournaments[id].endsAt`.
7. `!_tournaments[id].settled`.

### G.5 Locked event emissions

```solidity
event BracketRoundStarted(
    bytes32 indexed id,
    uint8 indexed round,
    address[] pairings,
    bytes32 nonce
);

event BracketMatchSettled(
    bytes32 indexed id,
    uint8 round,
    uint16 matchIndex,
    address winner,
    string tiebreakPath  // "total_score" | "fewer_attempts" | "h2h" | "coin_flip"; empty for clean wins
);

event BracketAdvancement(
    bytes32 indexed id,
    uint8 nextRound,
    address[] advancing
);
```

X22 may emit additional events; these three are the contract-API floor.

### G.6 Why lock this now

If X22.2 implements `startBracketRound` against a different EIP-712 domain or typehash, then:

- X22 mainnet deploy re-uses M-2 work → wasted audit hours.
- Or X22 introduces second domain → cross-domain replay surface (low probability, but audit-flaggable).
- Or X22 forgets to use EIP-712 entirely → reverts M-2.

Locking the signature + typehash + auth model in X11.0 means X22.2's implementation has zero design flexibility on these three surfaces. It's a constraint, not a feature, and that's the point.

---

## Section H — Foundry invariant test stubs

### H.1 Files to create (X11.4 + X11.5; bodies NOT in this PR)

```
contracts/test/invariant/V22Invariants.t.sol         — pool-side invariants (E + B + D)
contracts/test/invariant/DevAttributionNFTInvariants.t.sol  — NFT-side invariants (F)
contracts/test/invariant/ArcadePoolPullPayment.t.sol — M-1 invariants
contracts/test/X11_StartBracketRound_Signature.t.sol — G.2-G.5 lock test (no body)
```

### H.2 Invariant test stubs (signatures + intended invariants only)

```solidity
// V22Invariants.t.sol
contract V22Invariants is StdInvariant, Test {
    TournamentPool pool;
    MockUSDC usdc;
    DevAttributionNFT nft;
    Handler handler;
    bytes32[] trackedTournaments;

    function setUp() public { /* deploy + bind + spin up Handler with bounded operations */ }

    /// @notice INV1: Sum of dev + platform fee buckets == total fees charged minus total withdrawn
    function invariant_feeAccountingConservation() public {
        for (uint256 i; i < trackedTournaments.length; ++i) {
            bytes32 id = trackedTournaments[i];
            uint256 totalCharged = handler.totalFeesCharged(id);
            uint256 totalWithdrawn = handler.totalDevWithdrawn(id) + handler.totalPlatformWithdrawn(id);
            assertEq(
                pool.feeCollected_dev(id) + pool.feeCollected_platform(id),
                totalCharged - totalWithdrawn,
                "INV-S1 violated"
            );
        }
    }

    /// @notice INV2: 70/30 split exact at locked constants — no dust stranded
    function invariant_feeSplitRatio() public {
        for (uint256 i; i < trackedTournaments.length; ++i) {
            bytes32 id = trackedTournaments[i];
            uint256 totalCharged = handler.totalFeesCharged(id);
            uint256 totalDev = pool.feeCollected_dev(id) + handler.totalDevWithdrawn(id);
            uint256 totalPlat = pool.feeCollected_platform(id) + handler.totalPlatformWithdrawn(id);
            assertEq(totalDev, (totalCharged * 7000) / 10_000, "INV-S2 dev share drift");
            assertEq(totalPlat, (totalCharged * 3000) / 10_000, "INV-S2 platform share drift");
            assertEq(totalDev + totalPlat, totalCharged, "INV-S2 sum drift");
        }
    }

    /// @notice INV3: fundPrizePool never touches fee buckets
    function invariant_fundPrizePool_doesNotTouchFeeBuckets() public {
        assertEq(handler.fundPrizePoolFeeDevDelta(), 0);
        assertEq(handler.fundPrizePoolFeePlatformDelta(), 0);
    }

    /// @notice INV4: emergencyWithdraw obeys timelock (M-3)
    function invariant_emergencyWithdraw_blockedBeforeDelay() public {
        // Handler tracks every emergencyWithdraw attempt; any execute-before-delay must revert
        assertEq(handler.emergencyExecutesBeforeDelay(), 0, "INV-M3 timelock bypass");
    }

    /// @notice INV5: emergencyWithdraw cannot exceed per-bucket scope
    function invariant_emergencyWithdraw_bucketScoped() public {
        assertEq(handler.emergencyOverBucketBudget(), 0, "INV-M3 bucket-scope bypass");
    }

    /// @notice INV6: prizePool storage is disjoint from fee buckets across all writes
    function invariant_sweepstakesSegregation() public {
        // Verified via Slither in CI; this test is a runtime corroboration
        for (uint256 i; i < trackedTournaments.length; ++i) {
            bytes32 id = trackedTournaments[i];
            TournamentPool.Tournament memory t = pool.getTournament(id);
            // No code path can have written to t.prizePool from a withdrawFeesTo* call
            // No code path can have written to feeCollected_* from a settle() call
            // Encoded as a Handler-tracked cross-write counter:
            assertEq(handler.crossBucketWrites(), 0, "INV-S5 cross-bucket write detected");
        }
    }
}
```

```solidity
// DevAttributionNFTInvariants.t.sol
contract DevAttributionNFTInvariants is StdInvariant, Test {
    /// @notice INV-N1: Exactly one mint per devAddr
    function invariant_mintIdempotency() public {
        for (uint256 i; i < trackedDevs.length; ++i) {
            address dev = trackedDevs[i];
            if (pool.devNFTMinted(dev)) {
                assertEq(nft.ownerOf(uint256(uint160(dev))), dev);
                assertEq(handler.mintCallsForDev(dev), 1);  // pool's first createTournament only
            }
        }
    }

    /// @notice INV-N4: All transfer / approve paths revert
    function invariant_soulboundEnforcement() public {
        assertEq(handler.successfulTransfers(), 0);
        assertEq(handler.successfulApprovals(), 0);
    }

    /// @notice INV-N5: Deterministic tokenId from devAddr
    function invariant_deterministicTokenId() public {
        for (uint256 i; i < trackedDevs.length; ++i) {
            address dev = trackedDevs[i];
            if (pool.devNFTMinted(dev)) {
                assertEq(nft.ownerOf(uint256(uint160(dev))), dev);
            }
        }
    }
}
```

```solidity
// ArcadePoolPullPayment.t.sol
contract ArcadePoolPullPayment is Test {
    /// @notice M-1 INV: Reverting receiver cannot DoS other players' refunds
    function test_revertingReceiver_doesNotBlockOthers() public {
        // Setup: 3 players, player 2 is a contract that reverts on USDC receive
        // After refundIfEmpty: all 3 have refundableBalance set
        // Player 1 withdrawRefund → succeeds
        // Player 2 withdrawRefund → reverts (their own problem; no spillover)
        // Player 3 withdrawRefund → succeeds
    }

    /// @notice M-1 INV: refundIfEmpty is O(N) accrual, withdrawRefund is O(1) pull
    function test_gasBounded_refundAccrual() public {
        // Setup: 100-player roster
        // refundIfEmpty: assert gas < 5M
        // withdrawRefund per player: assert gas < 100k
    }
}
```

```solidity
// X11_StartBracketRound_Signature.t.sol
// STUB ONLY — actual test body lands in X22.2. This file's existence pins the
// EIP-712 typehash + auth model lock from §G into the contracts/test/ surface
// where audit-firm review can find it.

bytes32 constant EXPECTED_BRACKET_TYPEHASH = keccak256(
    "BracketRoundStart(bytes32 id,uint8 round,address[] pairings,bytes32 nonce)"
);

function test_typehash_locked() public {
    // X22.2 implements startBracketRound; this test asserts the contract
    // exposes BRACKET_ROUND_START_TYPEHASH equal to EXPECTED_BRACKET_TYPEHASH.
    // Pre-X22.2: test is skipped via vm.skip(true) with reason "Reserved for X22.2".
}
```

### H.3 Coverage targets per X11 sub-sprint

- X11.4 (this spec freeze + 1 sub-sprint forward): land V22Invariants.t.sol body with `≥85% line coverage` on TournamentPool.sol (per v1.4 §3.11 Track A baseline).
- X11.5: land DevAttributionNFTInvariants.t.sol body with `100% coverage` on DevAttributionNFT.sol (it's ~120 lines; trivially achievable).
- X11.1: land ArcadePoolPullPayment.t.sol body with focus on DoS-vector tests.
- X11.6: land X11_StartBracketRound_Signature.t.sol stub (one assert: typehash matches). Body in X22.2.

### H.4 Foundry profile

Tests live on the **default profile** (`via_ir = true`, per memory `project_foundry_dual_profile_phase1_legacy`). ArcadePool tests stay on **phase1-legacy profile** unless founder selects Section B.5 disposition (a) (in-place fix) — in which case they migrate to default.

---

## Section I — Audit checklist (X12 firm engagement prep)

Audit firm (Trail of Bits / OpenZeppelin / Spearbit / Cyfrin per v1.4 §3.11 outreach) receives this packet as the "what to look at" guide.

### I.1 Audit-required remediation traceability

| Item | v2.1 → v2.2 diff | Verification |
|---|---|---|
| **M-1** PullPayment | `ArcadePool.sol` lines 124-134 + 30-LOC delta (B.3) + new `refundableBalance` mapping | Foundry test `ArcadePoolPullPayment.t.sol` |
| **M-2** EIP-712 | `TournamentPool.sol` lines 728, 745 → typehash + `EIP712._hashTypedDataV4` + ERC-6492 unwrap helper | Foundry test `V22Invariants_M2_Signatures.t.sol` (X11.2 body) |
| **M-3** Timelock | `TournamentPool.sol:636` → propose/cancel/execute trio + bucket-scoped balance check | `V22Invariants.invariant_emergencyWithdraw_blockedBeforeDelay` + bucket-scope |

### I.2 Dev fee splitter audit surface

- INV-S1..S5 from §E.2 documented in audit-packet `bracket-format-architecture.md` appendix.
- Slither configuration includes `data-flow-write` rule with fee-bucket and prize-pool slots as named sinks.
- Aderyn + 4naly3er + Solhint runs preserved on v2.2 baseline (per v1.4 §3.11 Track A static-analysis floor).

### I.3 Sweepstakes-safe storage layout preserved

- v2.1 → v2.2 struct field additions append at end of `Tournament` struct (per `address devAddr` post-`address sponsor`). **Storage slot order is critical:** verify via `forge inspect TournamentPool storage-layout` matches v2.2 expected layout.
- Per `static-analysis` slot check: `prizePool`, `feeCollected_dev`, `feeCollected_platform` mappings reside at distinct top-level slots; their per-id storage slot is `keccak256(abi.encode(id, slot))` and remains disjoint by construction.

### I.4 Multi-sig owner transition documented

- X11 deploys v2.2 with single-EOA owner (deployer key).
- X11.5 multi-sig cutover sprint executes `transferOwnership` to Safe address.
- Audit firm reviews v2.2 contract at the multi-sig owner state, not the transitional EOA state — sequencing per v1.6 §3.20.

### I.5 ERC-5192 dev attribution NFT compliance

- `DevAttributionNFT.supportsInterface(0xb45a3c0e) == true` (ERC-5192 interface id).
- `locked(tokenId) == true` for every existing token, reverts for non-existent.
- `Locked` event emitted at every mint.
- `Unlocked` event never emitted (declared per interface; status is permanent — documented in NatSpec line 13).
- `approve` / `setApprovalForAll` revert directly (defense-in-depth beyond `_update` hook).
- `tokenId == uint160(devAddr)` — discoverable without off-chain index.

### I.6 EIP-712 + ERC-6492 schema compliance

- Domain separator: `EIP712("SkillOS-TournamentPool", "1")` at the contract's deployed address + Base Sepolia chain id (or mainnet equivalent at X12 promotion).
- Typehashes:
  - `SCORE_SUBMIT_TYPEHASH = keccak256("ScoreSubmit(bytes32 id,address player,uint256 score,uint256 matchCountDelta,bytes32 nonce)")`
  - `SOLO_SCORE_SUBMIT_TYPEHASH = keccak256("SoloScoreSubmit(bytes32 id,address player,uint256 score,bytes32 soloRunId,uint256 matchCountDelta,bytes32 nonce)")`
  - `BRACKET_ROUND_START_TYPEHASH = keccak256("BracketRoundStart(bytes32 id,uint8 round,address[] pairings,bytes32 nonce)")` (locked here for X22.2 inheritance)
- ERC-6492 unwrap test: signed-by-undeployed-smart-wallet test case (Base Account counterfactual signature) recovers correctly post-unwrap.

### I.7 Deploy ordering + address pinning

DevAttributionNFT constructor takes pool address; pool constructor takes NFT address. To avoid circular dependency:

1. Pre-compute pool address via `vm.computeCreateAddress(deployer, deployerNonce + 1)`.
2. Deploy NFT first with `predictedPoolAddress`.
3. Deploy pool with NFT address — pool's deployment nonce matches the prediction.
4. Foundry test scaffold: `script/DeployTournamentPoolV22.s.sol` (X11.7 scope).
5. Production deploy script verifies post-deploy that `nft.tournamentPool() == address(pool)` and `pool.devNFT() == address(nft)`.

### I.8 Known centralization disclosures

Per v3.20 architectural humility pattern (instinct correct, structural constraint blocking):

- `trustedSigner` (server-side EOA) is the EIP-712 signer for `submitScore` / `submitSoloScore` / `startBracketRound`. This is by design — backend handles plausibility checks + Haiku AntiCheat advisory (Option F per v1.4 §3.13). Disclosed in audit-packet threat-model.
- Owner (single EOA pre-X11.5; multi-sig post) controls `setTrustedSigner`, `flagScore`, `withdrawFeesToPlatform`, `proposeEmergencyWithdraw`, `cancelEmergencyWithdraw`, `executeEmergencyWithdraw`. Multi-sig threshold per X11.5 decision (see §K Q5).
- 70/30 dev/platform split is immutable. Audit firm friendly: zero owner-tuneable revenue surface.

### I.9 Cross-references with other audit-packet docs

- `docs/audit-packet/threat-model.md` — adversary model (compromised owner, compromised trustedSigner, smart-wallet bypass attempts, MEV)
- `docs/audit-packet/wallet-topology.md` — multi-sig setup post-X11.5
- `docs/audit-packet/chain-inspection.md` — testnet BaseScan addresses + verified source
- `docs/audit-packet/audit-firm-outreach-templates.md` — engagement letter template

This SPEC.md becomes `docs/audit-packet/v22-extension-spec.md` (or symlinked) at X12 firm engagement.

---

## Section J — Sub-sprint breakdown

Per v1.6 §2.9 velocity scale calibration — agent-velocity ÷ ~10 from founder-velocity for mechanical / well-scoped sprints.

| Sub-sprint | Scope | Agent-velocity | Founder-velocity | Critical path? |
|---|---|---|---|---|
| **X11.0** | This SPEC.md + (optional) interface stub files | DONE (single session) | 0.5d | yes |
| **X11.1** | M-1 implementation: ArcadePool.refundIfEmpty → PullPayment + new `refundableBalance` mapping + `withdrawRefund` function. Foundry test bodies in `ArcadePoolPullPayment.t.sol`. Slither + Aderyn + 4naly3er green. Decision gate: §K Q1 (in-place vs sunset). | 4-6h | 2-3d | yes |
| **X11.2** | M-2 implementation: import OZ `EIP712`, define typehashes (§C.3), refactor `_verifySubmitSignature` + `_verifySoloSubmitSignature` to typed-data, add ERC-6492 unwrap helper. Backend signer update (off-chain) in lockstep. Foundry test bodies in `V22Invariants_M2_Signatures.t.sol`. Decision gate: §K Q2 (canonical 6492 lib vs inline). | 6-10h | 3-5d | yes |
| **X11.3** | M-3 implementation: `EmergencyBucket` enum + `EmergencyProposal` struct + propose/cancel/execute trio + `_sumAllTrackedBuckets` (running accumulator per §K Q3). Foundry invariant tests `invariant_emergencyWithdraw_blockedBeforeDelay` + `invariant_emergencyWithdraw_bucketScoped`. | 4-6h | 2-3d | yes |
| **X11.4** | Dev fee splitter test backfill: lock §E.2 invariants S1-S5 as Foundry invariant tests. Handler-based fuzz over 5+ tournaments × 10+ players × random chargeEntryFee/withdraw sequences. ≥85% line coverage on TournamentPool.sol. | 3-5h | 2d | yes |
| **X11.5** | DevAttributionNFT test backfill: §F.3 invariants N1-N5 as Foundry tests. Handler-based fuzz over mint paths + soulbound enforcement attempts (transfer / approve / setApprovalForAll). 100% line coverage on DevAttributionNFT.sol. | 2-3h | 1-2d | yes |
| **X11.6** | `startBracketRound()` signature freeze in code: add `BRACKET_ROUND_START_TYPEHASH` constant to TournamentPool.sol + empty function stub `external` (reverts `NotYetImplemented()` until X22.2). Foundry test `X11_StartBracketRound_Signature.t.sol` asserts typehash matches expected. | 2h | 1d | yes |
| **X11.7** | Audit-packet packaging: `script/DeployTournamentPoolV22.s.sol` deploy script + nonce-prediction wiring + post-deploy verifier. `docs/audit-packet/v22-extension-spec.md` (this SPEC.md, finalized). NatSpec sweep — 100% on external/public functions. ADR `docs/adr/0003-v22-extension-architecture.md`. | 6-10h | 3-5d | yes |
| **TOTAL** | | **~30-45 agent-hours** | **~14-21 founder-days** | |

**Pre-push CI parity per `[[reference_pre_push_ci_parity_check]]`:** every X11.* sub-sprint PR runs `npm ci + lint + typecheck + test-ts + test-foundry` (CI-enforced per `[[feedback_claudemd_ci_state_stale]]`) before push. PullPayment migration (X11.1) additionally runs `forge inspect ArcadePool storage-layout` to detect any unintended slot ordering change.

**Sequencing within X11:**
- X11.0 (this PR) → X11.1, X11.2, X11.3 can run in parallel (independent files).
- X11.4 depends on X11.0 (no code changes needed to land the invariant tests against existing code).
- X11.5 same.
- X11.6 depends on X11.2 (typehash domain must exist before bracket typehash is added).
- X11.7 depends on all of X11.1-X11.6 (deploy script + ADR + NatSpec sweep).

**Critical path for X11 (assuming founder Q resolutions land same day):**
X11.0 → max(X11.1, X11.2 → X11.6, X11.3) → X11.4 + X11.5 (parallel) → X11.7 → audit firm engagement (X12).

Wall-clock: ~4-6 working days agent-velocity sustained; ~3 weeks founder-velocity.

---

## Section K — Open questions for founder (resolution gate)

10 questions queued. Founder docket pattern per `[[feedback_respect_gate_holds]]` — X11 implementation sub-sprints do NOT start until founder resolves the questions that gate them.

### K Q1 — M-1 disposition for ArcadePool

| Option | Effort | Audit narrative |
|---|---|---|
| (a) Fix in place (PullPayment migration) | Low (~30 LOC) | "M-1 fixed in canonical contract" — clean |
| (b) Sunset ArcadePool, mark M-1 N/A (like ChallengeEscrow per X22.1) | Low-Medium | "Sunset disposition" — requires legacy narrative |
| (c) Leave as-is on legacy profile, document Phase-1-only DoS | Lowest | "Acknowledged + not mainnet" — weakest |

**Recommendation candidate:** (a). Audit firm friendly + cheapest remediation.

### K Q2 — ERC-6492 unwrap implementation choice

| Option | Effort | Audit narrative |
|---|---|---|
| (i) Canonical reference Solidity library (Coinbase Smart Wallet SDK or equivalent) | Low | "Standard pattern" — audit firm pattern-matches |
| (ii) Inline `_isValidERC6492Signature` helper using `SignatureChecker` + `eth_call` | Medium | "Custom impl" — audit firm reviews from scratch |

**Recommendation candidate:** (i) if a vetted library exists; (ii) otherwise. Founder verifies library availability.

### K Q3 — M-3 `_sumAllTrackedBuckets` strategy

| Option | Compute cost on dust check | Compute cost per chargeEntryFee / settle |
|---|---|---|
| (i) On-the-fly O(N) over all tournaments | High (one-off, admin path only) | None |
| (ii) Running `_trackedTotal` accumulator | O(1) | ~100 gas overhead per bucket-mutation |

**Recommendation candidate:** (ii) for cleaner pattern + audit-friendly O(1) verification. Founder confirms gas overhead acceptable.

### K Q4 — `startBracketRound` authorized caller

| Option | Trust surface |
|---|---|
| (a) Same `trustedSigner` as submitScore / submitSoloScore | Single shared signer — concentrated trust, audit-flaggable |
| (b) Dedicated `bracketKeeperSigner` (separate EOA, role-distinct) | Role-segregated — narrower per-signer surface, parallel to STUDIO_PRIVATE_KEY vs AGENT_PRIVATE_KEY split (per `[[project_x15_agent_wallet_split]]`) |

**Recommendation candidate:** (b). Aligns with the X15.3 role-segregation pattern; reduces blast radius if one key compromised; X22.2 can introduce the new role at v2.3 without re-deploying v2.2.

### K Q5 — Multi-sig threshold for X11.5 pre-cutover transitional

| Option | Threshold | Operational friction |
|---|---|---|
| (a) 1-of-1 founder transitional | 1 | None — single sign |
| (b) 2-of-2 founder + counsel | 2 | Counsel must be reachable for every owner action |
| (c) 2-of-3 founder + counsel + audit firm escrow | 2 | Counsel + audit firm escrow signer must coordinate |

This question primarily belongs to X11.5 (per PR #127), but the M-3 `proposeEmergencyWithdraw` semantics depend on it. If founder pre-locks the answer here, X11.3 implementation can hard-code the propose-then-execute caller paths.

**Recommendation candidate:** (a) for transitional pre-cutover; (b) post-cutover (X11.5 ceremony). Audit firm reviews against (b).

### K Q6 — M-3 cancel-execute threshold

If multi-sig is N-of-M signers:
- `cancelEmergencyWithdraw` requires N signers (same threshold as propose) OR a lower bar (e.g., any single signer can cancel during delay window — "veto power")?
- `executeEmergencyWithdraw` requires N signers OR a lower bar?

**Recommendation candidate:** same-threshold for execute (high bar to drain); veto-power for cancel (low bar to abort, "cancel-on-any-signer-call" provides defense against single-key compromise where the compromised key proposes a malicious withdraw).

### K Q7 — DevAttributionNFT metadata strategy

| Option | Storage cost | Audit-firm surface |
|---|---|---|
| (i) No metadata override (data-light SBT) | None | Minimum |
| (ii) On-chain JSON via `_buildJSON` (mirror SponsorReceiptSBT) | +2 slots/NFT (`firstTournamentId`, `mintedAt`) | Marginal increase |
| (iii) IPFS metadata | Off-chain dep | Reject (violates self-contained pattern) |

**Recommendation candidate:** (i) for X11; (ii) deferred to v2.4 if dev attribution UX demands.

### K Q8 — `BRACKET_ROUND_START_TYPEHASH` placement in code

| Option | Effect |
|---|---|
| (a) Declare in TournamentPool.sol v2.2 with empty `startBracketRound` stub that reverts | Forward-binds X22 implementation against the typehash; visible in v2.2 audit packet |
| (b) Declare in v2.3 (X22) only | Cleaner v2.2 surface; X22 has zero v2.2-locked constraints, audit-rescope risk for X22 |

**Recommendation candidate:** (a). The whole point of §G is to prevent X22 from forking the schema. Compile-time visibility in v2.2 is the strongest possible lock.

### K Q9 — Spec freeze ADR location

| Option | Path |
|---|---|
| (a) `docs/adr/0003-v22-extension-architecture.md` | New ADR series for X11+ |
| (b) `docs/audit-packet/v22-extension-spec.md` (this SPEC, finalized) | Direct audit-packet integration |
| (c) Both | Maximum discoverability |

**Recommendation candidate:** (c) — ADR for engineering-team navigation; audit-packet copy for firm engagement. Single source of truth (this SPEC.md) with symlinks or include directives.

### K Q10 — X11 vs X22 contract-scope (cross-ref X22 §I.1)

X22 scoping doc surfaced the open Q: does X22 fold into X11 v2.2 (single audit cycle) or ship as v2.3 layer (two audit cycles)?

| Path | Effort | Audit-firm engagement |
|---|---|---|
| A — X22 folds into X11 v2.2 | Higher (single scope) | One cycle, scope creep |
| B — X22 ships as v2.3 layer | Lower per-cycle, higher cumulative | Two cycles, lower regression |

**Recommendation candidate:** B unless audit firm engagement hasn't yet started. **Founder decision is upstream of X11.6 (startBracketRound stub vs full bracket implementation).**

---

## END OF X11.0 SPEC FREEZE

**Lock criteria check:**
- [x] SPEC.md committed at `docs/sprints/x11-v2-2/SPEC.md`
- [x] All 11 sections (A-K) present (A scope, B M-1, C M-2, D M-3, E dev splitter, F NFT, G startBracketRound, H invariant stubs, I audit checklist, J sub-sprints, K founder questions)
- [x] `startBracketRound()` signature explicitly EIP-712 (M-2 consolidated, §C.6 + §G.3)
- [x] Sub-sprint breakdown X11.1-X11.7 with agent-velocity estimates (§J)
- [x] Open Q'lar §K'da queue'lu founder resolve için (10 questions)
- [x] No Solidity files committed (interface stubs deferred to X11.6)
- [x] No Foundry test bodies committed (signatures/intents only in §H)
- [x] No deploy scripts (deferred to X11.7)
- [x] Drift caught at pre-flight forwarded for forwardable resolution (§K + cross-ref to X22 §I.9 docket)

**Cross-references:**
- v1.4 §3.11 Track A audit (M-1/M-2/M-3 source)
- v1.6 §3.20 architectural humility sequencing
- v1.6 §2.9 velocity scale calibration (agent-velocity estimates)
- v1.6 §3.18 agent delegation principle (this sprint's delegation model)
- v1.6 §3.14 VTP pre-flight discipline (this sprint's pre-flight verification chain)
- `/tmp/x22-bracket-scoping.md` §C.2 + §I.1 (bracket function design constraints)
- PR #127 X11.5 multi-sig sprint plan (post-X11 cutover)
- Memory `[[project_foundry_dual_profile_phase1_legacy]]` (test profile assignment)
- Memory `[[project_x15_agent_wallet_split]]` (role-segregation pattern for §K Q4)
- Memory `[[feedback_claudemd_ci_state_stale]]` (CI now exists, gates X11.* PR pushes)
- Memory `[[reference_pre_push_ci_parity_check]]` (X11.* PR pre-push discipline)
