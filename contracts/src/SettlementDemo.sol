// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SettlementDemo
/// @author Simpl3 Inc. (SkillOS)
/// @notice Faz 0 Pitch-MVP — a STANDALONE, demo-grade optimistic-challenge
///         settlement loop for a single game (2048), proving the B-minimal rung
///         of the SkillOS verification thesis end to end.
///
/// @dev Honest label this earns: *"economically-secured optimistic,
///      deterministic-auditable."* NOT "cryptographically trustless." The trust
///      property is the optimistic-rollup one: a result is *claimed*, not blindly
///      trusted and not re-executed on-chain; anyone may challenge within a
///      window, and a resolver re-runs the public, deterministic Δ6 engine on the
///      public, committed seed to adjudicate. Auditability is the lever —
///      anyone can re-run the public Delta-6 engine's `verify(seed, inputLog)` on the
///      on-chain-revealed seed + the anchored inputLog and confirm the verdict.
///
/// Derived from:
///   - Settlement & Verification SPEC §3 (optimistic + challenge, locked keystone)
///   - Settlement & Verification SPEC §4 seam #2 (commit-reveal equalized seed)
///   - Challenge & Dispute Economics SPEC §1–2 (one bond accounting; replay family
///     = objective + light; winner takes the pot). Protocol cut / burn are
///     settable params in the real layer — OMITTED here by design ("clean by
///     construction": no fee plumbing, no DEV_BPS/PLATFORM_BPS split).
///
/// Scope guardrails (do NOT creep): this is NOT the v2.3 production settle, does
/// NOT modify ChallengeEscrow or TournamentPool, has NO arena 8-dim Δ1 config,
/// NO DevAttributionNFT, and is NOT the A-rung (on-chain re-execution). Bond asset
/// is native test ETH for demo simplicity.
///
/// @dev The audit-#1 reversal demonstrated here: a committed seed is *read* and
///      *load-bearing* at three points (reveal, claim, resolve) — the production
///      contract's `seedCommit` is stored-but-never-read; this demo reads it.
contract SettlementDemo is Ownable, ReentrancyGuard {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error ArenaExists();
    error ArenaNotFound();
    error ArenaNotOpen();
    error SeedAlreadyRevealed();
    error BadSeedReveal();
    error SeedRefMismatch();
    error ClaimExists();
    error BadBond();
    error NotInClaimState();
    error NotChallenged();
    error WindowClosed();
    error WindowOpen();
    error NotResolver();
    error BadConfig();
    error ZeroAddress();
    error TransferFailed();

    // ─── Types ───────────────────────────────────────────────────────────────

    /// @dev None → never created; Committed → seedCommit set, seed hidden;
    ///      Open → seed revealed, claims accepted.
    enum ArenaState {
        None,
        Committed,
        Open
    }

    /// @dev Claimed → in challenge window; Challenged → awaiting resolve;
    ///      Finalized → unchallenged + credited; ResolvedHonest/ResolvedFraud →
    ///      adjudicated terminal states.
    enum ClaimState {
        None,
        Claimed,
        Challenged,
        Finalized,
        ResolvedHonest,
        ResolvedFraud
    }

    struct Arena {
        bytes32 seedCommit; // commit = keccak256(bytes(seed)), set at creation (seam #2)
        string seed; // revealed at start; "" until Open
        ArenaState state;
        uint64 challengeWindow; // seconds added to claim time → deadline
        uint256 claimBond; // exact wei a claimer must post
        uint256 challengerBond; // exact wei a challenger must post
    }

    struct Claim {
        bytes32 arenaId;
        address claimer;
        uint256 score; // the claimed (asserted) score
        bytes32 seedRef; // MUST equal arena.seedCommit (bound at claim time)
        bytes32 inputLogHash; // off-chain inputLog anchor (T2 evidence)
        uint256 claimBond;
        uint256 challengerBond; // 0 until challenged
        address challenger; // address(0) until challenged
        uint64 deadline; // claim time + challengeWindow
        ClaimState state;
        uint256 creditedScore; // engine-authoritative score once credited
    }

    // ─── State ───────────────────────────────────────────────────────────────

    /// @notice The off-chain replay role. Re-runs the public Δ6 engine and posts
    ///         the replayed score via `resolve`. Distinct from the deployer/owner
    ///         (Stage 3 asserts deployer != resolver).
    address public resolver;

    mapping(bytes32 => Arena) public arenas;
    mapping(bytes32 => Claim) public claims;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ArenaCreated(
        bytes32 indexed arenaId, bytes32 seedCommit, uint64 challengeWindow, uint256 claimBond, uint256 challengerBond
    );
    event SeedRevealed(bytes32 indexed arenaId, string seed);
    event ClaimSubmitted(
        bytes32 indexed claimId,
        bytes32 indexed arenaId,
        address indexed claimer,
        uint256 score,
        bytes32 inputLogHash,
        uint64 deadline
    );
    event ClaimChallenged(bytes32 indexed claimId, address indexed challenger);
    event ClaimResolved(
        bytes32 indexed claimId,
        bool fraud,
        uint256 replayedScore,
        uint256 claimedScore,
        address slashed,
        address rewarded,
        uint256 pot
    );
    event ClaimFinalized(bytes32 indexed claimId, uint256 creditedScore);
    event ScoreCredited(bytes32 indexed arenaId, address indexed claimer, uint256 score);
    event ResolverUpdated(address indexed newResolver);

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(address _resolver) Ownable(msg.sender) {
        if (_resolver == address(0)) revert ZeroAddress();
        resolver = _resolver;
    }

    // ─── Arena lifecycle ─────────────────────────────────────────────────────

    /// @notice Set up an arena with the seed COMMITMENT (seam #2). The seed
    ///         itself stays hidden until `revealSeed`, preventing pre-computation.
    /// @param  arenaId         Unique arena id (client-generated bytes32).
    /// @param  seedCommit      keccak256(bytes(seed)) — the on-chain commitment.
    /// @param  challengeWindow Seconds a claim stays disputable after submission.
    /// @param  claimBond       Exact wei a claimer must post.
    /// @param  challengerBond  Exact wei a challenger must post.
    function createArena(
        bytes32 arenaId,
        bytes32 seedCommit,
        uint64 challengeWindow,
        uint256 claimBond,
        uint256 challengerBond
    ) external onlyOwner {
        if (arenas[arenaId].state != ArenaState.None) revert ArenaExists();
        if (challengeWindow == 0) revert BadConfig();

        arenas[arenaId] = Arena({
            seedCommit: seedCommit,
            seed: "",
            state: ArenaState.Committed,
            challengeWindow: challengeWindow,
            claimBond: claimBond,
            challengerBond: challengerBond
        });

        emit ArenaCreated(arenaId, seedCommit, challengeWindow, claimBond, challengerBond);
    }

    /// @notice Reveal the seed at start. READS seedCommit (#1): the reveal MUST
    ///         hash to the committed value, or it is rejected. Publishing the seed
    ///         on-chain is what makes the result deterministically auditable —
    ///         anyone can re-run the public engine on it.
    function revealSeed(bytes32 arenaId, string calldata seed) external onlyOwner {
        Arena storage a = arenas[arenaId];
        if (a.state == ArenaState.None) revert ArenaNotFound();
        if (a.state == ArenaState.Open) revert SeedAlreadyRevealed();
        if (keccak256(bytes(seed)) != a.seedCommit) revert BadSeedReveal();

        a.seed = seed;
        a.state = ArenaState.Open;

        emit SeedRevealed(arenaId, seed);
    }

    // ─── Claim → challenge → resolve / finalize ────────────────────────────────

    /// @notice Submit a score claim, posting the claimer bond and opening the
    ///         challenge window. READS seedCommit (#2): the claim is bound to the
    ///         committed seed (`seedRef == arena.seedCommit`).
    /// @param  claimId       Unique claim id (client-generated bytes32).
    /// @param  arenaId       Arena being claimed against (must be Open).
    /// @param  score         The asserted score (NOT trusted — replay-checkable).
    /// @param  seedRef       Must equal the arena's seedCommit.
    /// @param  inputLogHash  Hash anchoring the off-chain inputLog (fraud-proof input).
    function submitClaim(bytes32 claimId, bytes32 arenaId, uint256 score, bytes32 seedRef, bytes32 inputLogHash)
        external
        payable
        nonReentrant
    {
        Arena storage a = arenas[arenaId];
        if (a.state != ArenaState.Open) revert ArenaNotOpen();
        if (claims[claimId].state != ClaimState.None) revert ClaimExists();
        if (seedRef != a.seedCommit) revert SeedRefMismatch();
        if (msg.value != a.claimBond) revert BadBond();

        uint64 deadline = uint64(block.timestamp) + a.challengeWindow;

        claims[claimId] = Claim({
            arenaId: arenaId,
            claimer: msg.sender,
            score: score,
            seedRef: seedRef,
            inputLogHash: inputLogHash,
            claimBond: msg.value,
            challengerBond: 0,
            challenger: address(0),
            deadline: deadline,
            state: ClaimState.Claimed,
            creditedScore: 0
        });

        emit ClaimSubmitted(claimId, arenaId, msg.sender, score, inputLogHash, deadline);
    }

    /// @notice Dispute a claim within its window, posting the challenger bond.
    function challenge(bytes32 claimId) external payable nonReentrant {
        Claim storage c = claims[claimId];
        if (c.state != ClaimState.Claimed) revert NotInClaimState();
        if (block.timestamp > c.deadline) revert WindowClosed();
        if (msg.value != arenas[c.arenaId].challengerBond) revert BadBond();

        c.challenger = msg.sender;
        c.challengerBond = msg.value;
        c.state = ClaimState.Challenged;

        emit ClaimChallenged(claimId, msg.sender);
    }

    /// @notice Resolve a challenged claim. Resolver-gated: the off-chain resolver
    ///         re-ran the public Δ6 engine `verify(seed, inputLog)` and posts the
    ///         resulting `replayedScore`.
    ///
    ///         READS seedCommit (#3 — the audit-#1 reversal): `keccak256(replaySeed)
    ///         == arena.seedCommit` is enforced, so even the resolver cannot
    ///         adjudicate against any seed other than the committed one.
    ///
    ///         Slashes the wrong side (Economics SPEC §1, winner takes the pot):
    ///           - replayedScore != claimed  ⇒ FRAUD: claimer bond → challenger.
    ///           - replayedScore == claimed  ⇒ honest claim: challenger bond → claimer,
    ///                                          score credited.
    /// @param  claimId       The challenged claim.
    /// @param  replaySeed    The seed the resolver replayed against (must be committed).
    /// @param  replayedScore The engine-authoritative score from re-execution.
    function resolve(bytes32 claimId, string calldata replaySeed, uint256 replayedScore)
        external
        onlyResolver
        nonReentrant
    {
        Claim storage c = claims[claimId];
        if (c.state != ClaimState.Challenged) revert NotChallenged();
        if (keccak256(bytes(replaySeed)) != arenas[c.arenaId].seedCommit) revert SeedRefMismatch();

        uint256 pot = c.claimBond + c.challengerBond;
        bool fraud = replayedScore != c.score;

        address slashed;
        address rewarded;

        if (fraud) {
            // Effects before interaction (CEI).
            c.state = ClaimState.ResolvedFraud;
            c.creditedScore = 0;
            slashed = c.claimer;
            rewarded = c.challenger;
            emit ClaimResolved(claimId, true, replayedScore, c.score, slashed, rewarded, pot);
            _send(c.challenger, pot);
        } else {
            c.state = ClaimState.ResolvedHonest;
            c.creditedScore = replayedScore; // == c.score
            slashed = c.challenger;
            rewarded = c.claimer;
            emit ClaimResolved(claimId, false, replayedScore, c.score, slashed, rewarded, pot);
            emit ScoreCredited(c.arenaId, c.claimer, replayedScore);
            _send(c.claimer, pot);
        }
    }

    /// @notice Finalize an unchallenged claim once its window has elapsed: the
    ///         score is credited and the claimer bond is returned.
    function finalize(bytes32 claimId) external nonReentrant {
        Claim storage c = claims[claimId];
        if (c.state != ClaimState.Claimed) revert NotInClaimState();
        if (block.timestamp <= c.deadline) revert WindowOpen();

        c.state = ClaimState.Finalized;
        c.creditedScore = c.score;

        emit ClaimFinalized(claimId, c.score);
        emit ScoreCredited(c.arenaId, c.claimer, c.score);

        _send(c.claimer, c.claimBond);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Update the resolver role.
    function setResolver(address newResolver) external onlyOwner {
        if (newResolver == address(0)) revert ZeroAddress();
        resolver = newResolver;
        emit ResolverUpdated(newResolver);
    }

    // ─── Views ─────────────────────────────────────────────────────────────────

    function getArena(bytes32 arenaId) external view returns (Arena memory) {
        return arenas[arenaId];
    }

    function getClaim(bytes32 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
