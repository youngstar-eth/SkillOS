# Sprint UR Pass 1 / Track A — Smart Contract Findings

**Branch:** `ur/track-a-contracts`
**Scope:** `contracts/src/*.sol` (9 files) + `contracts/test/*.sol` (8 files + mocks).
**Date generated:** 2026-05-17
**Toolchain:** Foundry 1.5.1 / solc 0.8.26 / slither 0.11.5 / aderyn 0.6.8 / 4naly3er @ Picodes HEAD / solhint 6.2.1.
**Mode:** findings only — **no source code modified**.

> External-auditor handoff prep. All counts reflect the `src/` tree only; analyzers
> were given the full repo but findings on `test/`, `lib/`, and `script/` are excluded
> from severity tallies (kept in raw outputs for completeness).

---

## 1 — Executive Summary

### 1.1 Inventory

9 source files: `ArcadePool.sol` (150 L), `ChallengeEscrow.sol` (323), `DevAttributionNFT.sol`
(121), `ISanctionsOracle.sol` (13, interface), `MockSanctionsOracle.sol` (45, test-only),
`SkillbaseAnchor.sol` (123), `SponsorReceiptSBT.sol` (172), `SponsorshipModule.sol` (157),
`TournamentPool.sol` (832). Total 1 936 LOC.

Compilation profiles per `foundry.toml`:

| Profile | via_ir | Contracts |
|---|---|---|
| `default` | `true` | `ChallengeEscrow`, `DevAttributionNFT`, `ArcadePool` (Phase 2 cohort) |
| `phase1-legacy` | `false` | `TournamentPool`, `SponsorshipModule`, `SponsorReceiptSBT`, `MockSanctionsOracle`, `SkillbaseAnchor` |

ADR 0002 records the rationale: legacy on-chain Phase 1 deployments verified with
`via_ir=false`; ChallengeEscrow + Phase 2 cohort use the modern IR pipeline.

### 1.2 Severity Roll-up

> Severities are this triage author's classification of analyzer output; the external
> auditor will rank independently. False-positive analyzer hits are listed under Info.

| Severity | Count | Source |
|---|---:|---|
| Critical | 0 | — |
| High | 0 | — (slither's 1 High was triaged to Info, see I-2) |
| Medium | **3** | M-1 (unbounded refund loop), M-2 (sig schema inconsistency), M-3 (emergencyWithdraw blast radius) |
| Low | **8** | L-1…L-8 |
| Info | **11** | I-1…I-11 (incl. analyzer false positives) |

### 1.3 Static-analyzer Raw Counts

| Tool | All | src/ only | Notes |
|---|---:|---:|---|
| slither | 571 | 40 | by impact (src): 1 High, 2 Med, 21 Low, 16 Info |
| aderyn | 12 KB | — | 88 detectors, no Critical findings |
| 4naly3er | 2 160 L | — | 15 Gas, 13 NC, 5 Low, 2 Med categories |
| solhint | 313 L | — | 185 use-natspec, 28 gas-indexed-events, 27 import-path-check (false-positive — remappings), 13 gas-custom-errors |

### 1.4 Test + Coverage Baseline

- **207 tests pass, 0 failed** (8 test suites including new `X15-paid-retry.t.sol` — 6 tests).
  The user-stated 203 baseline corresponds to pre-X15.7; current main is 207 (memory record
  `project_x15_7_e2e_verified`).
- forge coverage totals: **68.41 % lines / 65.32 % statements / 50.82 % branches / 84.31 % funcs**
  (see `contracts-coverage.txt`). `script/` files contribute 0 % which dilutes the headline
  — src/ only is materially higher.
- Per-contract src/ branch coverage to note for the auditor:
  - `ArcadePool.sol` **11.76 %** branches (4/34) ← lowest, see L-7
  - `SponsorshipModule.sol` 50 % branches
  - `ChallengeEscrow.sol` 61.54 % branches
  - `SkillbaseAnchor.sol` 66.67 % branches
  - `TournamentPool.sol` 73.77 % branches (largest contract; covered well)
  - `DevAttributionNFT.sol` / `SponsorReceiptSBT.sol` **100 %** across all 4 dimensions

---

## 2 — Findings

### 2.1 Medium

#### M-1 · `ArcadePool.refundIfEmpty` — unbounded loop with external transfers (DoS via OOG)

**Locator:** `src/ArcadePool.sol:124-134`

```solidity
function refundIfEmpty(uint256 tournamentId) external nonReentrant {
    // ...
    address[] memory players = playerList[tournamentId];
    for (uint256 i = 0; i < players.length; i++) {
        USDC.safeTransfer(players[i], t.entryFee);
    }
}
```

A tournament with no `winner` (never received a valid signed score) refunds all entrants
in a single transaction. There is no cap on `playerList[tournamentId].length` and `enter`
is permissionless once `entryFee > 0`. An attacker can grief refund-eligibility by
flooding entries from cheap addresses; legitimate refund call then runs out of gas
and reverts atomically, leaving funds stranded.

**Recommendation:** switch to a pull-payment pattern (`mapping(tournamentId =>
mapping(player => uint256)) refundable;` set in `refundIfEmpty`, claimed by each
player via a separate `claimRefund(tournamentId)` external function). The same
pattern protects against ERC-20 implementations with transfer hooks.

**Severity rationale:** Medium not High because (a) the entry-fee griefing economically
self-limits — attacker spends N · entryFee USDC to brick refunds — and (b) the no-winner
state is uncommon. Becomes High if entryFee is ever set to a small value and contract
is used in production at scale.

#### M-2 · Signature scheme inconsistency across the three signed-message contracts

**Locator:**
- `src/ArcadePool.sol:39-41,95-97` — uses **EIP-712** (`_hashTypedDataV4`, `SCORE_TYPEHASH`).
- `src/TournamentPool.sol:727-731,742-748` — uses **EIP-191** (`"\x19Ethereum Signed Message:\n32"` with `abi.encode`).
- `src/ChallengeEscrow.sol:311-322` — uses **EIP-191** (same as TournamentPool).

Three contracts handle backend-signed attestations. ArcadePool is the only one using
typed-data signing. The other two use the legacy `eth_sign` prefix pattern with raw
`abi.encode` digests.

**Operational impact:**
- Backend signer code is *not* portable across contracts. Subtle bugs introduced when
  switching contexts (X15 added solo-score sigs to TournamentPool; an EIP-712 mix-up
  would have produced reverts not silent corruption, which is the safe failure mode).
- Wallet UX cannot display typed-data signing modals for TournamentPool /
  ChallengeEscrow attestations — wallets show a hex blob in `personal_sign` mode.
  This is moot today (signing is server-side only) but becomes a concern if any
  attestation ever needs end-user signing.
- The two EIP-191 contracts hash `abi.encode(...)` (full word-aligned, no collision
  risk). This is safe but mechanically different from EIP-712's struct hash.

**Recommendation:** migrate TournamentPool + ChallengeEscrow to EIP-712 as part of
the next breaking deploy. Domain separators bind to chainId + contract address
already (currently done manually inside the digest payload — see I-9).

#### M-3 · `emergencyWithdraw(address to)` — full-balance owner drain on TournamentPool + ChallengeEscrow

**Locators:**
- `src/TournamentPool.sol:636-640` — drains entire USDC balance to `to`.
- `src/ChallengeEscrow.sol:286-290` — same pattern.

```solidity
function emergencyWithdraw(address to) external onlyOwner {
    if (to == address(0)) revert ZeroAddress();
    uint256 balance = USDC.balanceOf(address(this));
    USDC.safeTransfer(to, balance);
}
```

Owner-key compromise lets an attacker rug all in-flight prize pools (TournamentPool),
all open + accepted challenge stakes (ChallengeEscrow), plus all accumulated dev/
platform fee buckets (TournamentPool). The `_dev`/`_platform`/`prizePool` bucket
segregation that the codebase repeatedly emphasizes as INV1 — `feeCollected_dev` and
`feeCollected_platform` live on distinct slots from `prizePool` — is enforced by the
**lifecycle paths** (`settle`, `withdrawFeesToDev`, `withdrawFeesToPlatform`,
`fundPrizePool`). `emergencyWithdraw` deliberately bypasses that segregation; it
drains the USDC balance regardless of which sub-pool the balance belongs to. This is
the intended escape hatch, but the blast radius is the entire contract.

Compounded by L-5 (no 2-step ownership transfer): if the owner key is lost or
phished, there is no on-chain recovery delay.

**Recommendation tiers** (in order of effort):
1. **Cheap, immediate:** add a `Timelock` for the owner role; emergency withdrawal
   then takes ≥ N hours to execute, giving an offline incident-response window.
2. **Medium:** split the role — `pauser` (can call `emergencyWithdraw` after pause +
   delay) vs `owner` (rotates signer, fee vault).
3. **Audit-worthy:** parameterize `emergencyWithdraw` by sub-bucket so a single
   compromised key cannot drain prize pools and fees in one tx. Sweepstakes-safety
   invariant (INV1) protects against accidental code-path corruption — it does not
   protect against deliberate owner action.

**Severity rationale:** Medium because it requires owner-key compromise. Auditors
will likely raise this to High under standard centralization-risk taxonomy; the
team has acknowledged the design choice in the CLAUDE.md decision priority order
("emergency withdrawal exists; do not refactor without founder discussion").

### 2.2 Low

#### L-1 · Pragma inconsistency across the 9 files

| File | Pragma |
|---|---|
| `ArcadePool.sol` | `^0.8.24` (caret + lower floor) |
| `SkillbaseAnchor.sol` | `^0.8.26` (caret) |
| All other 7 files | `0.8.26` (pinned) |

`foundry.toml` pins `solc = "0.8.26"` so compilation is uniform today. The caret
pragmas only matter if someone ever drops the toml pin. Pinning all files to the
exact same `0.8.26` removes that footgun and matches the convention 7/9 files
already follow.

Slither emits a Pragma finding for the same observation.

#### L-2 · No 2-step ownership transfer on any contract using `Ownable`

**Locators (6 contracts use `Ownable` from OZ v5):** ArcadePool, ChallengeEscrow,
MockSanctionsOracle, SkillbaseAnchor, SponsorshipModule, TournamentPool.

OZ ships `Ownable2Step` as a drop-in replacement. Single-step transferOwnership
risks irrecoverable ownership loss if the new-owner address is mistyped.
4naly3er flags 6 instances (L-1, L-5 in `raw/4naly3er-report.md`).

Recommendation: migrate to `Ownable2Step`. Combined with M-3, this is the highest-
leverage centralization fix.

#### L-3 · `flagScore` is unconditional owner-exclusion of any participant

**Locator:** `src/TournamentPool.sol:546-554`

Owner can mark any participant excluded before settle. Documented as anti-cheat
veto. No on-chain receipt of *why* (just an `ScoreFlagged` event). For the auditor:
this is the documented design; the comment chain (`flagScore → excluded[] →
_countNonExcluded → settle`) is explicit. Listed Low because the centralization is
acknowledged + ops-bounded.

#### L-4 · Division-by-zero possible in `_distributePrizes` tier 5

**Locator:** `src/TournamentPool.sol:816`

```solidity
uint256 tier5Pool = (pool * BPS_TIER5_POOL) / BPS_DENOMINATOR;
uint256 perPlaceT5 = tier5Pool / tier5Count;
```

`tier5Count = topN - TIER5_START_INDEX` is guarded by the enclosing
`if (topN > TIER5_START_INDEX)` — `tier5Count` is therefore `>= 1`. **False
positive in practice** but 4naly3er flags it as L-2 and a reviewer skimming may
mistake the un-asserted-zero arithmetic for a real bug. Adding `assert(tier5Count
> 0)` would document the invariant inline.

#### L-5 · Rounding loss on basis-point fee splits

**Locators:**
- `src/TournamentPool.sol:534-535` (dev/platform split)
- `src/TournamentPool.sol:798-802` (prize-curve top-3)
- `src/ChallengeEscrow.sol:196,253` (challenge fee)

All BPS arithmetic uses `(amount * BPS) / DENOMINATOR` ordering. Locked constants
make the TournamentPool fee split exact (`1_000_000 * 7000 / 10_000 == 700_000`).
ChallengeEscrow's fee = `(2 * stake * 1000) / 10_000` — exact when `stake` is a
multiple of 5 USDC atoms, off by ≤ 1 atom otherwise. Off-by-one atom dust gets
captured in the `winner` payout (no `+ dust` math). Acceptable.

Prize curve top-3: `(pool * 2500) / 10_000` — exact only when `pool % 4 == 0`. Up
to 3 atoms of dust per place stranded if `pool` isn't a clean multiple. Refunds
to sponsor at L580-584 via `t.prizePool - totalDistributed`. Confirmed clean.

#### L-6 · Match-count cap may silently mask spec drift

**Locator:** `src/TournamentPool.sol:715`

```solidity
uint256 cappedMc = mc > MATCH_COUNT_CAP ? MATCH_COUNT_CAP : mc;
```

`MATCH_COUNT_CAP = 10` (L-162) is hard-coded. If product changes the effective
score formula or paid-retry economics, the cap silently saturates and the change
won't show in scoring until devs notice ranking didn't move. Recommend at least
emit a one-time event recording the constants used in `effectiveScoreOf` so
off-chain readers can verify they match the deployed bytecode.

#### L-7 · ArcadePool branch coverage is 11.76 % (4 of 34)

**Locator:** `forge coverage` summary, ArcadePool row.

ArcadePool has only 22 tests vs 91 on TournamentPool, and most ArcadePool tests
exercise the happy paths. Missing coverage (manual diff against the contract):
- `setProtocolFee` bounds check (`require(_bps <= 3000)`).
- `submitScore` nonce-reuse path.
- `refundIfEmpty` after-window-but-with-winner revert path.
- `enter` after `t.endTime` revert.
- `submitScore` after `t.endTime` revert.

Recommend lifting ArcadePool branch coverage to ≥ 80 % before external audit. The
contract isn't used in production today but ships with the codebase and will be in
the audit scope.

#### L-8 · No deadline on backend-signed attestations beyond the tournament/challenge window

All three signed-attestation flows (TournamentPool.submitScore, submitSoloScore,
ChallengeEscrow.settle, walkover, ArcadePool.submitScore) rely on:
- TournamentPool: `usedNonces[nonce]` + tournament window (`block.timestamp < t.endsAt`).
- ChallengeEscrow: state-machine progression (`Status.Accepted → Settled/Walkover`).
- ArcadePool: `usedNonces[nonce]` + `block.timestamp <= t.endTime`.

A signature obtained ahead of time can be relayed up to the close-window. For most
flows the nonce burns on first relay, so a single signature is single-use. The
exception is **ChallengeEscrow.settle** which has no nonce — only the state machine.
If a backend ever signs two valid settlements for the same `id` (one to creator,
one to challenger — operational bug), whichever is relayed first wins, and the
loser's signature becomes inert (state changes to Settled). This is safe under
honest signer behavior but is a sharper edge than nonce-based replay protection.

Add explicit `uint256 deadline` parameter to all signed digests + revert if
`block.timestamp > deadline`.

### 2.3 Informational

#### I-1 · Slither `arbitrary-send-erc20` (1 hit) — false positive after manual triage

**Locator:** `src/TournamentPool.sol:524-542` (`chargeEntryFee`).

Slither flags `safeTransferFrom(player, address(this), ENTRY_FEE)` because `player` is
a function argument. Manual check: line 525 requires `msg.sender == player`. The
"arbitrary from" is bound to the caller's own address; the call only succeeds with the
player's pre-approved allowance. **Not exploitable.** Closed as false positive.

#### I-2 · Slither `uninitialized-local` (2 hits) — false positive

**Locators:** `src/TournamentPool.sol:670` (`count`), `:676` (`idx`).

Both are accumulators initialized via Solidity's default zero-init then incremented
inside the loop. False positives. (Slither errs cautious here — explicit `uint256
count = 0` silences the detector with identical bytecode.)

#### I-3 · Aderyn + 4naly3er findings — gas optimizations, no security implications

Top buckets:
- 4naly3er GAS-5: 95 unchecked-math opportunities (post-bounds-check increments).
- 4naly3er GAS-6: 16 revert-string → custom-error candidates — *all in ArcadePool* (the
  other 8 contracts already use custom errors; see L-1 sibling concern).
- 4naly3er GAS-8: 14 owner-only functions could be `payable`.
- 4naly3er GAS-3: 10 `bool` storage uses (slot inefficient).

None of these affect correctness. They are worth addressing post-audit to keep gas
predictable. Full lists in `raw/4naly3er-report.md` and `raw/aderyn-report.md`.

#### I-4 · Solhint `import-path-check` (27 hits) — false positive

Solhint doesn't honor Foundry's `remappings` in `foundry.toml`, so all
`@openzeppelin/contracts/...` imports register as "doesn't exist". Compiles cleanly
under forge. Filterable rule.

#### I-5 · 28 events have un-indexed parameters that could be indexed

**Locator:** all events in TournamentPool, ChallengeEscrow, ArcadePool, SponsorshipModule.

Indexing the natural query keys (`uint256 score`, `uint256 amount`) widens off-chain
filter surface for indexers. Style choice; team currently indexes only `id`, `player`,
`game`, etc. Listed for the auditor's awareness — no security implication.

#### I-6 · Naming convention drift in TournamentPool

**Locators:** `src/TournamentPool.sol:251,258`

```solidity
mapping(bytes32 => uint256) public feeCollected_dev;
mapping(bytes32 => uint256) public feeCollected_platform;
```

Snake-case suffixes deviate from camelCase. Documented in the code as v2.2-split of
the legacy single `feeCollected` accumulator — the names exist to make the storage
split visible in slot inspection. Style trade-off, not a bug.

#### I-7 · `getRanking` is O(n²) on participant count

**Locator:** `src/TournamentPool.sol:686-697`

Insertion sort in memory, view-only. Off-chain readers should call this; on-chain
callers won't. Documented in the comment. Just notable for the auditor — n is
bounded only by participation, which is bounded by user adoption. No revert path
on huge participant lists since this is a `view` function (no gas limit applies to
off-chain `eth_call`).

#### I-8 · Cross-contract call ordering in `SponsorshipModule.sponsorPool`

**Locator:** `src/SponsorshipModule.sol:122-146`

The function calls into two external contracts (`POOL.fundPrizePool` and
`RECEIPT.mint`) before completing its own state writes. The comment block at
L133-134 explicitly notes: state writes that depend on the tx complete BEFORE
`RECEIPT.mint` because `_safeMint` triggers `onERC721Received` on contract
sponsors. Verified — `sponsorContributions` and `_hasSponsored` are written
between the two external calls but before the callback-eligible one. `nonReentrant`
is still the primary defense. Documented as Info because the design is intentional
and well-commented.

#### I-9 · Domain separator hand-rolled (TournamentPool + ChallengeEscrow)

Both EIP-191 contracts hand-roll the domain by including `address(this)` and
`block.chainid` in the digest payload directly. ArcadePool uses OZ's `EIP712` base
which builds a proper `EIP712Domain`. Functionally equivalent for chain-isolation
+ contract-isolation purposes. If M-2 is acted on, this fold-in.

#### I-10 · `OnlyDev` errors when `devAddr == address(0)`

**Locator:** `src/TournamentPool.sol:609-617`

`withdrawFeesToDev(id)` reads `_tournaments[id].devAddr` which is `address(0)` for
non-existent tournaments. `msg.sender != address(0)` always holds (EVM constraint),
so this reverts `OnlyDev` instead of a more specific `TournamentNotFound`. The
NatSpec comment explicitly notes this collapse — preserves the contract-size
budget at the cost of one error class. Documented; nothing to change.

#### I-11 · `block.timestamp` comparisons (12 hits, slither `timestamp` detector)

Standard slither warning on all `block.timestamp < t.startsAt`, `< t.endsAt`,
`< t.expiresAt`. Miner timestamp manipulation is bounded to ~15s. Tournament/
challenge windows are at minimum minutes (ArcadePool require 1 minute floor —
`src/ArcadePool.sol:61`) so the manipulation surface is negligible. No action.

---

## 3 — Centralization Map

| Contract | Role | Capability | Mutability | Blast radius |
|---|---|---|---|---|
| TournamentPool | `Ownable.owner()` | setTrustedSigner, flagScore, withdrawFeesToPlatform, emergencyWithdraw | single-step transferOwnership | **All in-flight prize pools + fees** (via emergencyWithdraw) |
| TournamentPool | `trustedSigner` | sign submit attestations | owner-rotatable | Per-tournament score injection until rotated |
| TournamentPool | `devNFT` (IDevAttributionNFT) | mint soulbound NFT to devs | immutable | bounded — mint-only |
| ChallengeEscrow | `Ownable.owner()` | setFeeVault, setTrustedSigner, emergencyWithdraw | single-step | **All in-flight stakes + accumulated fees** |
| ChallengeEscrow | `trustedSigner` | sign settle/walkover | owner-rotatable | Per-challenge winner injection until rotated |
| ChallengeEscrow | `feeVault` | fee-receipt destination | owner-rotatable | Fees only |
| ArcadePool | `Ownable.owner()` | setScoreSigner, setFeeRecipient, setProtocolFee (≤30 %) | single-step | No emergencyWithdraw — bounded |
| ArcadePool | `scoreSigner` | sign submitScore | owner-rotatable | Per-tournament winner injection |
| DevAttributionNFT | `tournamentPool` | mint() | **immutable** | bounded — mint only via TournamentPool path |
| SponsorReceiptSBT | `MINTER` (SponsorshipModule) | mint() | **immutable** | bounded — mint only via sponsorPool path |
| SponsorshipModule | `Ownable.owner()` | setSanctionsOracle | single-step | Sanctions rotation — oracle swap |
| SponsorshipModule | `sanctionsOracle` | gate sponsorPool | owner-rotatable | Per-call sponsor-screening result |
| SkillbaseAnchor | `Ownable.owner()` | setAuthorizedAnchor | single-step | Adds/removes anchor writers |
| SkillbaseAnchor | `authorizedAnchors[]` | anchorSnapshot | owner-mutable set | Per-timestamp snapshot write |
| MockSanctionsOracle | `Ownable.owner()` | addToBlacklist, removeFromBlacklist | single-step | Testnet-only; not used in prod |

**Aggregate observations:**
- 6 contracts use single-owner Ownable. **Per L-2 + M-3**: migrate to `Ownable2Step` and tighten emergencyWithdraw.
- Two roles (TournamentPool.owner, ChallengeEscrow.owner) hold cross-tournament/cross-challenge funds-drain capability.
- The immutable role surface (DevAttributionNFT.tournamentPool, SponsorReceiptSBT.MINTER) is intentionally narrow and audit-friendly — both are mint-only.

---

## 4 — Reentrancy + CEI Review

Every external state-changing function in the 9 contracts inherits `ReentrancyGuard`
(`nonReentrant` modifier) where it touches funds. Per-function audit:

| Contract.Function | External calls | CEI ordering | nonReentrant | Notes |
|---|---|---|---|---|
| TournamentPool.createTournament | USDC.safeTransferFrom; devNFT.mint | Effects between (devNFTMinted set BEFORE mint) | ✓ | Initial state is zero — safe |
| TournamentPool.fundPrizePool | USDC.safeTransferFrom; state += | Action-then-effect on a trusted token | ✓ | USDC has no reentrancy hook; nonReentrant is defense-in-depth |
| TournamentPool.submitScore | none (signature verification is pure) | — | — | View-state mutate only |
| TournamentPool.submitSoloScore | none | — | — | Same; nonce burned after sig check |
| TournamentPool.chargeEntryFee | USDC.safeTransferFrom | Effects after | ✓ | See I-1 (slither false-positive) |
| TournamentPool.settle | safeTransfer × N (prize), safeTransfer (refund) | `t.settled = true` FIRST | ✓ | Reentrancy-blocked end-to-end |
| TournamentPool.withdrawFeesToDev | safeTransfer | bucket zeroed FIRST | ✓ | CEI textbook |
| TournamentPool.withdrawFeesToPlatform | safeTransfer | bucket zeroed FIRST | ✓ | CEI textbook |
| ChallengeEscrow.createChallenge | safeTransferFrom | initial state | ✓ | Safe — state is zero |
| ChallengeEscrow.acceptChallenge | safeTransferFrom | effects after | ✓ | USDC trusted |
| ChallengeEscrow.settle | safeTransfer (winner), safeTransfer (feeVault) | status=Settled FIRST | ✓ | |
| ChallengeEscrow.walkover | safeTransfer × 2 | status=Walkover FIRST | ✓ | |
| ChallengeEscrow.expireOpen | safeTransfer (creator refund) | status=Expired FIRST | ✓ | |
| ChallengeEscrow.expireAccepted | safeTransfer × 2 (both refund) | status=Expired FIRST | ✓ | Bounded loop (always 2) |
| ArcadePool.enter | safeTransferFrom | effects after | ✓ | USDC trusted |
| ArcadePool.submitScore | none | — | — | |
| ArcadePool.settle | safeTransfer × 2 | settled=true FIRST | ✓ | |
| ArcadePool.refundIfEmpty | safeTransfer × N | settled=true FIRST; **unbounded loop** | ✓ | **See M-1** |
| SponsorshipModule.sponsorPool | safeTransferFrom; POOL.fundPrizePool; RECEIPT.mint | Effects after POOL, before MINT | ✓ | See I-8 |
| DevAttributionNFT.mint | none (called by Pool) | — | — | Only-pool gate; tokenId deterministic |
| SponsorReceiptSBT.mint | none | — | — | Only-minter gate |
| SkillbaseAnchor.anchorSnapshot | none | — | ✓ | Pure storage write |

**Conclusion:** No reentrancy findings. CEI ordering is consistent and well-commented.
The only operational risk is M-1's unbounded loop, which is a gas-exhaustion DoS
vector, not a reentrancy vector.

**Test gap:** `test_createTournament_receiverHook_reentrancyCoverage` is the only test
explicitly named for reentrancy in 207 tests. Coverage is heavily reliant on
`nonReentrant` rather than on adversarial-call paths. Recommend extending invariant
test suite to include a `MaliciousReentrantSettler` fixture that attempts cross-
function re-entry — `MaliciousReentrantDev.sol` mock already exists for the dev-NFT
mint path; the pattern can be cloned.

---

## 5 — Signature + Replay Review

### 5.1 TournamentPool.submitScore (EIP-191)

```text
digest = keccak256(abi.encode(id, player, score, matchCountDelta, nonce, address(this), block.chainid))
prefixed = keccak256("\x19Ethereum Signed Message:\n32" || digest)
signer = ECDSA.recover(prefixed, signature)
require signer == trustedSigner
```

Replay surface:
- ✓ Cross-chain — bound to `block.chainid`.
- ✓ Cross-contract — bound to `address(this)`.
- ✓ Cross-tournament — bound to `id`.
- ✓ Cross-player — bound to `player`.
- ✓ Cross-submit-vs-solo — solo digest has extra `soloRunId` field so layouts differ.
- ✓ Replay within tournament — `usedNonces[nonce]` global.
- ✗ Deadline — none. Soft-bounded by `t.endsAt`; see L-8.
- ✓ Signature malleability — OZ `ECDSA.recover` reverts on high-`s`.

### 5.2 TournamentPool.submitSoloScore (EIP-191)

```text
digest = keccak256(abi.encode(id, player, score, soloRunId, matchCountDelta, nonce, address(this), block.chainid))
```

Same posture as submitScore plus:
- ✓ Cross-run replay — bound to `soloRunId`.
- ✓ Shared nonce space with submitScore — different field count so digest layouts
  cannot collide. Confirmed by inspection of L727 vs L742.
- On-chain fee invariant: `soloSubmissionCount` × `ENTRY_FEE` ≤ `feePaidByPlayer`.
  Cannot be skipped even if trustedSigner is compromised (L484-488).

### 5.3 ChallengeEscrow.settle (EIP-191)

```text
digest = keccak256(abi.encode(id, winner, creatorScore, challengerScore, address(this), block.chainid))
```

Replay surface:
- ✓ Cross-chain, cross-contract, cross-challenge — bound.
- ✗ Nonce — none. **State-machine replay protection only** (status transitions
  Open → Accepted → Settled). See L-8 for the operational implication.
- ✓ Cross-winner — winner bound to digest (must equal creator or challenger).
- ✓ Score binding — creator/challenger scores in digest defend against
  swap-the-winner-mid-dispute.

### 5.4 ChallengeEscrow.walkover (EIP-191)

```text
digest = keccak256(abi.encode(id, winner, "walkover", address(this), block.chainid))
```

- The literal `"walkover"` string differentiates from settle digest. Hash collision
  with settle digest infeasible (different abi.encode argument-count layout).
- Same no-nonce posture as settle; same state-machine replay protection.

### 5.5 ArcadePool.submitScore (EIP-712)

```text
SCORE_TYPEHASH = keccak256("Score(uint256 tournamentId,address player,uint256 score,uint256 nonce)")
structHash = keccak256(abi.encode(SCORE_TYPEHASH, tournamentId, msg.sender, score, nonce))
digest = _hashTypedDataV4(structHash)   // domain = EIP712Domain("ArcadePool","1",chainid,this)
require digest.recover(signature) == scoreSigner
```

- ✓ Cross-chain — domain.chainId.
- ✓ Cross-contract — domain.verifyingContract.
- ✓ Cross-tournament — `tournamentId`.
- ✓ Cross-player — bound to `msg.sender` (relayer can't substitute).
- ✓ Replay — `usedNonces[nonce]`.
- ✗ Deadline — none. Soft-bounded by `t.endTime`.
- ✓ Malleability — OZ `ECDSA` revert.

### 5.6 No ERC-6492 wrapping

None of the four signed flows wraps signatures in ERC-6492 (for counterfactual
smart-account signers). This is intentional: backends sign with EOA keys
(`STUDIO_PRIVATE_KEY`, X15 `AGENT_PRIVATE_KEY` — memory record). Adding ERC-6492
would not change today's signer; it would only matter if backend signers were
ever migrated to a Safe/4337 deployment-pending wallet. Not in scope.

---

## 6 — Invariant Inventory vs Architectural Invariants 1-7

Architectural invariants per `CLAUDE.md:67-77` (canonical) and the user-task
framing (sweepstakes-safe storage, fee accounting, soulbound, signer auth,
permissionless sponsor, class-agnostic, off-chain commitments).

| # | Invariant | Enforced in | Tests | Gap |
|---|---|---|---|---|
| 1 | Sweepstakes-safe storage / fee-prize segregation | TournamentPool.{chargeEntryFee, settle, fundPrizePool, withdrawFeesToDev, withdrawFeesToPlatform} via disjoint storage slots `feeCollected_dev`/`feeCollected_platform`/`Tournament.prizePool` | 4 `test_invariant_*` (lines 1138, 1213, 1238, 1276, 1340, 1590 of TournamentPool.t.sol — unit-style assertions) | No **stateful invariant** test (`StdInvariant`). Existing tests are sequence-bound. Add fuzzed `invariant_*` runner that mints random fee + prize flows and asserts segregation. |
| 2 | Fee accounting — no dust at locked constants | TournamentPool.chargeEntryFee L534-535 (devShare + platformShare == ENTRY_FEE exactly when ENTRY_FEE=1e6, DEV_BPS=7000, PLATFORM_BPS=3000) | INV2 noted at L1324 of test; locked-constant case covered | No fuzz over ENTRY_FEE. Acceptable since ENTRY_FEE is `constant` not param. |
| 3 | Soulbound / non-transferable (INV4 + ERC-5192) | DevAttributionNFT._update (revert if from!=0), SponsorReceiptSBT._update (revert if from!=0 && to!=0 — allows burn), approve/setApprovalForAll revert in both | DevAttributionNFT.t.sol covers transfer-revert, approve-revert (19 tests); SponsorReceiptSBT.t.sol covers same (16 tests) | Comprehensive. Best-tested invariant in the suite. |
| 4 | Signer auth — trustedSigner / scoreSigner | TournamentPool._verify* L719-748, ChallengeEscrow._verify* L301-322, ArcadePool L97 | `test_*_revert_badSignature` (3 in TournamentPool, 1 in ChallengeEscrow, 1 in ArcadePool); owner-rotation tested | No explicit signature-malleability test. Relies on OZ ECDSA's `s < n/2` enforcement (which is correct). Add one targeted test (`vm.expectRevert` on a flipped-s signature) for completeness. |
| 5 | Permissionless sponsor / fundPrizePool | TournamentPool.fundPrizePool — no access control, lifecycle checks only; SponsorshipModule.sponsorPool — sanctions oracle is the only gate | `test_fundPrizePool_*`, `test_sponsorPool_*` (in SponsorshipModule.t.sol — 11 tests) | OK. Both paths exercised — positive, sanctioned-revert, post-settle-revert. |
| 6 | Class-agnostic (humans + agents) | No code branch on participant class — same submitScore / submitSoloScore for both | Implicit (no agent-specific code path to test) | This is an **absence-of-feature** invariant. Cannot be tested for directly. Auditor should be told this is by design. |
| 7 | Off-chain commitments — backend signs, on-chain enforces | All four sig flows above + `usedNonces` mappings | `*_nonce_*` tests in TournamentPool.t.sol + ArcadePool.t.sol; chainId binding tested implicitly (digest contains `block.chainid`) | No explicit cross-chain replay test (would need `vm.chainId` switch mid-test). Add one.|

**Aggregate:** 5 of 7 invariants have direct test coverage. INV1 needs a Foundry
stateful-invariant runner (current tests are sequential unit-style). INV6 cannot be
tested directly. INV4 (signer auth) has a malleability gap to close.

---

## 7 — Coverage Notes

Full data: `contracts-coverage.txt` (forge summary), `raw/lcov.info` (LCOV format).

### Per-file branch coverage (src only)

| Contract | Lines | Statements | Branches | Funcs |
|---|---:|---:|---:|---:|
| ArcadePool | 100 % | 100 % | **11.76 %** | 100 % |
| ChallengeEscrow | 100 % | 91.34 % | 61.54 % | 100 % |
| DevAttributionNFT | 100 % | 100 % | 100 % | 100 % |
| MockSanctionsOracle | 66.67 % | 57.14 % | 0 % | 66.67 % |
| SkillbaseAnchor | 100 % | 91.30 % | 66.67 % | 100 % |
| SponsorReceiptSBT | 100 % | 100 % | 100 % | 100 % |
| SponsorshipModule | 100 % | 86.67 % | 50 % | 100 % |
| TournamentPool | 97.37 % | 93.64 % | 73.77 % | 96.15 % |

ArcadePool branch-coverage gap is the one L-7-tracked finding. MockSanctionsOracle 0 % branches is acceptable — it's a testnet helper.

### Test counts per suite

| Suite | Tests |
|---|---:|
| ArcadePool.t.sol | 22 |
| ChallengeEscrow.t.sol | 25 |
| DevAttributionNFT.t.sol | 19 |
| SkillbaseAnchor.t.sol | 17 |
| SponsorReceiptSBT.t.sol | 16 |
| SponsorshipModule.t.sol | 11 |
| TournamentPool.t.sol | 91 |
| X15-paid-retry.t.sol | 6 |
| **Total** | **207** |

---

## 8 — Tool Run Artifacts

| File | Content |
|---|---|
| `raw/slither.json.gz` | 1.9 MB (gzipped from 20 MB). Full slither output with all detector hits (90 contracts analyzed). Decompress with `gunzip -k`. |
| `raw/slither-src-only.json` | 864 KB. The 40 src/-scoped findings extracted from the full output, ready for direct read. |
| `raw/slither.stderr.log` | 1 047 lines. Human-readable slither report (slither prints to stderr by convention). |
| `raw/aderyn-report.md` | 12 KB. Aderyn 88-detector run. |
| `raw/4naly3er-report.md` | 2 160 lines. 4naly3er Gas/NC/Low/Medium. **One detector patched** to handle Solidity 0.8.26 AST shape — see `4naly3er.stderr.log` for the find-all.js null-guard. |
| `raw/solhint.txt` | 313 lines. solhint --config from a job-dir-scoped `.solhint.json` (extends `solhint:recommended`). |
| `raw/forge-coverage.stdout.log` | 289 lines. forge coverage --report summary --report lcov. |
| `raw/lcov.info` | 19 KB. LCOV for IDE coverage plugins / lcov-gutters. |
| `raw/storage-*.stderr.log` | Per-contract forge inspect stderr. |
| `contracts-storage-layout.md` | All 8 contracts' storage layouts (forge inspect format) in a single readable doc. |
| `contracts-coverage.txt` | Mirror of forge-coverage.stdout.log at the expected output path. |
| `contracts-natspec-gaps.md` | NatSpec gap analysis (185 hits). |

## 9 — Recommendations Roll-up (priority order)

1. **M-1** — refundIfEmpty unbounded loop → pull-payment refactor on ArcadePool.
2. **M-3** — Timelock + sub-bucket parameterization on `emergencyWithdraw` (TournamentPool + ChallengeEscrow).
3. **L-2** — Migrate the 6 single-step `Ownable` to `Ownable2Step`.
4. **M-2** — Consolidate signature scheme to EIP-712 across the 3 signed-message contracts.
5. **L-7** — Lift ArcadePool branch coverage to ≥ 80 %.
6. **L-1** — Pin all contracts to `pragma solidity 0.8.26;`.
7. **L-8** — Add `uint256 deadline` to all signed digests.
8. **Invariant suite** — Add Foundry `StdInvariant`-based runner for INV1.
9. **NatSpec** — work `contracts-natspec-gaps.md` to completion (ArcadePool full pass + event tags in TournamentPool/ChallengeEscrow).

Items 1-4 are blocking for external audit (Medium-severity). Items 5-9 reduce
auditor "polish" hours and improve confidence.
