// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IDevAttributionNFT} from "./DevAttributionNFT.sol";

/// @title TournamentPool
/// @notice Sponsored sweepstakes tournaments — free first entry + paid retries on solo path.
/// @author ceos.run (Simpl3 Inc.)
/// @dev Flow:
///   1. Sponsor calls createTournament(id, devAddr, ...) — deposits prize pool in USDC,
///      records the developer attribution address (`devAddr`) for fee-share routing,
///      and (on the dev's first tournament only) mints a soulbound DevAttributionNFT
///      to `devAddr` via the bound DevAttributionNFT contract. The mint is idempotent
///      across tournaments — devNFTMinted[devAddr] is the cache.
///   2a. Duel path (legacy): backend signs EIP-191 attestations; anyone relays submitScore().
///   2b. Solo path (v2): first solo submission is free. For 2+ solo submissions, the
///       player must first call chargeEntryFee() (pays ENTRY_FEE USDC). submitSoloScore()
///       enforces on-chain: N-th solo submission (N≥2) requires (N-1)·ENTRY_FEE paid.
///   3. Backend flags implausible scores via flagScore() before settle.
///   4. After endsAt, anyone calls settle(id, sortedRanking) — contract verifies
///      the caller-supplied ordering and distributes per the top-50% curve.
///   5. Fee withdrawals are split per the 70/30 share. The recorded developer
///      calls withdrawFeesToDev(id) at any time to pull their bucket; the contract
///      owner calls withdrawFeesToPlatform(id) for the platform bucket. Each
///      function is single-arg and pays msg.sender, so the access-control identity
///      and the payout destination cannot diverge. Both are completely separate
///      from prize allocation.
///
/// Architectural invariants (sweepstakes posture):
///   v2.2 splits the legacy single feeCollected accumulator into two per-tournament
///   buckets — feeCollected_dev (70%, DEV_BPS) and feeCollected_platform (30%,
///   PLATFORM_BPS) — both populated atomically inside chargeEntryFee. Neither
///   bucket may be reached by settle() or fundPrizePool(); the prize pool likewise
///   may not be reached by withdrawFeesToDev() or withdrawFeesToPlatform().
///   All three storage destinations
///   (feeCollected_dev, feeCollected_platform, t.prizePool) live on disjoint
///   keccak-derived addresses, regardless of how the prize pool is funded
///   (initial deposit or permissionless top-up — both write the same slot).
///   The test suite's INV1/INV2 family pins this segregation across full
///   lifecycles.
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
    /// @notice Caller is not the developer recorded on the tournament. Returned by
    ///         withdrawFeesToDev when msg.sender != Tournament.devAddr.
    error OnlyDev();

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

    // Separate from TOTAL_BPS to keep prize-curve and fee-split denominators
    // independent: prize curve uses basis points for tier weights (BPS_PLACE_1
    // ... BPS_TIER5_POOL), fee split uses basis points for the atomic 70/30
    // ratio. Both happen to equal 10_000 today; future tuning of one
    // domain must not constrain the other.
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

    // ─── v2.2 fee-share constants ──────────────────────────────────────────────
    // Locked: any change here is an audit-rescope event. The chargeEntryFee
    // path is bound by these constants — see also feeCollected_dev /
    // feeCollected_platform below. At ENTRY_FEE = 1_000_000 the bps math is
    // exact (700_000 + 300_000), so chargeEntryFee never strands dust.

    /// @notice Developer share of each entry fee, in basis points of TOTAL_BPS.
    uint256 public constant DEV_BPS = 7000;

    /// @notice Platform share of each entry fee, in basis points of TOTAL_BPS.
    uint256 public constant PLATFORM_BPS = 3000;

    /// @notice Denominator for the dev/platform share split. Must equal DEV_BPS + PLATFORM_BPS.
    uint256 public constant TOTAL_BPS = 10_000;

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

    /// @notice The DevAttributionNFT contract; one soulbound NFT minted per
    ///         developer address on their first createTournament call. Pinned
    ///         at construction via address-prediction (CREATE nonce arithmetic
    ///         in deploy scripts; vm.computeCreateAddress in tests) so neither
    ///         pool nor NFT needs a setter.
    IDevAttributionNFT public immutable devNFT;

    /// @notice Server-side EOA that signs submit attestations.
    address public trustedSigner;

    /// @notice Cache marking whether a given developer address has already had
    ///         its DevAttributionNFT minted. Gas optimization to skip the
    ///         cross-contract call on the second-and-onward createTournament
    ///         per devAddr. Set to true atomically with the mint inside
    ///         createTournament; never cleared (the NFT itself is permanent).
    mapping(address => bool) public devNFTMinted;

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

    /// @notice Per-tournament cumulative entry fees credited to the developer share
    ///         (DEV_BPS / TOTAL_BPS of every chargeEntryFee). Decrements on withdrawFeesToDev / withdrawFeesToPlatform.
    ///         MUST NEVER flow into prizePool — sweepstakes-safety invariant (INV1).
    /// @dev    v2.2 split of the legacy v2.1 `feeCollected` mapping.
    mapping(bytes32 => uint256) public feeCollected_dev;

    /// @notice Per-tournament cumulative entry fees credited to the platform share
    ///         (PLATFORM_BPS / TOTAL_BPS of every chargeEntryFee). Decrements on
    ///         withdrawFeesToPlatform. MUST NEVER flow into prizePool —
    ///         sweepstakes-safety invariant (INV1).
    /// @dev    v2.2 split of the legacy v2.1 `feeCollected` mapping.
    mapping(bytes32 => uint256) public feeCollected_platform;

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
    /// @notice The dev fee bucket for tournament `id` was drained by the recorded
    ///         developer. amount == feeCollected_dev[id] at the time of the call.
    event DevFeesWithdrawn(bytes32 indexed id, address indexed dev, uint256 amount);
    /// @notice The platform fee bucket for tournament `id` was drained by the
    ///         contract owner. amount == feeCollected_platform[id] at the time
    ///         of the call.
    event PlatformFeesWithdrawn(bytes32 indexed id, address indexed admin, uint256 amount);
    event ScoreFlagged(bytes32 indexed id, address indexed player);
    event TournamentSettled(bytes32 indexed id, uint256 totalDistributed, uint256 refunded);
    event PrizePaid(bytes32 indexed id, address indexed player, uint256 place, uint256 amount);
    event TrustedSignerUpdated(address indexed newSigner);

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(IERC20 _usdc, address _trustedSigner, address _devNFT) Ownable(msg.sender) {
        if (address(_usdc) == address(0)) revert ZeroAddress();
        if (_trustedSigner == address(0)) revert ZeroAddress();
        if (_devNFT == address(0)) revert ZeroAddress();
        USDC = _usdc;
        trustedSigner = _trustedSigner;
        devNFT = IDevAttributionNFT(_devNFT);
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

        // Idempotent dev attribution mint — first createTournament per devAddr triggers
        // the soulbound NFT mint; subsequent calls (any tournament, same dev) hit the
        // cache and skip the cross-contract call. devNFTMinted is set BEFORE the external
        // call (CEI ordering — defends against reentrancy even though the bound NFT is
        // trusted code with no callbacks).
        if (!devNFTMinted[devAddr]) {
            devNFTMinted[devAddr] = true;
            devNFT.mint(devAddr);
        }
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
    ///         feeCollected_dev or feeCollected_platform. The fee/prize-pool
    ///         segregation that v2.2 depends on for clean fee withdrawal
    ///         survives this addition.
    ///
    ///         Tested: see TournamentPool.t.sol invariant —
    ///         test_invariant_fundPrizePool_does_not_touch_feeCollected_anything.
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
    ///         and atomically splits ENTRY_FEE into the two fee buckets (DEV_BPS /
    ///         PLATFORM_BPS of TOTAL_BPS). Does NOT touch prizePool under any code path.
    ///
    ///         Sweepstakes-safety invariants (INV1, INV2):
    ///         - feeCollected_dev[id] and feeCollected_platform[id] occupy distinct
    ///           keccak256-derived storage slots, neither of which is reachable from
    ///           the prize-distribution code (settle / fundPrizePool) in this contract.
    ///         - At locked constants (ENTRY_FEE = 1_000_000, DEV_BPS = 7000,
    ///           PLATFORM_BPS = 3000, TOTAL_BPS = 10_000), devShare + platformShare
    ///           == ENTRY_FEE exactly — no dust stranded on the contract.
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

        uint256 devShare = (ENTRY_FEE * DEV_BPS) / TOTAL_BPS;
        uint256 platformShare = (ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;

        feePaidByPlayer[id][player] += ENTRY_FEE;
        feeCollected_dev[id] += devShare;
        feeCollected_platform[id] += platformShare;

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

    /// @notice Withdraw the dev share of entry fees for `id` to the recorded
    ///         developer. Only callable by Tournament.devAddr — caller-authenticated
    ///         transfer (msg.sender == devAddr, USDC sent to msg.sender).
    /// @dev    Draws strictly from feeCollected_dev[id]; cannot access
    ///         feeCollected_platform or prizePool. CEI ordering — bucket zeroed
    ///         before transfer to eliminate reentrancy surface. No-op (no transfer,
    ///         no emit) if the bucket is empty so off-chain pollers don't burn gas.
    ///
    ///         Authorization: a tournament that does not exist has devAddr == 0,
    ///         which never matches msg.sender (callers cannot have address(0) as
    ///         their own address), so the check also covers TournamentNotFound.
    /// @param  id  Tournament identifier whose dev fees should be withdrawn.
    function withdrawFeesToDev(bytes32 id) external nonReentrant {
        address dev = _tournaments[id].devAddr;
        if (msg.sender != dev) revert OnlyDev();
        uint256 amount = feeCollected_dev[id];
        if (amount == 0) return;
        feeCollected_dev[id] = 0;
        USDC.safeTransfer(dev, amount);
        emit DevFeesWithdrawn(id, dev, amount);
    }

    /// @notice Withdraw the platform share of entry fees for `id` to the contract
    ///         owner. Only callable by the owner.
    /// @dev    Draws strictly from feeCollected_platform[id]; cannot access
    ///         feeCollected_dev or prizePool. CEI ordering — bucket zeroed
    ///         before transfer. Transfers to msg.sender (== owner at auth time);
    ///         no destination parameter so the access-control identity and the
    ///         payout destination cannot diverge.
    /// @param  id  Tournament identifier whose platform fees should be withdrawn.
    function withdrawFeesToPlatform(bytes32 id) external onlyOwner nonReentrant {
        uint256 amount = feeCollected_platform[id];
        if (amount == 0) return;
        feeCollected_platform[id] = 0;
        USDC.safeTransfer(msg.sender, amount);
        emit PlatformFeesWithdrawn(id, msg.sender, amount);
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
