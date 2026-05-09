// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title TournamentPool
/// @notice Sponsored sweepstakes tournaments — free first entry + paid retries on solo path.
/// @author ceos.run (Simpl3 Inc.)
/// @dev Flow:
///   1. Sponsor calls createTournament(id, devAddr, ...) — deposits prize pool in USDC and
///      records the developer attribution address (`devAddr`) for fee-share routing.
///   2a. Duel path (legacy): backend signs EIP-191 attestations; anyone relays submitScore().
///   2b. Solo path (v2): first solo submission is free. For 2+ solo submissions, the
///       player must first call chargeEntryFee() (pays ENTRY_FEE USDC). submitSoloScore()
///       enforces on-chain: N-th solo submission (N≥2) requires (N-1)·ENTRY_FEE paid.
///   3. Backend flags implausible scores via flagScore() before settle.
///   4. After endsAt, anyone calls settle(id, sortedRanking) — contract verifies
///      the caller-supplied ordering and distributes per the top-50% curve.
///   5. Owner calls withdrawFees(id, to) at any time to pull collected entry fees
///      to the team wallet — completely separate from prize allocation. (v2.2 splits
///      this into withdrawFeesToDev + withdrawFeesToPlatform per the 70/30 share.)
///
/// Architectural invariant (sweepstakes posture):
///   Entry fees flow into feeCollected[id]; prize pool flows from createTournament's
///   deposit (and any subsequent fundPrizePool top-ups). These two buckets NEVER mix.
///   withdrawFees() can only draw from feeCollected. settle() can only draw from the
///   prize pool. Tested explicitly.
///
/// Prize curve (top 50% = ceil(N/2), applied in bps of prizePool):
///   place 1 — 2500 bps
///   place 2 — 1500 bps
///   place 3 — 1000 bps
///   places 4..min(10, topN) — 500 bps each
///   places 11..topN — 1500 bps / (topN - 10), split equally
///   N < 4 degenerate — place 1 takes 100%
///
/// Unused pool (when the curve doesn't reach 100% for small N, or integer-div
/// dust in the tier-5 split) refunds to the sponsor. This preserves the spec's
/// literal breakdown without inflating top-place shares.
///
/// Effective ranking score (integer math, no division on-chain, match count capped
/// at MATCH_COUNT_CAP so paid retries don't dominate skill signal):
///   cappedMc = min(matchCount(p), MATCH_COUNT_CAP)
///   effective(p) = bestScore(p) * 85 + cappedMc * participationBonus * 15
/// Ties are resolved by caller-supplied order — the contract only verifies
/// monotonic-descending effective scores, not that the order is canonical.
contract TournamentPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Errors ────────────────────────────────────────────────────────────────

    error TournamentAlreadyExists();
    error TournamentNotFound();
    error TournamentAlreadySettled();
    error TournamentNotEnded();
    error TournamentAlreadyEnded();
    error TournamentNotStarted();
    error InvalidWindow();
    error ZeroPrize();
    error ZeroAddress();
    error BadSignature();
    error NonceUsed();
    error PlayerNotInTournament();
    error InvalidRankingLength();
    error InvalidRankingOrder();
    error NotParticipant();
    error PlayerExcluded();
    error DuplicateInRanking();
    error InsufficientFeePaid();
    error PlayerMismatch();

    // ─── Types ─────────────────────────────────────────────────────────────────

    enum CycleType {
        Daily,
        Weekly
    }

    /// @notice Submission origin — Duel (legacy submitScore) or Solo (submitSoloScore).
    enum SubmissionSource {
        Duel,
        Solo
    }

    struct Tournament {
        address sponsor;
        /// @dev Developer attribution address — set at createTournament time, immutable
        ///      thereafter. Used by v2.2 fee-share routing (70/30 dev/platform split) and
        ///      DevAttributionNFT minting. MUST be non-zero.
        address devAddr;
        bytes32 game;
        CycleType cycleType;
        uint64 startsAt;
        uint64 endsAt;
        uint256 prizePool;
        uint256 participationBonus;
        bool settled;
        address[] participants;
    }

    struct RankEntry {
        address player;
        uint256 effectiveScore;
    }

    /// @notice Per-submission audit trail entry (solo or duel).
    /// @dev    `runId` is duel id for Duel source (zero for legacy submitScore pre-runId),
    ///         or `soloRunId` passed to submitSoloScore for Solo source.
    struct Submission {
        uint256 score;
        uint256 timestamp;
        SubmissionSource source;
        bytes32 runId;
    }

    // ─── Constants ─────────────────────────────────────────────────────────────

    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice Best-score weight (x85 in effective score integer math).
    uint256 public constant SCORE_WEIGHT = 85;

    /// @notice Participation weight (x15 in effective score integer math).
    uint256 public constant PARTICIPATION_WEIGHT = 15;

    /// @notice Match-count cap in effective score — paid retries beyond this don't
    ///         increase the participation component. Prevents fee-for-rank behavior.
    uint256 public constant MATCH_COUNT_CAP = 10;

    /// @notice Flat entry fee per paid solo submission — 1 USDC (6 decimals).
    /// @dev    Renamed from RETRY_FEE in v2.2; semantics unchanged (first solo is free,
    ///         each subsequent solo charges ENTRY_FEE).
    uint256 public constant ENTRY_FEE = 1_000_000;

    // Prize curve in basis points of prizePool.
    uint256 private constant BPS_PLACE_1 = 2500;
    uint256 private constant BPS_PLACE_2 = 1500;
    uint256 private constant BPS_PLACE_3 = 1000;
    uint256 private constant BPS_PLACES_4_TO_10 = 500;
    uint256 private constant BPS_TIER5_POOL = 1500;
    uint256 private constant TIER5_START_INDEX = 10; // 0-indexed: starts at place 11

    // ─── State ─────────────────────────────────────────────────────────────────

    /// @notice USDC token (6 decimals) used for prize pools.
    IERC20 public immutable USDC;

    /// @notice Server-side EOA that signs submit attestations.
    address public trustedSigner;

    /// @notice Tournament storage keyed by client-generated bytes32 id.
    mapping(bytes32 => Tournament) internal _tournaments;

    /// @notice Per-tournament, per-player best score (raw game score, not weighted).
    mapping(bytes32 => mapping(address => uint256)) public bestScore;

    /// @notice Per-tournament, per-player cumulative match count.
    mapping(bytes32 => mapping(address => uint256)) public matchCount;

    /// @notice Per-tournament, per-player excluded flag (set by flagScore before settle).
    mapping(bytes32 => mapping(address => bool)) public excluded;

    /// @notice Per-tournament, per-player participation flag (true after first submitScore).
    mapping(bytes32 => mapping(address => bool)) public isParticipant;

    /// @notice Global nonce map for submitScore attestations — prevents replay across all tournaments.
    mapping(bytes32 => bool) public usedNonces;

    /// @notice Internal seen-set for settle ranking validation. Not cleared on settle
    ///         success because a settled tournament can never be settled again.
    mapping(bytes32 => mapping(address => bool)) private _seenInRanking;

    /// @notice Per-tournament, per-player audit trail of submissions (solo + duel).
    mapping(bytes32 => mapping(address => Submission[])) internal _submissionHistory;

    /// @notice Per-tournament, per-player count of Solo submissions. First solo is free;
    ///         submitSoloScore enforces priorSolo·ENTRY_FEE ≤ feePaidByPlayer before accepting N+1.
    mapping(bytes32 => mapping(address => uint256)) public soloSubmissionCount;

    /// @notice Per-tournament, per-player cumulative entry fees paid (in USDC atoms).
    ///         Informational + basis for on-chain enforcement in submitSoloScore.
    mapping(bytes32 => mapping(address => uint256)) public feePaidByPlayer;

    /// @notice Per-tournament cumulative entry fees collected. Decrements on withdrawFees.
    ///         MUST NEVER flow into prizePool — architectural invariant (sweepstakes posture).
    mapping(bytes32 => uint256) public feeCollected;

    // ─── Events ────────────────────────────────────────────────────────────────

    event TournamentCreated(
        bytes32 indexed id,
        address indexed sponsor,
        bytes32 indexed game,
        address devAddr,
        CycleType cycleType,
        uint64 startsAt,
        uint64 endsAt,
        uint256 prizePool,
        uint256 participationBonus
    );
    /// @notice Emitted on permissionless top-up of a tournament's prize pool.
    /// @dev    `funder` is the direct caller (typically SponsorshipModule).
    ///         End-user sponsor identity is captured separately by the module's
    ///         PoolSponsored event + SponsorReceiptSBT mint.
    event PrizePoolFunded(bytes32 indexed id, address indexed funder, uint256 amount, uint256 newPrizePool);
    event ScoreSubmitted(
        bytes32 indexed id, address indexed player, uint256 score, uint256 matchCountDelta, bytes32 nonce
    );
    event SoloScoreSubmitted(
        bytes32 indexed id,
        address indexed player,
        uint256 score,
        uint256 matchCountDelta,
        bytes32 nonce,
        bytes32 soloRunId,
        uint256 priorSoloCount
    );
    event EntryFeePaid(bytes32 indexed id, address indexed player, uint256 amount);
    event FeesWithdrawn(bytes32 indexed id, address indexed to, uint256 amount);
    event ScoreFlagged(bytes32 indexed id, address indexed player);
    event TournamentSettled(bytes32 indexed id, uint256 totalDistributed, uint256 refunded);
    event PrizePaid(bytes32 indexed id, address indexed player, uint256 place, uint256 amount);
    event TrustedSignerUpdated(address indexed newSigner);

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(IERC20 _usdc, address _trustedSigner) Ownable(msg.sender) {
        if (address(_usdc) == address(0)) revert ZeroAddress();
        if (_trustedSigner == address(0)) revert ZeroAddress();
        USDC = _usdc;
        trustedSigner = _trustedSigner;
    }

    // ─── Tournament Lifecycle ──────────────────────────────────────────────────

    /// @notice Create a sponsored tournament and deposit the prize pool.
    /// @dev    Caller becomes the sponsor. Prize pool must be pre-approved. The
    ///         developer attribution address (`devAddr`) is recorded immutably and
    ///         drives v2.2 fee-share routing (70/30 dev/platform split) plus
    ///         DevAttributionNFT minting policy.
    /// @param  id                   Client-generated bytes32 tournament id.
    /// @param  devAddr              Developer attribution address — receives 70% of entry
    ///                              fees via withdrawFeesToDev. MUST be non-zero.
    /// @param  game                 Game slug (keccak256(utf8(name))).
    /// @param  cycleType            Daily or Weekly (informational — endsAt controls settlement).
    /// @param  startsAt             Unix timestamp when submission opens.
    /// @param  endsAt               Unix timestamp when submission closes + settle unlocks.
    /// @param  prizePool            USDC amount the sponsor deposits (6 decimals).
    /// @param  participationBonus   Per-tournament constant added per match to effective score.
    function createTournament(
        bytes32 id,
        address devAddr,
        bytes32 game,
        CycleType cycleType,
        uint64 startsAt,
        uint64 endsAt,
        uint256 prizePool,
        uint256 participationBonus
    ) external nonReentrant {
        if (_tournaments[id].sponsor != address(0)) revert TournamentAlreadyExists();
        if (devAddr == address(0)) revert ZeroAddress();
        if (endsAt <= startsAt) revert InvalidWindow();
        if (prizePool == 0) revert ZeroPrize();

        USDC.safeTransferFrom(msg.sender, address(this), prizePool);

        Tournament storage t = _tournaments[id];
        t.sponsor = msg.sender;
        t.devAddr = devAddr;
        t.game = game;
        t.cycleType = cycleType;
        t.startsAt = startsAt;
        t.endsAt = endsAt;
        t.prizePool = prizePool;
        t.participationBonus = participationBonus;

        emit TournamentCreated(
            id, msg.sender, game, devAddr, cycleType, startsAt, endsAt, prizePool, participationBonus
        );
    }

    /// @notice Permissionless top-up of an existing tournament's prize pool.
    /// @dev    Anyone may fund any non-settled tournament. The SponsorshipModule
    ///         wraps this call with sanctions screening + soulbound receipt mint,
    ///         but at the pool level only lifecycle invariants are enforced
    ///         (tournament exists, not settled). Sponsors may fund before
    ///         startsAt or after endsAt — only the settled flag is decisive.
    ///
    ///         Architectural invariant (sweepstakes posture):
    ///         this function ONLY mutates t.prizePool. It never touches
    ///         feeCollected. The retry-fee/prize-pool segregation that v2
    ///         depends on for clean fee withdrawal survives this addition.
    ///
    ///         Tested: see TournamentPool.t.sol invariant — feeCollected[id]
    ///         is unchanged for any sequence of fundPrizePool calls.
    /// @param  id      Tournament identifier (must exist via createTournament).
    /// @param  amount  USDC atoms (6 decimals) to add to the prize pool.
    function fundPrizePool(bytes32 id, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroPrize();
        Tournament storage t = _tournaments[id];
        if (t.sponsor == address(0)) revert TournamentNotFound();
        if (t.settled) revert TournamentAlreadySettled();

        USDC.safeTransferFrom(msg.sender, address(this), amount);
        t.prizePool += amount;

        emit PrizePoolFunded(id, msg.sender, amount, t.prizePool);
    }

    /// @notice Submit a player's score via backend-signed attestation.
    /// @dev    Digest: keccak256(abi.encode(id, player, score, matchCountDelta, nonce, address(this), block.chainid))
    /// @param  id               Tournament identifier.
    /// @param  player           Player whose score is being recorded.
    /// @param  score            Raw game score — stored as bestScore if it exceeds the prior best.
    /// @param  matchCountDelta  Added to the player's matchCount (usually 1 per submission).
    /// @param  nonce            Unique per-submission nonce from backend for replay protection.
    /// @param  signature        ECDSA signature from trustedSigner over the digest.
    function submitScore(
        bytes32 id,
        address player,
        uint256 score,
        uint256 matchCountDelta,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        Tournament storage t = _tournaments[id];
        if (t.sponsor == address(0)) revert TournamentNotFound();
        if (t.settled) revert TournamentAlreadySettled();
        if (block.timestamp < t.startsAt) revert TournamentNotStarted();
        if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();
        if (usedNonces[nonce]) revert NonceUsed();
        if (player == address(0)) revert ZeroAddress();

        _verifySubmitSignature(id, player, score, matchCountDelta, nonce, signature);

        usedNonces[nonce] = true;

        if (!isParticipant[id][player]) {
            isParticipant[id][player] = true;
            t.participants.push(player);
        }

        if (score > bestScore[id][player]) {
            bestScore[id][player] = score;
        }
        matchCount[id][player] += matchCountDelta;

        _submissionHistory[id][player].push(
            Submission({score: score, timestamp: block.timestamp, source: SubmissionSource.Duel, runId: bytes32(0)})
        );

        emit ScoreSubmitted(id, player, score, matchCountDelta, nonce);
    }

    /// @notice Submit a solo score via backend-signed attestation.
    /// @dev    First solo submission per player is free. For N≥2, the player must have
    ///         already called chargeEntryFee() priorSolo times (i.e. feePaidByPlayer ≥
    ///         priorSolo·ENTRY_FEE). Enforcement is on-chain — even if the backend signer
    ///         is compromised, fees cannot be skipped without a prior chargeEntryFee tx.
    ///
    ///         Digest: keccak256(abi.encode(id, player, score, soloRunId, matchCountDelta,
    ///                                      nonce, address(this), block.chainid))
    ///         Uses the global usedNonces map shared with submitScore — digest layouts
    ///         differ (Solo has extra soloRunId field) so signatures cannot collide.
    /// @param  id               Tournament identifier.
    /// @param  player           Player whose solo score is being recorded.
    /// @param  score            Raw game score.
    /// @param  soloRunId        Backend-assigned identifier for this solo run (audit trail).
    /// @param  matchCountDelta  Added to the player's matchCount (typically 1).
    /// @param  nonce            Unique per-submission nonce (shared nonce space with submitScore).
    /// @param  signature        ECDSA signature from trustedSigner over the digest.
    function submitSoloScore(
        bytes32 id,
        address player,
        uint256 score,
        bytes32 soloRunId,
        uint256 matchCountDelta,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        Tournament storage t = _tournaments[id];
        if (t.sponsor == address(0)) revert TournamentNotFound();
        if (t.settled) revert TournamentAlreadySettled();
        if (block.timestamp < t.startsAt) revert TournamentNotStarted();
        if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();
        if (usedNonces[nonce]) revert NonceUsed();
        if (player == address(0)) revert ZeroAddress();

        _verifySoloSubmitSignature(id, player, score, soloRunId, matchCountDelta, nonce, signature);

        usedNonces[nonce] = true;

        // Entry fee invariant: first solo free; N-th solo (N≥2) requires (N-1)·ENTRY_FEE paid.
        uint256 priorSolo = soloSubmissionCount[id][player];
        if (priorSolo >= 1 && feePaidByPlayer[id][player] < priorSolo * ENTRY_FEE) {
            revert InsufficientFeePaid();
        }
        soloSubmissionCount[id][player] = priorSolo + 1;

        if (!isParticipant[id][player]) {
            isParticipant[id][player] = true;
            t.participants.push(player);
        }

        if (score > bestScore[id][player]) {
            bestScore[id][player] = score;
        }
        matchCount[id][player] += matchCountDelta;

        _submissionHistory[id][player].push(
            Submission({score: score, timestamp: block.timestamp, source: SubmissionSource.Solo, runId: soloRunId})
        );

        emit SoloScoreSubmitted(id, player, score, matchCountDelta, nonce, soloRunId, priorSolo);
    }

    /// @notice Player-initiated entry fee payment — pulls ENTRY_FEE USDC from msg.sender.
    /// @dev    Must be called by the player themselves (msg.sender == player). Separated
    ///         from submitSoloScore so the two concerns — payment accounting and score
    ///         submission — have independent state. Each call increments feePaidByPlayer
    ///         and feeCollected; does NOT touch prizePool under any code path.
    ///         Renamed from chargeRetryFee in v2.2; semantics unchanged.
    /// @param  id      Tournament identifier.
    /// @param  player  Player paying the fee (must equal msg.sender).
    function chargeEntryFee(bytes32 id, address player) external nonReentrant {
        if (msg.sender != player) revert PlayerMismatch();
        Tournament storage t = _tournaments[id];
        if (t.sponsor == address(0)) revert TournamentNotFound();
        if (t.settled) revert TournamentAlreadySettled();
        if (block.timestamp < t.startsAt) revert TournamentNotStarted();
        if (block.timestamp >= t.endsAt) revert TournamentAlreadyEnded();

        USDC.safeTransferFrom(player, address(this), ENTRY_FEE);
        feePaidByPlayer[id][player] += ENTRY_FEE;
        feeCollected[id] += ENTRY_FEE;

        emit EntryFeePaid(id, player, ENTRY_FEE);
    }

    /// @notice Mark a player as excluded (anti-cheat veto). Must be called before settle.
    /// @dev    Owner-only. Excluded players are skipped in ranking + prize distribution.
    function flagScore(bytes32 id, address player) external onlyOwner {
        Tournament storage t = _tournaments[id];
        if (t.sponsor == address(0)) revert TournamentNotFound();
        if (t.settled) revert TournamentAlreadySettled();
        if (!isParticipant[id][player]) revert PlayerNotInTournament();

        excluded[id][player] = true;
        emit ScoreFlagged(id, player);
    }

    /// @notice Settle a tournament — distribute prizes per the top-50% curve.
    /// @dev    Anyone may call after endsAt. Caller passes the pre-sorted ranking
    ///         (non-excluded participants, descending effective score). Contract
    ///         verifies completeness + order + no-duplicate, then pays out.
    ///         Unused pool (small-N leftover, tier-5 dust) refunds to sponsor.
    /// @param  id              Tournament identifier.
    /// @param  sortedRanking   Participants ordered by descending effective score.
    function settle(bytes32 id, address[] calldata sortedRanking) external nonReentrant {
        Tournament storage t = _tournaments[id];
        if (t.sponsor == address(0)) revert TournamentNotFound();
        if (t.settled) revert TournamentAlreadySettled();
        if (block.timestamp < t.endsAt) revert TournamentNotEnded();

        uint256 expectedCount = _countNonExcluded(id, t);
        if (sortedRanking.length != expectedCount) revert InvalidRankingLength();

        // Early mark as settled — reentrancy-safe and also locks in the state before
        // any external USDC transfers.
        t.settled = true;

        _verifyRanking(id, t, sortedRanking);

        uint256 totalDistributed = _distributePrizes(id, t, sortedRanking);

        uint256 refunded = 0;
        if (totalDistributed < t.prizePool) {
            refunded = t.prizePool - totalDistributed;
            USDC.safeTransfer(t.sponsor, refunded);
        }

        emit TournamentSettled(id, totalDistributed, refunded);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function setTrustedSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        trustedSigner = newSigner;
        emit TrustedSignerUpdated(newSigner);
    }

    /// @notice Withdraw collected entry fees for a tournament to the team wallet.
    /// @dev    Draws strictly from feeCollected[id]; cannot access prizePool. Can be
    ///         called at any time (before/during/after tournament) — entry fees are
    ///         independent of prize lifecycle. Uses CEI ordering (state zeroed before
    ///         transfer) to eliminate reentrancy surface.
    /// @param  id  Tournament identifier whose collected fees should be withdrawn.
    /// @param  to  Destination address (team wallet).
    function withdrawFees(bytes32 id, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = feeCollected[id];
        if (amount == 0) return;
        feeCollected[id] = 0;
        USDC.safeTransfer(to, amount);
        emit FeesWithdrawn(id, to, amount);
    }

    /// @notice Emergency withdrawal of any stuck USDC. Owner-only safety valve.
    function emergencyWithdraw(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = USDC.balanceOf(address(this));
        USDC.safeTransfer(to, balance);
    }

    // ─── Views ─────────────────────────────────────────────────────────────────

    function getTournament(bytes32 id) external view returns (Tournament memory) {
        return _tournaments[id];
    }

    function getParticipants(bytes32 id) external view returns (address[] memory) {
        return _tournaments[id].participants;
    }

    function participantCount(bytes32 id) external view returns (uint256) {
        return _tournaments[id].participants.length;
    }

    /// @notice Effective ranking score for a single player.
    /// @dev    Returns 0 for excluded players. Uses integer math only.
    function effectiveScoreOf(bytes32 id, address player) public view returns (uint256) {
        if (excluded[id][player]) return 0;
        return
            _computeEffectiveScore(bestScore[id][player], matchCount[id][player], _tournaments[id].participationBonus);
    }

    /// @notice Returns non-excluded participants sorted by descending effective score.
    /// @dev    O(n^2) insertion sort in memory. View-only; intended for off-chain readers.
    function getRanking(bytes32 id) external view returns (RankEntry[] memory) {
        Tournament storage t = _tournaments[id];
        uint256 n = t.participants.length;

        uint256 count;
        for (uint256 i; i < n; ++i) {
            if (!excluded[id][t.participants[i]]) ++count;
        }

        RankEntry[] memory entries = new RankEntry[](count);
        uint256 idx;
        for (uint256 i; i < n; ++i) {
            address p = t.participants[i];
            if (excluded[id][p]) continue;
            entries[idx++] = RankEntry({
                player: p,
                effectiveScore: _computeEffectiveScore(bestScore[id][p], matchCount[id][p], t.participationBonus)
            });
        }

        // Insertion sort descending.
        for (uint256 i = 1; i < count; ++i) {
            RankEntry memory cur = entries[i];
            uint256 j = i;
            while (j > 0 && entries[j - 1].effectiveScore < cur.effectiveScore) {
                entries[j] = entries[j - 1];
                unchecked {
                    --j;
                }
            }
            entries[j] = cur;
        }

        return entries;
    }

    /// @notice Length of the submission history array for (tournament, player).
    function submissionHistoryLength(bytes32 id, address player) external view returns (uint256) {
        return _submissionHistory[id][player].length;
    }

    /// @notice Fetch a single submission by index from the audit trail.
    function submissionAt(bytes32 id, address player, uint256 index) external view returns (Submission memory) {
        return _submissionHistory[id][player][index];
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    function _computeEffectiveScore(uint256 best, uint256 mc, uint256 bonus) internal pure returns (uint256) {
        uint256 cappedMc = mc > MATCH_COUNT_CAP ? MATCH_COUNT_CAP : mc;
        return best * SCORE_WEIGHT + cappedMc * bonus * PARTICIPATION_WEIGHT;
    }

    function _verifySubmitSignature(
        bytes32 id,
        address player,
        uint256 score,
        uint256 matchCountDelta,
        bytes32 nonce,
        bytes calldata signature
    ) internal view {
        bytes32 digest = keccak256(abi.encode(id, player, score, matchCountDelta, nonce, address(this), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        address signer = ECDSA.recover(ethDigest, signature);
        if (signer != trustedSigner) revert BadSignature();
    }

    function _verifySoloSubmitSignature(
        bytes32 id,
        address player,
        uint256 score,
        bytes32 soloRunId,
        uint256 matchCountDelta,
        bytes32 nonce,
        bytes calldata signature
    ) internal view {
        bytes32 digest = keccak256(
            abi.encode(id, player, score, soloRunId, matchCountDelta, nonce, address(this), block.chainid)
        );
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        address signer = ECDSA.recover(ethDigest, signature);
        if (signer != trustedSigner) revert BadSignature();
    }

    function _countNonExcluded(bytes32 id, Tournament storage t) internal view returns (uint256 c) {
        uint256 n = t.participants.length;
        for (uint256 i; i < n; ++i) {
            if (!excluded[id][t.participants[i]]) {
                unchecked {
                    ++c;
                }
            }
        }
    }

    function _verifyRanking(bytes32 id, Tournament storage t, address[] calldata ranking) internal {
        uint256 len = ranking.length;
        uint256 prevScore = type(uint256).max;
        uint256 bonus = t.participationBonus;

        for (uint256 i; i < len; ++i) {
            address p = ranking[i];
            if (!isParticipant[id][p]) revert NotParticipant();
            if (excluded[id][p]) revert PlayerExcluded();
            if (_seenInRanking[id][p]) revert DuplicateInRanking();
            _seenInRanking[id][p] = true;

            uint256 sc = _computeEffectiveScore(bestScore[id][p], matchCount[id][p], bonus);
            if (sc > prevScore) revert InvalidRankingOrder();
            prevScore = sc;
        }
    }

    function _distributePrizes(bytes32 id, Tournament storage t, address[] calldata ranking)
        internal
        returns (uint256 totalDistributed)
    {
        uint256 n = ranking.length;
        if (n == 0) return 0;

        uint256 pool = t.prizePool;

        // Degenerate: fewer than 4 participants → place 1 takes all.
        if (n < 4) {
            USDC.safeTransfer(ranking[0], pool);
            emit PrizePaid(id, ranking[0], 1, pool);
            return pool;
        }

        uint256 topN = (n + 1) / 2; // ceil(N / 2)

        // Top-3 fixed bps.
        _pay(id, ranking, 0, (pool * BPS_PLACE_1) / BPS_DENOMINATOR);
        _pay(id, ranking, 1, (pool * BPS_PLACE_2) / BPS_DENOMINATOR);
        _pay(id, ranking, 2, (pool * BPS_PLACE_3) / BPS_DENOMINATOR);
        totalDistributed = (pool * BPS_PLACE_1) / BPS_DENOMINATOR + (pool * BPS_PLACE_2) / BPS_DENOMINATOR
            + (pool * BPS_PLACE_3) / BPS_DENOMINATOR;

        // Places 4..min(topN, 10) get 500 bps each.
        uint256 tier4End = topN < TIER5_START_INDEX ? topN : TIER5_START_INDEX;
        uint256 perPlace45 = (pool * BPS_PLACES_4_TO_10) / BPS_DENOMINATOR;
        for (uint256 i = 3; i < tier4End; ++i) {
            _pay(id, ranking, i, perPlace45);
            totalDistributed += perPlace45;
        }

        // Places 11..topN split 1500 bps equally. Integer-div dust refunds to sponsor.
        if (topN > TIER5_START_INDEX) {
            uint256 tier5Count = topN - TIER5_START_INDEX;
            uint256 tier5Pool = (pool * BPS_TIER5_POOL) / BPS_DENOMINATOR;
            uint256 perPlaceT5 = tier5Pool / tier5Count;
            if (perPlaceT5 > 0) {
                for (uint256 i = TIER5_START_INDEX; i < topN; ++i) {
                    _pay(id, ranking, i, perPlaceT5);
                    totalDistributed += perPlaceT5;
                }
            }
        }
    }

    function _pay(bytes32 id, address[] calldata ranking, uint256 idx, uint256 amount) internal {
        if (amount == 0) return;
        address winner = ranking[idx];
        USDC.safeTransfer(winner, amount);
        emit PrizePaid(id, winner, idx + 1, amount);
    }
}
