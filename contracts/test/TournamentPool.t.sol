// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TournamentPool} from "../src/TournamentPool.sol";
import {DevAttributionNFT} from "../src/DevAttributionNFT.sol";
import {MaliciousMockDevNFT} from "./mocks/MaliciousMockDevNFT.sol";
import {MaliciousReentrantDev} from "./mocks/MaliciousReentrantDev.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// ─── Mock USDC ─────────────────────────────────────────────────────────────────

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

contract TournamentPoolTest is Test {
    // ── Actors
    uint256 internal signerPk = 0xdeadbeef1234;
    address internal trustedSigner;
    address internal sponsor = address(0x5907503);
    address internal outsider = address(0xBAD);
    /// @dev Default developer attribution address used by the _createTournament helper
    ///      so existing tests can opt out of caring about devAddr semantics.
    address internal constant DEFAULT_DEV = address(0xDE7de7de7De7dE7de7De7De7DE7De7De7dE7dE7D);
    address[] internal players;

    // ── Contracts
    MockUSDC internal usdc;
    TournamentPool internal pool;
    DevAttributionNFT internal devNFT;

    // ── Constants
    uint256 internal constant PRIZE_POOL = 10_000_000; // 10 USDC (6 decimals)
    uint256 internal constant PARTICIPATION_BONUS = 50; // 2048 default
    bytes32 internal constant GAME = keccak256("2048");
    uint64 internal STARTS_AT;
    uint64 internal ENDS_AT;

    // ─── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        trustedSigner = vm.addr(signerPk);

        usdc = new MockUSDC();

        // Predict TournamentPool's deployment address so DevAttributionNFT can
        // pin its `tournamentPool` immutable to the future pool's address. The
        // pool's constructor then takes the NFT address; assertion at the bottom
        // proves the prediction held.
        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        devNFT = new DevAttributionNFT(predictedPool);
        pool = new TournamentPool(IERC20(address(usdc)), trustedSigner, address(devNFT));
        require(address(pool) == predictedPool, "test setup: pool address mismatch");

        // Fund & approve sponsor.
        usdc.mint(sponsor, 1_000_000_000); // 1000 USDC
        vm.prank(sponsor);
        usdc.approve(address(pool), type(uint256).max);

        // Create a roster of 20 deterministic players; tests pick from this.
        for (uint160 i = 1; i <= 20; ++i) {
            players.push(address(uint160(0x1000 + i)));
        }

        STARTS_AT = uint64(block.timestamp);
        ENDS_AT = uint64(block.timestamp + 1 days);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function _tournamentId(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("tournament", seed));
    }

    function _createTournament(bytes32 id) internal {
        _createTournamentWithDev(id, DEFAULT_DEV);
    }

    function _createTournamentWithDev(bytes32 id, address devAddr) internal {
        vm.prank(sponsor);
        pool.createTournament(
            id, devAddr, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    function _signSubmit(bytes32 id, address player, uint256 score, uint256 matchCountDelta, bytes32 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = keccak256(abi.encode(id, player, score, matchCountDelta, nonce, address(pool), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _submit(bytes32 id, address player, uint256 score, uint256 matchCountDelta, uint256 nonceSeed) internal {
        bytes32 nonce = keccak256(abi.encodePacked(id, player, nonceSeed));
        bytes memory sig = _signSubmit(id, player, score, matchCountDelta, nonce);
        pool.submitScore(id, player, score, matchCountDelta, nonce, sig);
    }

    function _effective(uint256 best, uint256 mc) internal pure returns (uint256) {
        return best * 85 + mc * PARTICIPATION_BONUS * 15;
    }

    /// Submit N distinct players with descending scores so the canonical ranking
    /// is players[0] > players[1] > ... > players[N-1]. Match count = 1 each.
    function _seedDescendingScores(bytes32 id, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            _submit(id, players[i], 1000 * (n - i), 1, i);
        }
    }

    function _rankingSlice(uint256 n) internal view returns (address[] memory) {
        address[] memory r = new address[](n);
        for (uint256 i; i < n; ++i) {
            r[i] = players[i];
        }
        return r;
    }

    // ─── createTournament ──────────────────────────────────────────────────────

    function test_createTournament_success() public {
        bytes32 id = _tournamentId(1);
        uint256 sponsorBefore = usdc.balanceOf(sponsor);

        _createTournament(id);

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.sponsor, sponsor, "sponsor");
        assertEq(t.devAddr, DEFAULT_DEV, "devAddr");
        assertEq(t.game, GAME, "game");
        assertEq(uint8(t.cycleType), uint8(TournamentPool.CycleType.Daily), "cycle");
        assertEq(t.startsAt, STARTS_AT, "startsAt");
        assertEq(t.endsAt, ENDS_AT, "endsAt");
        assertEq(t.prizePool, PRIZE_POOL, "prizePool");
        assertEq(t.participationBonus, PARTICIPATION_BONUS, "bonus");
        assertFalse(t.settled, "settled");
        assertEq(usdc.balanceOf(sponsor), sponsorBefore - PRIZE_POOL, "sponsor balance");
        assertEq(usdc.balanceOf(address(pool)), PRIZE_POOL, "pool balance");
    }

    function test_createTournament_revert_duplicate() public {
        bytes32 id = _tournamentId(2);
        _createTournament(id);
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.TournamentAlreadyExists.selector);
        pool.createTournament(
            id, DEFAULT_DEV, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    function test_createTournament_revert_invalidWindow() public {
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.InvalidWindow.selector);
        pool.createTournament(
            _tournamentId(3),
            DEFAULT_DEV,
            GAME,
            TournamentPool.CycleType.Daily,
            ENDS_AT,
            STARTS_AT,
            PRIZE_POOL,
            PARTICIPATION_BONUS
        );
    }

    function test_createTournament_revert_zeroPrize() public {
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.ZeroPrize.selector);
        pool.createTournament(
            _tournamentId(4),
            DEFAULT_DEV,
            GAME,
            TournamentPool.CycleType.Daily,
            STARTS_AT,
            ENDS_AT,
            0,
            PARTICIPATION_BONUS
        );
    }

    /// @notice v2.2: createTournament records developer attribution address; immutable.
    function test_createTournament_storesDevAddr() public {
        bytes32 id = _tournamentId(5);
        address dev = address(0xc0dE0dEdDEdDedDEDdEdDEDDeDdEddedDeddeDde);

        _createTournamentWithDev(id, dev);

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.devAddr, dev, "devAddr stored on tournament");
    }

    function test_createTournament_revert_zeroDevAddr() public {
        bytes32 id = _tournamentId(6);
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.ZeroAddress.selector);
        pool.createTournament(
            id, address(0), GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    // ─── submitScore ───────────────────────────────────────────────────────────

    function test_submitScore_success_newPlayer() public {
        bytes32 id = _tournamentId(10);
        _createTournament(id);

        _submit(id, players[0], 500, 1, 0);

        assertTrue(pool.isParticipant(id, players[0]));
        assertEq(pool.bestScore(id, players[0]), 500);
        assertEq(pool.matchCount(id, players[0]), 1);
        assertEq(pool.participantCount(id), 1);
        assertEq(pool.effectiveScoreOf(id, players[0]), _effective(500, 1));
    }

    function test_submitScore_keepsBestScore() public {
        bytes32 id = _tournamentId(11);
        _createTournament(id);

        _submit(id, players[0], 500, 1, 0);
        _submit(id, players[0], 200, 1, 1); // lower — should not overwrite best
        _submit(id, players[0], 800, 1, 2); // higher — overwrites
        _submit(id, players[0], 600, 1, 3); // lower again

        assertEq(pool.bestScore(id, players[0]), 800, "keeps highest");
        assertEq(pool.matchCount(id, players[0]), 4, "accumulates matches");
        assertEq(pool.participantCount(id), 1, "one unique participant");
    }

    function test_submitScore_revert_badSignature() public {
        bytes32 id = _tournamentId(12);
        _createTournament(id);

        bytes32 nonce = keccak256("n");
        // Sign with wrong key.
        bytes32 digest =
            keccak256(abi.encode(id, players[0], uint256(100), uint256(1), nonce, address(pool), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD00D, ethDigest);
        bytes memory wrongSig = abi.encodePacked(r, s, v);

        vm.expectRevert(TournamentPool.BadSignature.selector);
        pool.submitScore(id, players[0], 100, 1, nonce, wrongSig);
    }

    function test_submitScore_revert_replayNonce() public {
        bytes32 id = _tournamentId(13);
        _createTournament(id);

        bytes32 nonce = keccak256("replay");
        bytes memory sig = _signSubmit(id, players[0], 100, 1, nonce);
        pool.submitScore(id, players[0], 100, 1, nonce, sig);

        vm.expectRevert(TournamentPool.NonceUsed.selector);
        pool.submitScore(id, players[0], 100, 1, nonce, sig);
    }

    function test_submitScore_revert_notStarted() public {
        bytes32 id = _tournamentId(14);
        vm.prank(sponsor);
        pool.createTournament(
            id,
            DEFAULT_DEV,
            GAME,
            TournamentPool.CycleType.Daily,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 1 days),
            PRIZE_POOL,
            PARTICIPATION_BONUS
        );

        bytes32 nonce = keccak256("ns");
        bytes memory sig = _signSubmit(id, players[0], 100, 1, nonce);
        vm.expectRevert(TournamentPool.TournamentNotStarted.selector);
        pool.submitScore(id, players[0], 100, 1, nonce, sig);
    }

    function test_submitScore_revert_afterEnd() public {
        bytes32 id = _tournamentId(15);
        _createTournament(id);

        vm.warp(ENDS_AT + 1);

        bytes32 nonce = keccak256("late");
        bytes memory sig = _signSubmit(id, players[0], 100, 1, nonce);
        vm.expectRevert(TournamentPool.TournamentAlreadyEnded.selector);
        pool.submitScore(id, players[0], 100, 1, nonce, sig);
    }

    function test_submitScore_revert_notFound() public {
        bytes32 id = _tournamentId(999);
        bytes32 nonce = keccak256("ghost");
        bytes memory sig = _signSubmit(id, players[0], 100, 1, nonce);
        vm.expectRevert(TournamentPool.TournamentNotFound.selector);
        pool.submitScore(id, players[0], 100, 1, nonce, sig);
    }

    // ─── flagScore ─────────────────────────────────────────────────────────────

    function test_flagScore_success() public {
        bytes32 id = _tournamentId(20);
        _createTournament(id);
        _submit(id, players[0], 500, 1, 0);

        pool.flagScore(id, players[0]);

        assertTrue(pool.excluded(id, players[0]));
        assertEq(pool.effectiveScoreOf(id, players[0]), 0, "excluded scores as 0");
    }

    function test_flagScore_revert_notOwner() public {
        bytes32 id = _tournamentId(21);
        _createTournament(id);
        _submit(id, players[0], 500, 1, 0);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        pool.flagScore(id, players[0]);
    }

    function test_flagScore_revert_notParticipant() public {
        bytes32 id = _tournamentId(22);
        _createTournament(id);

        vm.expectRevert(TournamentPool.PlayerNotInTournament.selector);
        pool.flagScore(id, players[0]);
    }

    function test_flagScore_revert_afterSettle() public {
        bytes32 id = _tournamentId(23);
        _createTournament(id);
        _seedDescendingScores(id, 4);

        vm.warp(ENDS_AT + 1);
        pool.settle(id, _rankingSlice(4));

        vm.expectRevert(TournamentPool.TournamentAlreadySettled.selector);
        pool.flagScore(id, players[0]);
    }

    // ─── settle (happy path — 10 participants) ────────────────────────────────

    function test_settle_tenParticipants_distribution() public {
        bytes32 id = _tournamentId(30);
        _createTournament(id);
        _seedDescendingScores(id, 10);

        vm.warp(ENDS_AT + 1);

        // Track balances pre-settle so we can assert payouts.
        uint256[] memory before_ = new uint256[](10);
        for (uint256 i; i < 10; ++i) {
            before_[i] = usdc.balanceOf(players[i]);
        }
        uint256 sponsorBefore = usdc.balanceOf(sponsor);

        pool.settle(id, _rankingSlice(10));

        // topN = 5; places 1/2/3 get 25/15/10%; places 4,5 get 5% each. Total 60%.
        uint256 p1 = (PRIZE_POOL * 2500) / 10000;
        uint256 p2 = (PRIZE_POOL * 1500) / 10000;
        uint256 p3 = (PRIZE_POOL * 1000) / 10000;
        uint256 p45 = (PRIZE_POOL * 500) / 10000;

        assertEq(usdc.balanceOf(players[0]) - before_[0], p1, "place 1");
        assertEq(usdc.balanceOf(players[1]) - before_[1], p2, "place 2");
        assertEq(usdc.balanceOf(players[2]) - before_[2], p3, "place 3");
        assertEq(usdc.balanceOf(players[3]) - before_[3], p45, "place 4");
        assertEq(usdc.balanceOf(players[4]) - before_[4], p45, "place 5");
        for (uint256 i = 5; i < 10; ++i) {
            assertEq(usdc.balanceOf(players[i]) - before_[i], 0, "places 6-10 nothing");
        }

        // Sponsor receives the 40% leftover.
        uint256 distributed = p1 + p2 + p3 + 2 * p45;
        uint256 expectedRefund = PRIZE_POOL - distributed;
        assertEq(usdc.balanceOf(sponsor) - sponsorBefore, expectedRefund, "leftover refund");
        assertEq(usdc.balanceOf(address(pool)), 0, "pool drained");

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertTrue(t.settled);
    }

    function test_settle_degenerate_threePlayers_winnerTakesAll() public {
        bytes32 id = _tournamentId(31);
        _createTournament(id);
        _seedDescendingScores(id, 3);

        vm.warp(ENDS_AT + 1);
        uint256 winnerBefore = usdc.balanceOf(players[0]);

        pool.settle(id, _rankingSlice(3));

        assertEq(usdc.balanceOf(players[0]) - winnerBefore, PRIZE_POOL, "winner takes all");
        assertEq(usdc.balanceOf(players[1]), 0);
        assertEq(usdc.balanceOf(players[2]), 0);
        assertEq(usdc.balanceOf(address(pool)), 0, "pool drained");
    }

    function test_settle_degenerate_onePlayer() public {
        bytes32 id = _tournamentId(32);
        _createTournament(id);
        _submit(id, players[0], 1000, 1, 0);

        vm.warp(ENDS_AT + 1);

        address[] memory r = new address[](1);
        r[0] = players[0];
        pool.settle(id, r);

        assertEq(usdc.balanceOf(players[0]), PRIZE_POOL);
    }

    function test_settle_noParticipants_fullRefund() public {
        bytes32 id = _tournamentId(33);
        _createTournament(id);

        vm.warp(ENDS_AT + 1);
        uint256 sponsorBefore = usdc.balanceOf(sponsor);

        pool.settle(id, new address[](0));

        assertEq(usdc.balanceOf(sponsor) - sponsorBefore, PRIZE_POOL, "full refund");
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    function test_settle_twentyParticipants_tierCoverage() public {
        bytes32 id = _tournamentId(34);
        _createTournament(id);
        _seedDescendingScores(id, 20);

        vm.warp(ENDS_AT + 1);
        uint256 sponsorBefore = usdc.balanceOf(sponsor);

        pool.settle(id, _rankingSlice(20));

        // topN = 10 → 25+15+10+(7*5)% = 85% distributed; 15% tier5-pool unspent (refund).
        uint256 p1 = (PRIZE_POOL * 2500) / 10000;
        uint256 p2 = (PRIZE_POOL * 1500) / 10000;
        uint256 p3 = (PRIZE_POOL * 1000) / 10000;
        uint256 p45 = (PRIZE_POOL * 500) / 10000;

        assertEq(usdc.balanceOf(players[0]), p1);
        assertEq(usdc.balanceOf(players[1]), p2);
        assertEq(usdc.balanceOf(players[2]), p3);
        for (uint256 i = 3; i < 10; ++i) {
            assertEq(usdc.balanceOf(players[i]), p45, "places 4-10");
        }
        for (uint256 i = 10; i < 20; ++i) {
            assertEq(usdc.balanceOf(players[i]), 0, "places 11-20 nothing");
        }
        uint256 distributed = p1 + p2 + p3 + 7 * p45;
        assertEq(usdc.balanceOf(sponsor) - sponsorBefore, PRIZE_POOL - distributed);
    }

    /// Exercises tier 5 (places 11..topN) with N that makes topN > 10.
    function test_settle_largeN_tier5Split() public {
        bytes32 id = _tournamentId(35);
        // Need 30 players for topN = 15 (5 tier5 winners). Extend roster.
        for (uint160 i = 21; i <= 30; ++i) {
            players.push(address(uint160(0x1000 + i)));
        }

        _createTournament(id);
        _seedDescendingScores(id, 30);

        vm.warp(ENDS_AT + 1);

        pool.settle(id, _rankingSlice(30));

        // topN = 15. Tier5 = places 11..15 = 5 winners. Pool = 15% / 5 = 3% each.
        uint256 expectedTier5Each = ((PRIZE_POOL * 1500) / 10000) / 5;
        for (uint256 i = 10; i < 15; ++i) {
            assertEq(usdc.balanceOf(players[i]), expectedTier5Each, "tier5 share");
        }
        for (uint256 i = 15; i < 30; ++i) {
            assertEq(usdc.balanceOf(players[i]), 0, "outside topN");
        }
    }

    // ─── settle — validation / revert paths ───────────────────────────────────

    function test_settle_revert_beforeEnd() public {
        bytes32 id = _tournamentId(40);
        _createTournament(id);
        _seedDescendingScores(id, 4);

        vm.expectRevert(TournamentPool.TournamentNotEnded.selector);
        pool.settle(id, _rankingSlice(4));
    }

    function test_settle_revert_alreadySettled() public {
        bytes32 id = _tournamentId(41);
        _createTournament(id);
        _seedDescendingScores(id, 4);
        vm.warp(ENDS_AT + 1);
        pool.settle(id, _rankingSlice(4));

        vm.expectRevert(TournamentPool.TournamentAlreadySettled.selector);
        pool.settle(id, _rankingSlice(4));
    }

    function test_settle_revert_wrongLength() public {
        bytes32 id = _tournamentId(42);
        _createTournament(id);
        _seedDescendingScores(id, 5);
        vm.warp(ENDS_AT + 1);

        vm.expectRevert(TournamentPool.InvalidRankingLength.selector);
        pool.settle(id, _rankingSlice(4)); // missing one player
    }

    function test_settle_revert_wrongOrder() public {
        bytes32 id = _tournamentId(43);
        _createTournament(id);
        _seedDescendingScores(id, 5);
        vm.warp(ENDS_AT + 1);

        address[] memory r = _rankingSlice(5);
        // swap places 0 and 1 (higher before lower becomes lower before higher)
        (r[0], r[1]) = (r[1], r[0]);

        vm.expectRevert(TournamentPool.InvalidRankingOrder.selector);
        pool.settle(id, r);
    }

    function test_settle_revert_nonParticipantIncluded() public {
        bytes32 id = _tournamentId(44);
        _createTournament(id);
        _seedDescendingScores(id, 4);
        vm.warp(ENDS_AT + 1);

        address[] memory r = _rankingSlice(4);
        r[3] = outsider; // outsider never submitted

        vm.expectRevert(TournamentPool.NotParticipant.selector);
        pool.settle(id, r);
    }

    function test_settle_revert_excludedIncluded() public {
        bytes32 id = _tournamentId(45);
        _createTournament(id);
        _seedDescendingScores(id, 4);
        pool.flagScore(id, players[3]);
        vm.warp(ENDS_AT + 1);

        // Flagged player still present in ranking — wrong length check fires first.
        address[] memory r = _rankingSlice(4);
        vm.expectRevert(TournamentPool.InvalidRankingLength.selector);
        pool.settle(id, r);

        // Now make length right but include flagged player instead of a valid one.
        address[] memory r2 = new address[](3);
        r2[0] = players[0];
        r2[1] = players[1];
        r2[2] = players[3]; // excluded
        vm.expectRevert(TournamentPool.PlayerExcluded.selector);
        pool.settle(id, r2);
    }

    function test_settle_revert_duplicateInRanking() public {
        bytes32 id = _tournamentId(46);
        _createTournament(id);
        _seedDescendingScores(id, 4);
        vm.warp(ENDS_AT + 1);

        address[] memory r = new address[](4);
        r[0] = players[0];
        r[1] = players[0]; // dup — same effective score so order check passes
        r[2] = players[1];
        r[3] = players[2];

        vm.expectRevert(TournamentPool.DuplicateInRanking.selector);
        pool.settle(id, r);
    }

    // ─── settle — exclusion semantics ─────────────────────────────────────────

    function test_settle_excludedPlayerGetsNoPrize() public {
        bytes32 id = _tournamentId(50);
        _createTournament(id);
        // players[0] would win outright with highest score, but gets flagged.
        _submit(id, players[0], 10_000, 1, 0);
        _submit(id, players[1], 5_000, 1, 1);
        _submit(id, players[2], 3_000, 1, 2);
        _submit(id, players[3], 1_000, 1, 3);

        pool.flagScore(id, players[0]);

        vm.warp(ENDS_AT + 1);

        // Non-excluded ranking (3 players) — falls below degenerate threshold.
        address[] memory r = new address[](3);
        r[0] = players[1];
        r[1] = players[2];
        r[2] = players[3];

        pool.settle(id, r);

        assertEq(usdc.balanceOf(players[0]), 0, "flagged player gets nothing");
        assertEq(usdc.balanceOf(players[1]), PRIZE_POOL, "new top takes all (degenerate)");
    }

    // ─── Ranking math — participation + ties ──────────────────────────────────

    function test_effectiveScore_formulaMatches() public {
        bytes32 id = _tournamentId(60);
        _createTournament(id);
        _submit(id, players[0], 2000, 3, 0);
        // 2000 * 85 + 3 * 50 * 15 = 170000 + 2250 = 172250
        assertEq(pool.effectiveScoreOf(id, players[0]), 172_250);
    }

    function test_settle_ties_callerChoosesOrder() public {
        bytes32 id = _tournamentId(61);
        _createTournament(id);
        // Two players with identical best score + match count → identical effective score.
        _submit(id, players[0], 500, 2, 0);
        _submit(id, players[1], 500, 2, 1);
        _submit(id, players[2], 400, 2, 2);
        _submit(id, players[3], 300, 2, 3);

        vm.warp(ENDS_AT + 1);

        // Either ordering of players[0] vs players[1] is valid.
        address[] memory r = new address[](4);
        r[0] = players[1];
        r[1] = players[0];
        r[2] = players[2];
        r[3] = players[3];

        pool.settle(id, r);
        // topN=2 → 25% + 15% = 40%. The caller put players[1] first, so they get 25%.
        assertEq(usdc.balanceOf(players[1]), (PRIZE_POOL * 2500) / 10000);
        assertEq(usdc.balanceOf(players[0]), (PRIZE_POOL * 1500) / 10000);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function test_setTrustedSigner_ownerOnly() public {
        address newSigner = address(0xFEED);
        pool.setTrustedSigner(newSigner);
        assertEq(pool.trustedSigner(), newSigner);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        pool.setTrustedSigner(newSigner);
    }

    function test_emergencyWithdraw_drainsPool() public {
        bytes32 id = _tournamentId(70);
        _createTournament(id);
        assertEq(usdc.balanceOf(address(pool)), PRIZE_POOL);

        address rescue = address(0xEDD1E);
        pool.emergencyWithdraw(rescue);

        assertEq(usdc.balanceOf(rescue), PRIZE_POOL);
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    // ─── getRanking view ──────────────────────────────────────────────────────

    function test_getRanking_sortsDescending_skipsExcluded() public {
        bytes32 id = _tournamentId(80);
        _createTournament(id);

        // Submit out-of-order scores + exclude the highest.
        _submit(id, players[0], 300, 1, 0);
        _submit(id, players[1], 700, 1, 1);
        _submit(id, players[2], 500, 1, 2);
        pool.flagScore(id, players[1]);

        TournamentPool.RankEntry[] memory r = pool.getRanking(id);
        assertEq(r.length, 2);
        assertEq(r[0].player, players[2]);
        assertEq(r[1].player, players[0]);
        assertGe(r[0].effectiveScore, r[1].effectiveScore);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // V2 SOLO + RETRY FEE SUITE
    // ═══════════════════════════════════════════════════════════════════════════

    // ── V2 helpers

    uint256 internal constant ENTRY_FEE = 1_000_000; // 1 USDC

    // v2.2: locked fee-share constants (mirrored in TournamentPool).
    uint256 internal constant DEV_BPS = 7000;
    uint256 internal constant PLATFORM_BPS = 3000;
    uint256 internal constant TOTAL_BPS = 10_000;

    /// @dev Sum of the two fee buckets — convenience for tests that previously
    ///      read the pre-split `feeCollected(id)` mapping.
    function _totalFees(bytes32 id) internal view returns (uint256) {
        return pool.feeCollected_dev(id) + pool.feeCollected_platform(id);
    }

    /// @dev Deterministic per-test developer attribution sentinel — derived from
    ///      a seed so each PR 3 test gets a unique devAddr without hand-checksumming.
    function _devAddr(uint256 seed) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked("dev", seed)))));
    }

    function _signSoloSubmit(
        bytes32 id,
        address player,
        uint256 score,
        bytes32 soloRunId,
        uint256 matchCountDelta,
        bytes32 nonce
    ) internal view returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encode(id, player, score, soloRunId, matchCountDelta, nonce, address(pool), block.chainid)
        );
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _submitSolo(bytes32 id, address player, uint256 score, uint256 matchCountDelta, uint256 nonceSeed)
        internal
    {
        bytes32 nonce = keccak256(abi.encodePacked("solo", id, player, nonceSeed));
        bytes32 runId = keccak256(abi.encodePacked("run", id, player, nonceSeed));
        bytes memory sig = _signSoloSubmit(id, player, score, runId, matchCountDelta, nonce);
        pool.submitSoloScore(id, player, score, runId, matchCountDelta, nonce, sig);
    }

    function _fundAndApprove(address player, uint256 amount) internal {
        usdc.mint(player, amount);
        vm.prank(player);
        usdc.approve(address(pool), type(uint256).max);
    }

    // ── submitSoloScore

    function test_submitSolo_success_firstIsFree() public {
        bytes32 id = _tournamentId(200);
        _createTournament(id);

        _submitSolo(id, players[0], 500, 1, 0);

        assertTrue(pool.isParticipant(id, players[0]));
        assertEq(pool.bestScore(id, players[0]), 500);
        assertEq(pool.matchCount(id, players[0]), 1);
        assertEq(pool.soloSubmissionCount(id, players[0]), 1);
        assertEq(pool.feePaidByPlayer(id, players[0]), 0, "first solo is free");
        assertEq(_totalFees(id), 0, "no fees yet");
        assertEq(pool.submissionHistoryLength(id, players[0]), 1);

        TournamentPool.Submission memory s = pool.submissionAt(id, players[0], 0);
        assertEq(uint8(s.source), uint8(TournamentPool.SubmissionSource.Solo));
        assertEq(s.score, 500);
    }

    function test_submitSolo_revert_secondWithoutFee() public {
        bytes32 id = _tournamentId(201);
        _createTournament(id);

        _submitSolo(id, players[0], 500, 1, 0);

        // Second solo without prior chargeEntryFee must revert.
        vm.expectRevert(TournamentPool.InsufficientFeePaid.selector);
        _submitSolo(id, players[0], 700, 1, 1);
    }

    function test_submitSolo_success_paidRetryAfterFee() public {
        bytes32 id = _tournamentId(202);
        _createTournament(id);

        _submitSolo(id, players[0], 500, 1, 0);
        _fundAndApprove(players[0], 10 * ENTRY_FEE);

        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);

        // Now the second solo submission is allowed.
        _submitSolo(id, players[0], 700, 1, 1);

        assertEq(pool.soloSubmissionCount(id, players[0]), 2);
        assertEq(pool.bestScore(id, players[0]), 700);
        assertEq(pool.feePaidByPlayer(id, players[0]), ENTRY_FEE);
        assertEq(_totalFees(id), ENTRY_FEE);
    }

    function test_submitSolo_nthSubmissionRequiresNMinus1Fees() public {
        bytes32 id = _tournamentId(203);
        _createTournament(id);
        _fundAndApprove(players[0], 100 * ENTRY_FEE);

        // 1st solo (free).
        _submitSolo(id, players[0], 100, 1, 0);

        // 4th solo requires 3 prior fees.
        for (uint256 i; i < 3; ++i) {
            vm.prank(players[0]);
            pool.chargeEntryFee(id, players[0]);
        }
        _submitSolo(id, players[0], 200, 1, 1); // 2nd
        _submitSolo(id, players[0], 300, 1, 2); // 3rd
        _submitSolo(id, players[0], 400, 1, 3); // 4th

        assertEq(pool.soloSubmissionCount(id, players[0]), 4);
        assertEq(pool.feePaidByPlayer(id, players[0]), 3 * ENTRY_FEE);

        // 5th without a 4th fee must fail.
        vm.expectRevert(TournamentPool.InsufficientFeePaid.selector);
        _submitSolo(id, players[0], 500, 1, 4);

        // After topping up, 5th succeeds.
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);
        _submitSolo(id, players[0], 500, 1, 5);

        assertEq(pool.soloSubmissionCount(id, players[0]), 5);
        assertEq(_totalFees(id), 4 * ENTRY_FEE);
    }

    function test_submitSolo_separatePlayers_independentFeeAccounting() public {
        bytes32 id = _tournamentId(204);
        _createTournament(id);

        _fundAndApprove(players[0], 10 * ENTRY_FEE);

        // Player 0 does two solos (one fee). Player 1 does one solo (free).
        _submitSolo(id, players[0], 500, 1, 0);
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);
        _submitSolo(id, players[0], 700, 1, 1);
        _submitSolo(id, players[1], 900, 1, 2);

        assertEq(pool.feePaidByPlayer(id, players[0]), ENTRY_FEE);
        assertEq(pool.feePaidByPlayer(id, players[1]), 0);
        assertEq(pool.soloSubmissionCount(id, players[0]), 2);
        assertEq(pool.soloSubmissionCount(id, players[1]), 1);
    }

    function test_submitSolo_revert_badSignature() public {
        bytes32 id = _tournamentId(205);
        _createTournament(id);

        bytes32 nonce = keccak256("n");
        bytes32 runId = keccak256("r");
        bytes32 digest =
            keccak256(abi.encode(id, players[0], uint256(100), runId, uint256(1), nonce, address(pool), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD00D, ethDigest);
        bytes memory wrongSig = abi.encodePacked(r, s, v);

        vm.expectRevert(TournamentPool.BadSignature.selector);
        pool.submitSoloScore(id, players[0], 100, runId, 1, nonce, wrongSig);
    }

    function test_submitSolo_revert_replayNonce() public {
        bytes32 id = _tournamentId(206);
        _createTournament(id);

        bytes32 nonce = keccak256("replay-solo");
        bytes32 runId = keccak256("run-s");
        bytes memory sig = _signSoloSubmit(id, players[0], 100, runId, 1, nonce);

        pool.submitSoloScore(id, players[0], 100, runId, 1, nonce, sig);
        vm.expectRevert(TournamentPool.NonceUsed.selector);
        pool.submitSoloScore(id, players[0], 100, runId, 1, nonce, sig);
    }

    function test_submitSolo_nonceSpaceSharedWithSubmitScore() public {
        // A nonce used for submitScore cannot be reused for submitSoloScore.
        bytes32 id = _tournamentId(207);
        _createTournament(id);

        bytes32 nonce = keccak256("shared");
        bytes memory duelSig = _signSubmit(id, players[0], 100, 1, nonce);
        pool.submitScore(id, players[0], 100, 1, nonce, duelSig);

        bytes32 runId = keccak256("run-x");
        bytes memory soloSig = _signSoloSubmit(id, players[0], 200, runId, 1, nonce);
        vm.expectRevert(TournamentPool.NonceUsed.selector);
        pool.submitSoloScore(id, players[0], 200, runId, 1, nonce, soloSig);
    }

    // ── chargeEntryFee

    function test_chargeEntryFee_success() public {
        bytes32 id = _tournamentId(220);
        _createTournament(id);
        _fundAndApprove(players[0], 10 * ENTRY_FEE);

        uint256 playerBefore = usdc.balanceOf(players[0]);
        uint256 poolBefore = usdc.balanceOf(address(pool));

        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);

        assertEq(usdc.balanceOf(players[0]), playerBefore - ENTRY_FEE);
        assertEq(usdc.balanceOf(address(pool)), poolBefore + ENTRY_FEE);
        assertEq(pool.feePaidByPlayer(id, players[0]), ENTRY_FEE);
        // v2.2: ENTRY_FEE is split atomically — 70% to feeCollected_dev, 30% to feeCollected_platform.
        assertEq(pool.feeCollected_dev(id), (ENTRY_FEE * DEV_BPS) / TOTAL_BPS, "dev share");
        assertEq(pool.feeCollected_platform(id), (ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS, "platform share");
        assertEq(_totalFees(id), ENTRY_FEE, "buckets sum to ENTRY_FEE");
    }

    function test_chargeEntryFee_revert_playerMismatch() public {
        bytes32 id = _tournamentId(221);
        _createTournament(id);
        _fundAndApprove(players[0], ENTRY_FEE);

        // Someone else tries to charge fee on behalf of players[0].
        vm.prank(outsider);
        vm.expectRevert(TournamentPool.PlayerMismatch.selector);
        pool.chargeEntryFee(id, players[0]);
    }

    function test_chargeEntryFee_revert_tournamentEnded() public {
        bytes32 id = _tournamentId(222);
        _createTournament(id);
        _fundAndApprove(players[0], ENTRY_FEE);

        vm.warp(ENDS_AT + 1);
        vm.prank(players[0]);
        vm.expectRevert(TournamentPool.TournamentAlreadyEnded.selector);
        pool.chargeEntryFee(id, players[0]);
    }

    function test_chargeEntryFee_revert_tournamentNotFound() public {
        _fundAndApprove(players[0], ENTRY_FEE);
        vm.prank(players[0]);
        vm.expectRevert(TournamentPool.TournamentNotFound.selector);
        pool.chargeEntryFee(_tournamentId(9999), players[0]);
    }

    function test_chargeEntryFee_accumulates() public {
        bytes32 id = _tournamentId(223);
        _createTournament(id);
        _fundAndApprove(players[0], 5 * ENTRY_FEE);

        for (uint256 i; i < 3; ++i) {
            vm.prank(players[0]);
            pool.chargeEntryFee(id, players[0]);
        }

        assertEq(pool.feePaidByPlayer(id, players[0]), 3 * ENTRY_FEE);
        // Both buckets accumulate proportionally to bps.
        assertEq(pool.feeCollected_dev(id), (3 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS);
        assertEq(pool.feeCollected_platform(id), (3 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS);
        assertEq(_totalFees(id), 3 * ENTRY_FEE);
    }

    // ── withdrawFeesToDev / withdrawFeesToPlatform (v2.2 PR 3 — replaces single
    //    withdrawFees; per-share access control routes payouts to the rightful party)

    function test_withdrawFeesToDev_drawsOnlyFromFeeCollectedDev() public {
        // Per spec: dev wallet recovers exactly its 70% bucket; platform bucket and
        // prize pool are untouched. Caller-authenticated transfer (msg.sender == devAddr).
        bytes32 id = _tournamentId(240);
        address dev = _devAddr(1);
        _createTournamentWithDev(id, dev);
        _fundAndApprove(players[0], 3 * ENTRY_FEE);

        vm.startPrank(players[0]);
        pool.chargeEntryFee(id, players[0]);
        pool.chargeEntryFee(id, players[0]);
        vm.stopPrank();

        uint256 expectedDev = (2 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS;
        uint256 expectedPlatform = (2 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;

        uint256 devBefore = usdc.balanceOf(dev);
        uint256 poolBefore = usdc.balanceOf(address(pool)); // prize + 2·fee

        vm.prank(dev);
        pool.withdrawFeesToDev(id);

        assertEq(usdc.balanceOf(dev) - devBefore, expectedDev, "dev gets exactly 70% bucket");
        assertEq(pool.feeCollected_dev(id), 0, "dev bucket drained");
        assertEq(pool.feeCollected_platform(id), expectedPlatform, "platform bucket untouched");
        assertEq(usdc.balanceOf(address(pool)), poolBefore - expectedDev, "pool drops by dev only");
        assertEq(pool.getTournament(id).prizePool, PRIZE_POOL, "prize pool untouched");
    }

    function test_withdrawFeesToPlatform_drawsOnlyFromFeeCollectedPlatform() public {
        // Per spec: platform admin (owner) recovers exactly its 30% bucket; dev
        // bucket and prize pool are untouched.
        bytes32 id = _tournamentId(241);
        address dev = _devAddr(2);
        _createTournamentWithDev(id, dev);
        _fundAndApprove(players[0], 3 * ENTRY_FEE);

        vm.startPrank(players[0]);
        pool.chargeEntryFee(id, players[0]);
        pool.chargeEntryFee(id, players[0]);
        vm.stopPrank();

        uint256 expectedDev = (2 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS;
        uint256 expectedPlatform = (2 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;

        uint256 ownerBefore = usdc.balanceOf(address(this)); // test contract owns the pool
        uint256 poolBefore = usdc.balanceOf(address(pool));

        // address(this) is the deployer / owner — Foundry runs tests from the test contract.
        pool.withdrawFeesToPlatform(id);

        assertEq(usdc.balanceOf(address(this)) - ownerBefore, expectedPlatform, "owner gets 30% bucket");
        assertEq(pool.feeCollected_platform(id), 0, "platform bucket drained");
        assertEq(pool.feeCollected_dev(id), expectedDev, "dev bucket untouched");
        assertEq(usdc.balanceOf(address(pool)), poolBefore - expectedPlatform, "pool drops by platform only");
        assertEq(pool.getTournament(id).prizePool, PRIZE_POOL, "prize pool untouched");
    }

    function test_withdrawFeesToDev_revert_unauthorizedCaller() public {
        // Only the recorded devAddr may pull the dev share. Owner, sponsor, and
        // arbitrary outsiders all revert.
        bytes32 id = _tournamentId(242);
        address dev = _devAddr(3);
        _createTournamentWithDev(id, dev);
        _fundAndApprove(players[0], ENTRY_FEE);
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);

        vm.prank(outsider);
        vm.expectRevert(TournamentPool.OnlyDev.selector);
        pool.withdrawFeesToDev(id);

        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.OnlyDev.selector);
        pool.withdrawFeesToDev(id);

        // Even the owner cannot pull the dev share.
        vm.expectRevert(TournamentPool.OnlyDev.selector);
        pool.withdrawFeesToDev(id);
    }

    function test_withdrawFeesToPlatform_revert_unauthorizedCaller() public {
        // Only owner may call. Dev, sponsor, and outsider all revert with OZ Ownable.
        bytes32 id = _tournamentId(243);
        address dev = _devAddr(4);
        _createTournamentWithDev(id, dev);
        _fundAndApprove(players[0], ENTRY_FEE);
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        pool.withdrawFeesToPlatform(id);

        vm.prank(dev);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, dev));
        pool.withdrawFeesToPlatform(id);
    }

    function test_withdrawFeesToDev_noFees_noop() public {
        // No fees collected: call is a no-op (no transfer, no revert).
        bytes32 id = _tournamentId(244);
        address dev = _devAddr(5);
        _createTournamentWithDev(id, dev);

        uint256 devBefore = usdc.balanceOf(dev);
        vm.prank(dev);
        pool.withdrawFeesToDev(id);
        assertEq(usdc.balanceOf(dev), devBefore, "no transfer on empty bucket");
    }

    function test_withdrawFeesToPlatform_noFees_noop() public {
        bytes32 id = _tournamentId(245);
        _createTournament(id);

        uint256 ownerBefore = usdc.balanceOf(address(this));
        pool.withdrawFeesToPlatform(id);
        assertEq(usdc.balanceOf(address(this)), ownerBefore, "no transfer on empty bucket");
    }

    function test_withdrawFeesToDev_twiceZeros() public {
        // Second call after a successful drain is a no-op (no double-spend).
        bytes32 id = _tournamentId(246);
        address dev = _devAddr(6);
        _createTournamentWithDev(id, dev);
        _fundAndApprove(players[0], ENTRY_FEE);
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);

        vm.prank(dev);
        pool.withdrawFeesToDev(id);
        assertEq(pool.feeCollected_dev(id), 0);

        uint256 devAfterFirst = usdc.balanceOf(dev);
        vm.prank(dev);
        pool.withdrawFeesToDev(id); // no-op second call
        assertEq(usdc.balanceOf(dev), devAfterFirst);
    }

    function test_withdrawFeesToPlatform_twiceZeros() public {
        bytes32 id = _tournamentId(247);
        _createTournament(id);
        _fundAndApprove(players[0], ENTRY_FEE);
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);

        pool.withdrawFeesToPlatform(id);
        assertEq(pool.feeCollected_platform(id), 0);

        uint256 ownerAfterFirst = usdc.balanceOf(address(this));
        pool.withdrawFeesToPlatform(id); // no-op second call
        assertEq(usdc.balanceOf(address(this)), ownerAfterFirst);
    }

    function test_withdrawFeesToDev_revert_tournamentNotFound() public {
        // Calling on a never-created tournament must revert (devAddr is zero, can't
        // be called by msg.sender).
        bytes32 id = _tournamentId(9999);
        vm.expectRevert(TournamentPool.OnlyDev.selector);
        pool.withdrawFeesToDev(id);
    }

    // ── Invariant: entry fees NEVER flow into prize distribution

    function test_invariant_feeBuckets_survive_full_lifecycle() public {
        // Full lifecycle: create → solo submits with retries → settle → verify.
        // Entry fees collected must NOT affect prize distribution and must be
        // split 70/30 across the dev and platform buckets — both invariants
        // checked together for the canonical mixed-flow scenario.
        bytes32 id = _tournamentId(260);
        _createTournament(id);
        _fundAndApprove(players[0], 10 * ENTRY_FEE);

        // 4 solo submissions from players[0] (3 paid retries).
        _submitSolo(id, players[0], 1000, 1, 0);
        for (uint256 i; i < 3; ++i) {
            vm.prank(players[0]);
            pool.chargeEntryFee(id, players[0]);
        }
        _submitSolo(id, players[0], 1500, 1, 1);
        _submitSolo(id, players[0], 2000, 1, 2);
        _submitSolo(id, players[0], 1200, 1, 3);

        // Other players (duel path, via submitScore) for a 4+ N ranking.
        _submit(id, players[1], 800, 1, 10);
        _submit(id, players[2], 600, 1, 11);
        _submit(id, players[3], 400, 1, 12);

        // Per-bucket assertions: 3 entry fees split 70/30.
        assertEq(pool.feeCollected_dev(id), (3 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS, "3 fees -> dev bucket");
        assertEq(pool.feeCollected_platform(id), (3 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS, "3 fees -> platform");
        assertEq(_totalFees(id), 3 * ENTRY_FEE, "buckets sum");
        // Contract balance = prize pool + total fees collected.
        assertEq(usdc.balanceOf(address(pool)), PRIZE_POOL + 3 * ENTRY_FEE);

        vm.warp(ENDS_AT + 1);

        // Ranking by effective score. All players have matchCount either 1 (duel)
        // or 4 (solo with retries), so capping doesn't kick in here (< CAP=10).
        address[] memory ranking = new address[](4);
        ranking[0] = players[0]; // best=2000, mc=4
        ranking[1] = players[1]; // best=800, mc=1
        ranking[2] = players[2]; // best=600, mc=1
        ranking[3] = players[3]; // best=400, mc=1

        uint256 sponsorBefore = usdc.balanceOf(sponsor);
        pool.settle(id, ranking);

        // n=4, topN=ceil(4/2)=2. Contract pays top-3 fixed bps (25+15+10 = 50%);
        // places 4+ skipped because tier4 loop starts at 3 with bound topN=2.
        uint256 distributed = (PRIZE_POOL * (2500 + 1500 + 1000)) / 10_000;
        uint256 expectedRefund = PRIZE_POOL - distributed;
        assertEq(usdc.balanceOf(sponsor) - sponsorBefore, expectedRefund, "sponsor refund");

        // Critical: BOTH fee buckets survive settle untouched.
        assertEq(pool.feeCollected_dev(id), (3 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS, "dev bucket post-settle");
        assertEq(pool.feeCollected_platform(id), (3 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS, "platform post-settle");
        assertEq(_totalFees(id), 3 * ENTRY_FEE, "fees must not be settled");
        assertEq(usdc.balanceOf(address(pool)), 3 * ENTRY_FEE, "only fees remain");

        // After settle, the dev pulls their share via withdrawFeesToDev and the
        // platform admin pulls via withdrawFeesToPlatform — together they drain
        // both buckets. No code path lets either party touch the other's bucket.
        uint256 expectedDev = (3 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS;
        uint256 expectedPlatform = (3 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;

        vm.prank(DEFAULT_DEV);
        pool.withdrawFeesToDev(id);
        assertEq(usdc.balanceOf(DEFAULT_DEV), expectedDev, "dev recovers 70%");
        assertEq(pool.feeCollected_dev(id), 0);

        uint256 ownerBefore = usdc.balanceOf(address(this));
        pool.withdrawFeesToPlatform(id);
        assertEq(usdc.balanceOf(address(this)) - ownerBefore, expectedPlatform, "platform recovers 30%");
        assertEq(pool.feeCollected_platform(id), 0);

        assertEq(usdc.balanceOf(address(pool)), 0, "all fees drained");
    }

    function test_invariant_settle_does_not_touch_feeCollected_anything() public {
        // Pair test: prize pool goes out via settle; both fee buckets untouched.
        bytes32 id = _tournamentId(261);
        _createTournament(id);
        _fundAndApprove(players[0], 5 * ENTRY_FEE);

        _submitSolo(id, players[0], 1000, 1, 0);
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);
        _submitSolo(id, players[0], 1200, 1, 1);

        uint256 devBefore = pool.feeCollected_dev(id);
        uint256 platformBefore = pool.feeCollected_platform(id);

        vm.warp(ENDS_AT + 1);
        address[] memory ranking = new address[](1);
        ranking[0] = players[0];
        pool.settle(id, ranking);

        // Both buckets unchanged after settle — INV1.
        assertEq(pool.feeCollected_dev(id), devBefore, "dev bucket frozen by settle");
        assertEq(pool.feeCollected_platform(id), platformBefore, "platform bucket frozen by settle");
        assertEq(_totalFees(id), ENTRY_FEE);
    }

    function test_invariant_feeCollectedDev_isolated_from_prizePool() public {
        // INV1: settle()'s prize-distribution path must not modify feeCollected_dev,
        // regardless of which curve branch the distribution takes. Scenario uses 4
        // participants (n=4 -> topN=2), exercising the small-N top-3 branch — the
        // isolation property is independent of the curve branch since settle()
        // never reads the fee buckets at all.
        bytes32 id = _tournamentId(262);
        _createTournament(id);
        _fundAndApprove(players[0], 5 * ENTRY_FEE);

        // Pay 5 entry fees from players[0] (one free solo + 5 paid) and submit
        // duel scores from 3 more players to reach the n=4 distribution.
        _submitSolo(id, players[0], 1000, 1, 0);
        for (uint256 i; i < 5; ++i) {
            vm.prank(players[0]);
            pool.chargeEntryFee(id, players[0]);
        }
        for (uint256 i; i < 5; ++i) {
            _submitSolo(id, players[0], 1500 + i, 1, i + 1);
        }
        _submit(id, players[1], 900, 1, 100);
        _submit(id, players[2], 800, 1, 101);
        _submit(id, players[3], 700, 1, 102);

        uint256 expectedDev = (5 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS;
        assertEq(pool.feeCollected_dev(id), expectedDev, "pre-settle dev bucket");

        vm.warp(ENDS_AT + 1);
        address[] memory ranking = new address[](4);
        ranking[0] = players[0];
        ranking[1] = players[1];
        ranking[2] = players[2];
        ranking[3] = players[3];
        pool.settle(id, ranking);

        assertEq(pool.feeCollected_dev(id), expectedDev, "settle did not touch dev bucket");
    }

    function test_invariant_feeCollectedPlatform_isolated_from_prizePool() public {
        // INV1 mirror: settle() must not modify feeCollected_platform. Same n=4
        // small-N distribution as the dev test above; isolation is curve-branch
        // independent because settle() never reads the fee buckets.
        bytes32 id = _tournamentId(263);
        _createTournament(id);
        _fundAndApprove(players[0], 5 * ENTRY_FEE);

        _submitSolo(id, players[0], 1000, 1, 0);
        for (uint256 i; i < 5; ++i) {
            vm.prank(players[0]);
            pool.chargeEntryFee(id, players[0]);
        }
        for (uint256 i; i < 5; ++i) {
            _submitSolo(id, players[0], 1500 + i, 1, i + 1);
        }
        _submit(id, players[1], 900, 1, 100);
        _submit(id, players[2], 800, 1, 101);
        _submit(id, players[3], 700, 1, 102);

        uint256 expectedPlatform = (5 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;
        assertEq(pool.feeCollected_platform(id), expectedPlatform, "pre-settle platform bucket");

        vm.warp(ENDS_AT + 1);
        address[] memory ranking = new address[](4);
        ranking[0] = players[0];
        ranking[1] = players[1];
        ranking[2] = players[2];
        ranking[3] = players[3];
        pool.settle(id, ranking);

        assertEq(pool.feeCollected_platform(id), expectedPlatform, "settle did not touch platform bucket");
    }

    // ── 70/30 atomic split tests

    function test_chargeEntryFee_atomicSplit_70_30() public {
        // Single chargeEntryFee deposits 70% to dev and 30% to platform in one tx.
        bytes32 id = _tournamentId(270);
        _createTournament(id);
        _fundAndApprove(players[0], ENTRY_FEE);

        assertEq(pool.feeCollected_dev(id), 0, "dev empty pre-call");
        assertEq(pool.feeCollected_platform(id), 0, "platform empty pre-call");

        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);

        // INV2 — locked constants: 700_000 dev, 300_000 platform, sum == ENTRY_FEE (no dust).
        assertEq(pool.feeCollected_dev(id), 700_000, "70% to dev");
        assertEq(pool.feeCollected_platform(id), 300_000, "30% to platform");
        assertEq(_totalFees(id), ENTRY_FEE, "no dust at locked constants");
    }

    function test_BPS_constants_match_locked_values() public view {
        // Locked: DEV_BPS=7000, PLATFORM_BPS=3000, TOTAL_BPS=10000.
        // The contract MUST expose these as public constants — any change requires
        // an explicit ADR + audit re-scope, so the test pin matters.
        assertEq(pool.DEV_BPS(), DEV_BPS, "DEV_BPS pinned");
        assertEq(pool.PLATFORM_BPS(), PLATFORM_BPS, "PLATFORM_BPS pinned");
        assertEq(pool.TOTAL_BPS(), TOTAL_BPS, "TOTAL_BPS pinned");
        assertEq(pool.DEV_BPS() + pool.PLATFORM_BPS(), pool.TOTAL_BPS(), "shares sum to total");
    }

    function test_invariant_balanceReconciliation_acrossTwoTournaments() public {
        // Live state reconciliation invariant (INV1 supporting):
        //   USDC.balanceOf(pool) == Σ feeCollected_dev[t] + Σ feeCollected_platform[t]
        //                          + Σ prizePool[t]   (over unsettled tournaments)
        // Verified at every step of a multi-tournament, mixed-flow scenario.
        bytes32 t1 = _tournamentId(290);
        bytes32 t2 = _tournamentId(291);
        _createTournament(t1);
        _createTournament(t2);
        _assertReconciliation(t1, t2);

        // Player pays fees on t1.
        _fundAndApprove(players[0], 5 * ENTRY_FEE);
        vm.startPrank(players[0]);
        pool.chargeEntryFee(t1, players[0]);
        pool.chargeEntryFee(t1, players[0]);
        pool.chargeEntryFee(t1, players[0]);
        vm.stopPrank();
        _assertReconciliation(t1, t2);

        // Player pays a fee on t2 — independent bucket per tournament.
        _fundAndApprove(players[1], 2 * ENTRY_FEE);
        vm.prank(players[1]);
        pool.chargeEntryFee(t2, players[1]);
        _assertReconciliation(t1, t2);

        // Outside funder tops up t1's prize pool — must not flow to fee buckets.
        _fundFunder(outsider, 5_000_000);
        vm.prank(outsider);
        pool.fundPrizePool(t1, 5_000_000);
        _assertReconciliation(t1, t2);
    }

    /// @dev Helper: assert contract USDC balance == sum of two unsettled tournaments'
    ///      fee buckets + prize pools.
    function _assertReconciliation(bytes32 t1, bytes32 t2) internal view {
        uint256 expected = pool.feeCollected_dev(t1) + pool.feeCollected_platform(t1) + pool.feeCollected_dev(t2)
            + pool.feeCollected_platform(t2) + pool.getTournament(t1).prizePool + pool.getTournament(t2).prizePool;
        assertEq(usdc.balanceOf(address(pool)), expected, "balance reconciliation");
    }

    // ── Match-count cap

    function test_effectiveScore_matchCountCap_caps_at_ten() public {
        bytes32 id = _tournamentId(280);
        _createTournament(id);
        _fundAndApprove(players[0], 20 * ENTRY_FEE);

        // 12 solo submissions: 1 free + 11 paid retries.
        _submitSolo(id, players[0], 1000, 1, 0);
        for (uint256 i; i < 11; ++i) {
            vm.prank(players[0]);
            pool.chargeEntryFee(id, players[0]);
            _submitSolo(id, players[0], 1000, 1, i + 1);
        }

        assertEq(pool.matchCount(id, players[0]), 12, "raw matchCount tracks actual");
        assertEq(pool.soloSubmissionCount(id, players[0]), 12);

        // Effective score uses cap of 10, not 12.
        uint256 expected = 1000 * 85 + 10 * PARTICIPATION_BONUS * 15;
        assertEq(pool.effectiveScoreOf(id, players[0]), expected, "matchCount caps at 10 in effective score");
    }

    function test_effectiveScore_belowCap_unchanged() public {
        bytes32 id = _tournamentId(281);
        _createTournament(id);
        _fundAndApprove(players[0], 5 * ENTRY_FEE);

        _submitSolo(id, players[0], 1000, 1, 0);
        for (uint256 i; i < 4; ++i) {
            vm.prank(players[0]);
            pool.chargeEntryFee(id, players[0]);
            _submitSolo(id, players[0], 1000, 1, i + 1);
        }

        // 5 matches < 10 cap → unchanged behavior.
        assertEq(pool.effectiveScoreOf(id, players[0]), 1000 * 85 + 5 * PARTICIPATION_BONUS * 15);
    }

    // ── Mixed Solo + Duel settle

    function test_settle_mixedSoloAndDuel_worksAsBefore() public {
        bytes32 id = _tournamentId(300);
        _createTournament(id);

        // 2 solo, 2 duel — enough to hit the 4-player top-50% curve.
        _submitSolo(id, players[0], 2000, 1, 0);
        _submitSolo(id, players[1], 1500, 1, 1);
        _submit(id, players[2], 1000, 1, 10);
        _submit(id, players[3], 500, 1, 11);

        vm.warp(ENDS_AT + 1);
        address[] memory ranking = new address[](4);
        ranking[0] = players[0];
        ranking[1] = players[1];
        ranking[2] = players[2];
        ranking[3] = players[3];

        pool.settle(id, ranking);

        // n=4, topN=ceil(4/2)=2, but top-3 always paid with fixed bps. Place 4+ skipped.
        // 25+15+10 = 50% distributed, 50% refunded.
        uint256 p1 = (PRIZE_POOL * 2500) / 10_000;
        uint256 p2 = (PRIZE_POOL * 1500) / 10_000;
        uint256 p3 = (PRIZE_POOL * 1000) / 10_000;
        assertEq(usdc.balanceOf(players[0]), p1);
        assertEq(usdc.balanceOf(players[1]), p2);
        assertEq(usdc.balanceOf(players[2]), p3);
        assertEq(usdc.balanceOf(players[3]), 0);
    }

    function test_submissionHistory_tagsSourceCorrectly() public {
        bytes32 id = _tournamentId(301);
        _createTournament(id);
        _fundAndApprove(players[0], 2 * ENTRY_FEE);

        _submit(id, players[0], 100, 1, 0); // Duel
        _submitSolo(id, players[0], 200, 1, 0); // Solo #1 (free)
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);
        _submitSolo(id, players[0], 300, 1, 1); // Solo #2 (paid)

        assertEq(pool.submissionHistoryLength(id, players[0]), 3);
        assertEq(uint8(pool.submissionAt(id, players[0], 0).source), uint8(TournamentPool.SubmissionSource.Duel));
        assertEq(uint8(pool.submissionAt(id, players[0], 1).source), uint8(TournamentPool.SubmissionSource.Solo));
        assertEq(uint8(pool.submissionAt(id, players[0], 2).source), uint8(TournamentPool.SubmissionSource.Solo));
    }

    // ─── fundPrizePool (v2.1 patch) ────────────────────────────────────────────

    /// @dev Helper: mint USDC to `who` and approve the pool for `amount`.
    function _fundFunder(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(pool), amount);
    }

    function test_fundPrizePool_success_incrementsPrizePool() public {
        bytes32 id = _tournamentId(400);
        _createTournament(id);

        address funder = address(0xF1);
        _fundFunder(funder, 5_000_000); // 5 USDC
        uint256 funderBefore = usdc.balanceOf(funder);
        uint256 poolBefore = usdc.balanceOf(address(pool));

        vm.expectEmit(true, true, false, true, address(pool));
        emit TournamentPool.PrizePoolFunded(id, funder, 5_000_000, PRIZE_POOL + 5_000_000);

        vm.prank(funder);
        pool.fundPrizePool(id, 5_000_000);

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.prizePool, PRIZE_POOL + 5_000_000, "prizePool augmented");
        assertEq(usdc.balanceOf(funder), funderBefore - 5_000_000, "funder debited");
        assertEq(usdc.balanceOf(address(pool)), poolBefore + 5_000_000, "pool credited");
    }

    function test_fundPrizePool_revert_zeroAmount() public {
        bytes32 id = _tournamentId(401);
        _createTournament(id);
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.ZeroPrize.selector);
        pool.fundPrizePool(id, 0);
    }

    function test_fundPrizePool_revert_nonexistent() public {
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.TournamentNotFound.selector);
        pool.fundPrizePool(_tournamentId(999), 1_000_000);
    }

    function test_fundPrizePool_revert_afterSettle() public {
        bytes32 id = _tournamentId(402);
        _createTournament(id);
        _seedDescendingScores(id, 4);
        vm.warp(ENDS_AT + 1);
        pool.settle(id, _rankingSlice(4));

        address funder = address(0xF2);
        _fundFunder(funder, 1_000_000);
        vm.prank(funder);
        vm.expectRevert(TournamentPool.TournamentAlreadySettled.selector);
        pool.fundPrizePool(id, 1_000_000);
    }

    function test_fundPrizePool_multiple_funders_accumulate() public {
        bytes32 id = _tournamentId(403);
        _createTournament(id);

        address f1 = address(0xF3);
        address f2 = address(0xF4);
        _fundFunder(f1, 3_000_000);
        _fundFunder(f2, 7_000_000);

        vm.prank(f1);
        pool.fundPrizePool(id, 3_000_000);
        vm.prank(f2);
        pool.fundPrizePool(id, 7_000_000);

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.prizePool, PRIZE_POOL + 10_000_000, "cumulative pool");
    }

    function test_fundPrizePool_external_funder_permissionless() public {
        // Anyone (not just the original sponsor) can fund.
        bytes32 id = _tournamentId(404);
        _createTournament(id);

        _fundFunder(outsider, 2_000_000);
        vm.prank(outsider);
        pool.fundPrizePool(id, 2_000_000);

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.prizePool, PRIZE_POOL + 2_000_000, "outsider funded");
        // Original sponsor unchanged (refund target preserved).
        assertEq(t.sponsor, sponsor, "sponsor identity unchanged");
    }

    function test_fundPrizePool_settle_distributesAugmentedPool() public {
        bytes32 id = _tournamentId(405);
        _createTournament(id);

        // Sponsor adds 10 USDC after creation; pool becomes 20 USDC.
        _fundFunder(outsider, 10_000_000);
        vm.prank(outsider);
        pool.fundPrizePool(id, 10_000_000);

        // 4 players, descending scores.
        _seedDescendingScores(id, 4);
        vm.warp(ENDS_AT + 1);
        pool.settle(id, _rankingSlice(4));

        // n=4, top-3 fixed bps, place 4 skipped (degenerate small-N).
        uint256 augmented = PRIZE_POOL + 10_000_000;
        uint256 p1 = (augmented * 2500) / 10_000;
        uint256 p2 = (augmented * 1500) / 10_000;
        uint256 p3 = (augmented * 1000) / 10_000;
        assertEq(usdc.balanceOf(players[0]), p1, "place 1 = augmented*25%");
        assertEq(usdc.balanceOf(players[1]), p2, "place 2 = augmented*15%");
        assertEq(usdc.balanceOf(players[2]), p3, "place 3 = augmented*10%");
        // 50% of augmented pool refunds to original sponsor (curve doesn't reach 100% for n<10).
        // Note: sponsor paid PRIZE_POOL on createTournament; refund = augmented - distributed.
    }

    /// @notice Sweepstakes-safe invariant: any sequence of fundPrizePool calls
    ///         leaves BOTH fee buckets untouched. Entry fees are the only inflow
    ///         to those buckets. This is the structural underpinning of v2.2's
    ///         architectural separation between prize pool and team-wallet fees.
    function test_invariant_fundPrizePool_does_not_touch_feeCollected_anything() public {
        bytes32 id = _tournamentId(406);
        _createTournament(id);

        // Baseline: pay one entry fee so each bucket has a known value.
        _fundAndApprove(players[0], ENTRY_FEE);
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);
        uint256 devBaseline = pool.feeCollected_dev(id);
        uint256 platformBaseline = pool.feeCollected_platform(id);
        assertEq(devBaseline + platformBaseline, ENTRY_FEE, "baseline sum");
        assertEq(devBaseline, (ENTRY_FEE * DEV_BPS) / TOTAL_BPS, "baseline 70/30 dev");

        // Interleave fundPrizePool calls with entry fee + score submissions.
        _fundFunder(outsider, 50_000_000);

        // Sequence: fund, fund, entry-fee, fund, entry-fee, fund. Each bucket frozen by fund.
        vm.prank(outsider);
        pool.fundPrizePool(id, 1_000_000);
        assertEq(pool.feeCollected_dev(id), devBaseline, "dev unchanged after fund #1");
        assertEq(pool.feeCollected_platform(id), platformBaseline, "platform unchanged after fund #1");

        vm.prank(outsider);
        pool.fundPrizePool(id, 7_500_000);
        assertEq(pool.feeCollected_dev(id), devBaseline, "dev unchanged after fund #2");
        assertEq(pool.feeCollected_platform(id), platformBaseline, "platform unchanged after fund #2");

        _fundAndApprove(players[1], ENTRY_FEE);
        vm.prank(players[1]);
        pool.chargeEntryFee(id, players[1]);
        assertEq(_totalFees(id), 2 * ENTRY_FEE, "buckets track entry only");

        uint256 devAfterTwo = pool.feeCollected_dev(id);
        uint256 platformAfterTwo = pool.feeCollected_platform(id);

        vm.prank(outsider);
        pool.fundPrizePool(id, 100_000);
        assertEq(pool.feeCollected_dev(id), devAfterTwo, "dev unchanged after fund #3");
        assertEq(pool.feeCollected_platform(id), platformAfterTwo, "platform unchanged after fund #3");

        _fundAndApprove(players[2], ENTRY_FEE);
        vm.prank(players[2]);
        pool.chargeEntryFee(id, players[2]);
        vm.prank(outsider);
        pool.fundPrizePool(id, 41_400_000);

        // Final: each bucket exactly == 3 entry fees * its bps, regardless of fund flow.
        assertEq(pool.feeCollected_dev(id), (3 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS, "dev = 3 * 70%");
        assertEq(pool.feeCollected_platform(id), (3 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS, "platform = 3 * 30%");
        assertEq(_totalFees(id), 3 * ENTRY_FEE, "total = 3 * ENTRY_FEE");

        // And prizePool reflects all funder contributions plus original.
        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.prizePool, PRIZE_POOL + 1_000_000 + 7_500_000 + 100_000 + 41_400_000, "prizePool sum");

        // Withdraw fees via the v2.2 PR 3 split: dev recovers 70% bucket via
        // withdrawFeesToDev (caller-authenticated), platform recovers 30% bucket
        // via withdrawFeesToPlatform (onlyOwner). Together: prize pool untouched.
        uint256 expectedDevTotal = (3 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS;
        uint256 expectedPlatformTotal = (3 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;
        uint256 prizePoolBeforeWithdraw = t.prizePool;

        vm.prank(DEFAULT_DEV);
        pool.withdrawFeesToDev(id);
        assertEq(usdc.balanceOf(DEFAULT_DEV), expectedDevTotal, "dev wallet receives 70% bucket");

        uint256 ownerBefore = usdc.balanceOf(address(this));
        pool.withdrawFeesToPlatform(id);
        assertEq(usdc.balanceOf(address(this)) - ownerBefore, expectedPlatformTotal, "platform recovers 30%");

        TournamentPool.Tournament memory tAfter = pool.getTournament(id);
        assertEq(tAfter.prizePool, prizePoolBeforeWithdraw, "prize pool untouched by either withdraw");
    }

    // ── N1 (deferred from PR 2 review): no-dust property test for chargeEntryFee math

    /// @notice Demonstrates that the 70/30 split is dust-free for the dust-free
    ///         domain (multiples of 10 at locked constants). Anyone changing
    ///         ENTRY_FEE or the BPS constants must keep the new value inside that
    ///         domain — the fuzz spans plausible future ENTRY_FEE values up to
    ///         ~10K USDC and asserts no-dust at every step.
    /// @dev    The dust-free domain at locked constants is {k * 10 : k in N+}.
    ///         This holds because gcd(DEV_BPS, PLATFORM_BPS, TOTAL_BPS) = 1000,
    ///         so TOTAL_BPS / gcd = 10. The fuzz forces multiples of 10; the
    ///         sister test below pins the off-boundary case explicitly.
    function testFuzz_chargeEntryFee_noDust_holdsForFutureEntryFees(uint256 rawFakeFee) public pure {
        rawFakeFee = bound(rawFakeFee, 1, 1_000_000_000);
        uint256 fakeFee = rawFakeFee * 10;

        uint256 devShare = (fakeFee * DEV_BPS) / TOTAL_BPS;
        uint256 platformShare = (fakeFee * PLATFORM_BPS) / TOTAL_BPS;

        assertEq(devShare + platformShare, fakeFee, "no dust at multiples of 10");
    }

    /// @notice Sister test illustrating the dust boundary: ENTRY_FEE + 1 is NOT a
    ///         multiple of 10 at locked constants, so the split strands 1 atom of
    ///         dust. Surfaces the fragility for any future contributor changing
    ///         ENTRY_FEE — points directly at the dust-free-domain constraint.
    function test_chargeEntryFee_noDust_offBy1_introducesDust() public pure {
        uint256 fakeFee = ENTRY_FEE + 1;
        uint256 devShare = (fakeFee * DEV_BPS) / TOTAL_BPS;
        uint256 platformShare = (fakeFee * PLATFORM_BPS) / TOTAL_BPS;
        uint256 dust = fakeFee - devShare - platformShare;
        assertEq(dust, 1, "off-by-1 strands 1 atom: change ENTRY_FEE only to multiples of 10");
    }

    // ─── DevAttributionNFT integration (v2.2 PR 4) ─────────────────────────────

    function test_createTournament_mintsNFT_onFirstCallPerDev() public {
        bytes32 id = _tournamentId(500);
        address dev = _devAddr(50);

        assertFalse(pool.devNFTMinted(dev), "cache empty pre-create");

        _createTournamentWithDev(id, dev);

        // Cache flipped to true.
        assertTrue(pool.devNFTMinted(dev), "cache marks minted");
        // NFT minted to dev with deterministic tokenId.
        assertEq(devNFT.ownerOf(uint256(uint160(dev))), dev, "NFT owned by dev");
        assertEq(devNFT.balanceOf(dev), 1);
        // Soulbound: locked() returns true.
        assertTrue(devNFT.locked(uint256(uint160(dev))));
    }

    function test_createTournament_skipsNFTMint_onSecondCallSameDev() public {
        // Idempotency: second tournament for same dev triggers no second mint.
        // OZ ERC-721's _mint reverts on duplicate tokenId, so if the cache check
        // were missing this test would fail with that revert.
        bytes32 id1 = _tournamentId(501);
        bytes32 id2 = _tournamentId(502);
        address dev = _devAddr(51);

        _createTournamentWithDev(id1, dev);
        assertEq(devNFT.balanceOf(dev), 1, "minted on first");

        _createTournamentWithDev(id2, dev);
        assertEq(devNFT.balanceOf(dev), 1, "still 1 -- no double mint");
        assertTrue(pool.devNFTMinted(dev), "cache stays true");
    }

    function test_createTournament_differentDevs_mintSeparately() public {
        bytes32 id1 = _tournamentId(503);
        bytes32 id2 = _tournamentId(504);
        address devA = _devAddr(52);
        address devB = _devAddr(53);

        _createTournamentWithDev(id1, devA);
        _createTournamentWithDev(id2, devB);

        assertEq(devNFT.balanceOf(devA), 1, "devA has NFT");
        assertEq(devNFT.balanceOf(devB), 1, "devB has NFT");
        assertEq(devNFT.ownerOf(uint256(uint160(devA))), devA);
        assertEq(devNFT.ownerOf(uint256(uint160(devB))), devB);
        assertTrue(pool.devNFTMinted(devA));
        assertTrue(pool.devNFTMinted(devB));
    }

    function test_createTournament_revert_zeroDevAddr_doesNotTouchNFTState() public {
        // The zero-address guard fires before any NFT interaction — the revert
        // is the proof that no partial state mutation occurred. (We don't check
        // devNFT.balanceOf(address(0)) directly because OZ ERC-721 reverts on
        // zero-address balance queries.)
        bytes32 id = _tournamentId(506);
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.ZeroAddress.selector);
        pool.createTournament(
            id, address(0), GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    // ─── F4 (PR 5) — cache-before-mint ordering verification via observer mock ─

    /// @notice Deploys a SEPARATE pool bound to a MaliciousMockDevNFT observer.
    ///         The observer reads `pool.devNFTMinted(dev)` inside its mint() and
    ///         records what it saw. If `cacheTrueAtMintTime == true` post-call,
    ///         the cache flip preceded the external mint invocation (CEI ordering
    ///         intact). This is the proper rewrite of the deleted
    ///         `test_createTournament_postCondition_cacheAndNFTBothSet` test which
    ///         only checked final state.
    function test_createTournament_cacheFlippedBefore_externalMint() public {
        // Build a fresh pool bound to the observer mock (cannot reuse the standard
        // pool from setUp — that one is bound to the real DevAttributionNFT).
        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        MaliciousMockDevNFT mock = new MaliciousMockDevNFT(predictedPool);
        TournamentPool observerPool = new TournamentPool(IERC20(address(usdc)), trustedSigner, address(mock));
        require(address(observerPool) == predictedPool, "predicted-pool mismatch");

        // Fund + approve the sponsor for this fresh pool.
        usdc.mint(sponsor, 1_000_000_000);
        vm.prank(sponsor);
        usdc.approve(address(observerPool), type(uint256).max);

        bytes32 id = keccak256("F4-ordering-test");
        address dev = _devAddr(700);

        // Pre-conditions: mock has not been called yet.
        assertEq(mock.mintCallCount(), 0, "mock untouched pre-call");
        assertFalse(mock.cacheTrueAtMintTime(), "default false");

        vm.prank(sponsor);
        observerPool.createTournament(
            id, dev, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );

        // Post-conditions: mock saw cache == true at mint time, proving the cache
        // flip preceded the external invocation.
        assertEq(mock.mintCallCount(), 1, "mint called exactly once");
        assertEq(mock.observedDev(), dev, "mock saw correct dev arg");
        assertTrue(mock.cacheTrueAtMintTime(), "cache must read TRUE inside mint() callback -- proves CEI ordering");
        // And the pool's cache is also true post-call (sanity).
        assertTrue(observerPool.devNFTMinted(dev));
    }

    /// @notice Cache-hit semantics via observer mock: second tournament for the
    ///         same dev does NOT call mock.mint() (mintCallCount stays at 1).
    ///         Pins the gas-optimization claim that the cache skips the external
    ///         call on subsequent createTournament invocations per dev.
    function test_createTournament_observerMock_notCalledOnCacheHit() public {
        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        MaliciousMockDevNFT mock = new MaliciousMockDevNFT(predictedPool);
        TournamentPool observerPool = new TournamentPool(IERC20(address(usdc)), trustedSigner, address(mock));
        require(address(observerPool) == predictedPool, "predicted-pool mismatch");

        usdc.mint(sponsor, 1_000_000_000);
        vm.prank(sponsor);
        usdc.approve(address(observerPool), type(uint256).max);

        bytes32 id1 = keccak256("F4-cache-hit-1");
        bytes32 id2 = keccak256("F4-cache-hit-2");
        address dev = _devAddr(710);

        vm.prank(sponsor);
        observerPool.createTournament(
            id1, dev, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
        assertEq(mock.mintCallCount(), 1, "mock called once on first tournament");

        vm.prank(sponsor);
        observerPool.createTournament(
            id2, dev, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
        assertEq(mock.mintCallCount(), 1, "mock NOT called twice -- cache hit skips external call (gas optimization)");
    }

    // ─── F5 (PR 5) — receiver-hook reentrancy coverage on nonReentrant funcs ──

    /// @notice MaliciousReentrantDev's onERC721Received recurses into pool functions.
    ///         Coverage:
    ///         - 5 nonReentrant-protected functions: must revert
    ///           ReentrancyGuardReentrantCall (createTournament, chargeEntryFee,
    ///           settle, withdrawFeesToDev, fundPrizePool).
    ///         - 1 onlyOwner+nonReentrant (withdrawFeesToPlatform): from a
    ///           non-owner reentrant context, onlyOwner fires FIRST — must revert
    ///           OwnableUnauthorizedAccount(this). Substitute defense, NOT
    ///           ReentrancyGuardReentrantCall. Documented as a different defense,
    ///           not a coverage gap.
    ///         - 1 submit-path (submitScore): no nonReentrant; signature gate
    ///           is the substitute defense — must revert BadSignature on a fake
    ///           sig. Pins the substitute defense in test, not just comment.
    ///         The whole createTournament tx still succeeds (the malicious dev's
    ///         hook returns the canonical receiver selector after recording each
    ///         revert).
    function test_createTournament_receiverHook_reentrancyCoverage() public {
        MaliciousReentrantDev malDev = new MaliciousReentrantDev(pool);

        // Pre-fund + approve the malicious dev so any USDC pulls inside the
        // recursive calls reach the reentrancy/auth check, not an allowance failure.
        usdc.mint(address(malDev), 1_000_000_000);
        vm.prank(address(malDev));
        usdc.approve(address(pool), type(uint256).max);

        bytes32 id = _tournamentId(900);
        malDev.setExpectedTournamentId(id);

        // Pre-compute a valid-format sig from a NON-trustedSigner key for the
        // submitScore reentry attempt. ECDSA.recover succeeds (returns wrongPk's
        // address), but the contract's `signer != trustedSigner` check fires
        // `BadSignature`. Without this, a naive 65-byte zero sig would revert
        // `ECDSAInvalidSignature` from OZ ECDSA before reaching the
        // trustedSigner check.
        {
            uint256 wrongPk = 0xBADF00D;
            bytes32 nonce = keccak256("malicious-nonce");
            bytes32 digest = keccak256(
                abi.encode(id, address(malDev), uint256(100), uint256(1), nonce, address(pool), block.chainid)
            );
            bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, ethDigest);
            malDev.setFakeSig(abi.encodePacked(r, s, v));
        }

        // Trigger: createTournament with devAddr = malDev. _safeMint -> onERC721Received
        // -> 7 recursive attempts, all caught and recorded.
        _createTournamentWithDev(id, address(malDev));

        // Outer createTournament succeeded; NFT minted to malDev.
        assertTrue(pool.devNFTMinted(address(malDev)), "outer createTournament succeeded");
        assertEq(devNFT.balanceOf(address(malDev)), 1, "NFT minted to malDev");

        // 5 nonReentrant-protected functions reject reentry with ReentrancyGuardReentrantCall.
        bytes4 reentrancySel = ReentrancyGuard.ReentrancyGuardReentrantCall.selector;

        assertTrue(malDev.createTournament_reverted(), "createTournament reentry blocked");
        assertEq(_revertSelector(malDev.createTournament_revertData()), reentrancySel, "createTournament selector");

        assertTrue(malDev.chargeEntryFee_reverted(), "chargeEntryFee reentry blocked");
        assertEq(_revertSelector(malDev.chargeEntryFee_revertData()), reentrancySel, "chargeEntryFee selector");

        assertTrue(malDev.settle_reverted(), "settle reentry blocked");
        assertEq(_revertSelector(malDev.settle_revertData()), reentrancySel, "settle selector");

        assertTrue(malDev.withdrawFeesToDev_reverted(), "withdrawFeesToDev reentry blocked");
        assertEq(_revertSelector(malDev.withdrawFeesToDev_revertData()), reentrancySel, "withdrawFeesToDev selector");

        assertTrue(malDev.fundPrizePool_reverted(), "fundPrizePool reentry blocked");
        assertEq(_revertSelector(malDev.fundPrizePool_revertData()), reentrancySel, "fundPrizePool selector");

        // F2: withdrawFeesToPlatform — onlyOwner fires before nonReentrant from non-owner context.
        bytes4 ownableSel = Ownable.OwnableUnauthorizedAccount.selector;
        assertTrue(malDev.withdrawFeesToPlatform_reverted(), "withdrawFeesToPlatform reentry blocked");
        assertEq(
            _revertSelector(malDev.withdrawFeesToPlatform_revertData()),
            ownableSel,
            "withdrawFeesToPlatform: onlyOwner fires before nonReentrant -- substitute defense"
        );

        // F3: submitScore with fake sig — signature gate is the substitute defense
        // for submit-paths (no nonReentrant on submitScore/submitSoloScore).
        bytes4 badSigSel = TournamentPool.BadSignature.selector;
        assertTrue(malDev.submitScore_reverted(), "submitScore reentry blocked by sig gate");
        assertEq(
            _revertSelector(malDev.submitScore_revertData()),
            badSigSel,
            "submitScore: trustedSigner gate blocks forgery (no nonReentrant needed)"
        );
    }

    /// @dev Extract the first 4 bytes (selector) from a captured revert payload.
    ///      Returns 0 if data is shorter than 4 bytes (e.g., empty revert).
    function _revertSelector(bytes memory data) internal pure returns (bytes4) {
        if (data.length < 4) return bytes4(0);
        return bytes4(data[0]) | (bytes4(data[1]) >> 8) | (bytes4(data[2]) >> 16) | (bytes4(data[3]) >> 24);
    }

    // ─── PR 5 — full-lifecycle integration tests ───────────────────────────────

    /// @notice Genesis -> createTournament -> 5 entry fees across 3 players ->
    ///         settle -> withdrawFeesToDev + withdrawFeesToPlatform.
    ///         Verifies USDC balance reconciliation at every stage and that the
    ///         dev attribution NFT is minted exactly once.
    function test_integration_singleTournament_fullLifecycle() public {
        bytes32 id = _tournamentId(800);
        address dev = _devAddr(80);

        uint256 sponsorPre = usdc.balanceOf(sponsor);
        uint256 poolPre = usdc.balanceOf(address(pool));

        // Step 1: createTournament — sponsor deposits PRIZE_POOL; NFT minted to dev.
        _createTournamentWithDev(id, dev);
        assertEq(usdc.balanceOf(sponsor), sponsorPre - PRIZE_POOL, "sponsor debited prize");
        assertEq(usdc.balanceOf(address(pool)), poolPre + PRIZE_POOL, "pool credited prize");
        assertEq(devNFT.balanceOf(dev), 1, "NFT minted on first tournament");

        // Step 2: 3 players each pay 1 free + 2 paid solos (so 6 chargeEntryFee calls total).
        for (uint256 i; i < 3; ++i) {
            address p = players[i];
            _fundAndApprove(p, 5 * ENTRY_FEE);
            _submitSolo(id, p, 1000 + i * 100, 1, i * 10);
            for (uint256 r; r < 2; ++r) {
                vm.prank(p);
                pool.chargeEntryFee(id, p);
                _submitSolo(id, p, 1100 + i * 100 + r * 50, 1, i * 10 + r + 1);
            }
        }

        uint256 totalFees = 6 * ENTRY_FEE;
        uint256 expectedDevBucket = (totalFees * DEV_BPS) / TOTAL_BPS;
        uint256 expectedPlatformBucket = (totalFees * PLATFORM_BPS) / TOTAL_BPS;
        assertEq(pool.feeCollected_dev(id), expectedDevBucket, "dev bucket = 70% * 6");
        assertEq(pool.feeCollected_platform(id), expectedPlatformBucket, "platform bucket = 30% * 6");
        assertEq(usdc.balanceOf(address(pool)), PRIZE_POOL + totalFees, "pool holds prize + fees");

        // Step 3: settle. Ranking by best score (player 2 highest at 1300+, then 1, then 0).
        vm.warp(ENDS_AT + 1);
        address[] memory ranking = new address[](3);
        ranking[0] = players[2];
        ranking[1] = players[1];
        ranking[2] = players[0];
        pool.settle(id, ranking);

        // Step 4: withdraw — dev gets 70%, platform gets 30%, prize pool fully distributed.
        vm.prank(dev);
        pool.withdrawFeesToDev(id);
        assertEq(usdc.balanceOf(dev), expectedDevBucket, "dev recovered 70%");
        assertEq(pool.feeCollected_dev(id), 0, "dev bucket drained");

        uint256 ownerBeforeWithdraw = usdc.balanceOf(address(this));
        pool.withdrawFeesToPlatform(id);
        assertEq(usdc.balanceOf(address(this)) - ownerBeforeWithdraw, expectedPlatformBucket, "platform recovered 30%");
        assertEq(pool.feeCollected_platform(id), 0, "platform bucket drained");

        // Final reconciliation: pool USDC balance must be zero (every wei accounted for).
        assertEq(usdc.balanceOf(address(pool)), 0, "all funds drained from pool");
    }

    /// @notice Multi-tournament (3) across 2 developers: NFT minted on devA's
    ///         first tournament and devB's first tournament; devA's second tournament
    ///         hits the cache and skips mint. Each tournament settles independently;
    ///         each dev recovers their own share via withdrawFeesToDev; platform
    ///         recovers each tournament's platform share separately.
    function test_integration_multiTournament_multiDev_flow() public {
        bytes32 t1 = _tournamentId(810);
        bytes32 t2 = _tournamentId(811);
        bytes32 t3 = _tournamentId(812);
        address devA = _devAddr(90);
        address devB = _devAddr(91);

        // t1, t2 use devA. t3 uses devB.
        _createTournamentWithDev(t1, devA);
        assertEq(devNFT.balanceOf(devA), 1, "devA NFT minted on t1");

        _createTournamentWithDev(t2, devA);
        assertEq(devNFT.balanceOf(devA), 1, "still 1 -- t2 cache hit, no re-mint");

        _createTournamentWithDev(t3, devB);
        assertEq(devNFT.balanceOf(devB), 1, "devB NFT minted on t3");

        // Each tournament gets its own player engagement (just enough to test fees flow).
        _fundAndApprove(players[0], 4 * ENTRY_FEE);
        _submitSolo(t1, players[0], 1000, 1, 0);
        vm.prank(players[0]);
        pool.chargeEntryFee(t1, players[0]);

        _fundAndApprove(players[1], 4 * ENTRY_FEE);
        _submitSolo(t2, players[1], 1500, 1, 0);
        vm.prank(players[1]);
        pool.chargeEntryFee(t2, players[1]);

        _fundAndApprove(players[2], 4 * ENTRY_FEE);
        _submitSolo(t3, players[2], 2000, 1, 0);
        vm.prank(players[2]);
        pool.chargeEntryFee(t3, players[2]);

        // Settle all three.
        vm.warp(ENDS_AT + 1);
        address[] memory r1 = new address[](1);
        r1[0] = players[0];
        pool.settle(t1, r1);
        address[] memory r2 = new address[](1);
        r2[0] = players[1];
        pool.settle(t2, r2);
        address[] memory r3 = new address[](1);
        r3[0] = players[2];
        pool.settle(t3, r3);

        uint256 perTournamentDev = (ENTRY_FEE * DEV_BPS) / TOTAL_BPS;
        uint256 perTournamentPlatform = (ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;

        // devA recovers t1 + t2 fees (separate calls per tournament).
        vm.startPrank(devA);
        pool.withdrawFeesToDev(t1);
        pool.withdrawFeesToDev(t2);
        vm.stopPrank();
        assertEq(usdc.balanceOf(devA), 2 * perTournamentDev, "devA = sum of t1+t2 dev shares");

        // devB recovers t3 fees only.
        vm.prank(devB);
        pool.withdrawFeesToDev(t3);
        assertEq(usdc.balanceOf(devB), perTournamentDev, "devB = t3 dev share");

        // devA cannot withdraw t3 (not their tournament).
        vm.prank(devA);
        vm.expectRevert(TournamentPool.OnlyDev.selector);
        pool.withdrawFeesToDev(t3);

        // Platform recovers all three tournaments' platform shares.
        uint256 ownerPre = usdc.balanceOf(address(this));
        pool.withdrawFeesToPlatform(t1);
        pool.withdrawFeesToPlatform(t2);
        pool.withdrawFeesToPlatform(t3);
        assertEq(
            usdc.balanceOf(address(this)) - ownerPre, 3 * perTournamentPlatform, "platform = sum of 3 platform shares"
        );

        // All buckets zeroed.
        assertEq(_totalFees(t1), 0);
        assertEq(_totalFees(t2), 0);
        assertEq(_totalFees(t3), 0);
    }

    /// @notice "Insufficient pool" — prize pool small enough that some tier payouts
    ///         round to zero under integer division. Contract handles via _pay's
    ///         zero-amount short-circuit; the unspent dust accumulates in the
    ///         sponsor refund.
    function test_integration_settle_insufficientPool_smallPrize() public {
        bytes32 id = keccak256("tiny-prize");
        // Build a tournament with a 9-wei prize pool (place 1 = 2; place 2 = 1; place 3 = 0;
        // tier4-place-4..10 = 0; tier5 = 0). All tiers below place 2 round to zero.
        usdc.mint(sponsor, 1_000_000_000);
        vm.prank(sponsor);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(sponsor);
        pool.createTournament(
            id, _devAddr(95), GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, 9, PARTICIPATION_BONUS
        );

        // 4 players seeded with descending raw scores so ranking is canonical.
        for (uint256 i; i < 4; ++i) {
            _submit(id, players[i], 1000 * (4 - i), 1, 8000 + i);
        }

        vm.warp(ENDS_AT + 1);

        uint256 sponsorPreSettle = usdc.balanceOf(sponsor);
        pool.settle(id, _rankingSlice(4));

        // Top-3 fixed bps: 9*2500/10000 = 2, 9*1500/10000 = 1, 9*1000/10000 = 0.
        // Place 4 onward all zero (no-op via _pay's amount==0 short-circuit).
        // Distributed = 2 + 1 + 0 = 3. Refund = 9 - 3 = 6.
        assertEq(usdc.balanceOf(players[0]), 2, "place 1 = 2 wei");
        assertEq(usdc.balanceOf(players[1]), 1, "place 2 = 1 wei");
        assertEq(usdc.balanceOf(players[2]), 0, "place 3 = 0 (rounded down)");
        assertEq(usdc.balanceOf(players[3]), 0, "place 4 = 0 (skipped tier)");
        assertEq(usdc.balanceOf(sponsor) - sponsorPreSettle, 6, "sponsor refund = 9 - 3");
    }

    /// @notice Devs can withdraw their fee share BEFORE settle. The withdraw
    ///         functions are not gated on `t.settled` — they only require the
    ///         fee bucket to be non-empty and the caller to be authorized. This
    ///         matters for UX: devs receiving early entries don't have to wait
    ///         for tournament close to access their share.
    function test_integration_dev_canWithdraw_beforeSettle() public {
        bytes32 id = _tournamentId(830);
        address dev = _devAddr(97);
        _createTournamentWithDev(id, dev);

        // Players pay 4 entry fees before settle.
        _fundAndApprove(players[0], 5 * ENTRY_FEE);
        _submitSolo(id, players[0], 1000, 1, 0);
        for (uint256 i; i < 4; ++i) {
            vm.prank(players[0]);
            pool.chargeEntryFee(id, players[0]);
        }

        uint256 expectedDev = (4 * ENTRY_FEE * DEV_BPS) / TOTAL_BPS;
        uint256 expectedPlatform = (4 * ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS;
        assertFalse(pool.getTournament(id).settled, "tournament still open");

        // Dev withdraws mid-tournament (before settle).
        uint256 devBefore = usdc.balanceOf(dev);
        vm.prank(dev);
        pool.withdrawFeesToDev(id);
        assertEq(usdc.balanceOf(dev) - devBefore, expectedDev, "dev pulled mid-tournament fees");
        assertEq(pool.feeCollected_dev(id), 0, "dev bucket drained");

        // Platform also withdraws before settle.
        uint256 ownerBefore = usdc.balanceOf(address(this));
        pool.withdrawFeesToPlatform(id);
        assertEq(usdc.balanceOf(address(this)) - ownerBefore, expectedPlatform, "platform pulled mid-tournament fees");

        // Tournament continues — additional fees accrue into freshly-zeroed buckets.
        vm.prank(players[0]);
        pool.chargeEntryFee(id, players[0]);
        assertEq(pool.feeCollected_dev(id), (ENTRY_FEE * DEV_BPS) / TOTAL_BPS, "new dev fee accrues");
        assertEq(pool.feeCollected_platform(id), (ENTRY_FEE * PLATFORM_BPS) / TOTAL_BPS, "new platform fee accrues");
    }

    /// @notice Settle when no entries are received: empty ranking is valid; full
    ///         prize pool refunds to sponsor; no PrizePaid events emit. NFT was
    ///         already minted at createTournament time so it persists across this
    ///         no-op settle.
    function test_integration_settle_noEntriesReceived() public {
        bytes32 id = _tournamentId(820);
        address dev = _devAddr(96);
        _createTournamentWithDev(id, dev);
        assertEq(devNFT.balanceOf(dev), 1, "NFT minted at create");

        uint256 sponsorPre = usdc.balanceOf(sponsor);

        vm.warp(ENDS_AT + 1);
        pool.settle(id, new address[](0));

        // Full refund.
        assertEq(usdc.balanceOf(sponsor) - sponsorPre, PRIZE_POOL, "full refund to sponsor");
        // NFT survives no-op settle.
        assertEq(devNFT.balanceOf(dev), 1, "NFT persists post no-op settle");
        // No fees were collected; both buckets remain zero.
        assertEq(_totalFees(id), 0, "no fees in either bucket");
        // settled flag set, so withdrawFeesToDev is still callable but is a no-op.
        vm.prank(dev);
        pool.withdrawFeesToDev(id); // returns silently on zero-amount
        assertEq(usdc.balanceOf(dev), 0, "no dev fees to recover");
    }

    /// @notice F6: very-large prize pool boundary. Pin the upper safe operating
    ///         range — `prizePool * BPS_PLACE_1` (= * 2500) overflows uint256
    ///         when prizePool > type(uint256).max / 10_000. Just under that
    ///         boundary, settle distributes correctly with no overflow panic.
    function test_integration_settle_largePrize_safeMaxBound() public {
        uint256 safeMax = type(uint256).max / 10_000; // bps multiplication boundary
        uint256 testPrize = safeMax - 1;

        // Mint enough mock USDC for the sponsor to fund the test.
        usdc.mint(sponsor, testPrize);
        vm.prank(sponsor);
        usdc.approve(address(pool), type(uint256).max);

        bytes32 id = keccak256("F6-large-prize");
        address dev = _devAddr(960);
        vm.prank(sponsor);
        pool.createTournament(
            id, dev, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, testPrize, PARTICIPATION_BONUS
        );

        // 4 players seeded with descending raw scores so ranking is canonical.
        for (uint256 i; i < 4; ++i) {
            _submit(id, players[i], 1000 * (4 - i), 1, 9000 + i);
        }

        vm.warp(ENDS_AT + 1);

        uint256 sponsorPreSettle = usdc.balanceOf(sponsor);
        uint256[] memory winnerPre = new uint256[](4);
        for (uint256 i; i < 4; ++i) {
            winnerPre[i] = usdc.balanceOf(players[i]);
        }

        // Settle MUST succeed without overflow panic.
        pool.settle(id, _rankingSlice(4));

        // Reconstruct distributed + refunded; assert audit recipe holds.
        // n=4, topN=2, top-3 fixed bps, place 4+ skipped (small-N).
        uint256 p1 = (testPrize * 2500) / 10_000;
        uint256 p2 = (testPrize * 1500) / 10_000;
        uint256 p3 = (testPrize * 1000) / 10_000;
        uint256 distributed = p1 + p2 + p3;
        uint256 refunded = testPrize - distributed;

        assertEq(usdc.balanceOf(players[0]) - winnerPre[0], p1, "place 1 payout");
        assertEq(usdc.balanceOf(players[1]) - winnerPre[1], p2, "place 2 payout");
        assertEq(usdc.balanceOf(players[2]) - winnerPre[2], p3, "place 3 payout");
        assertEq(usdc.balanceOf(players[3]) - winnerPre[3], 0, "place 4 skipped");
        assertEq(usdc.balanceOf(sponsor) - sponsorPreSettle, refunded, "sponsor refund");

        // Audit recipe: distributed + refunded == testPrize (no dust at 4-player small-N path).
        assertEq(distributed + refunded, testPrize, "audit recipe holds: distributed + refunded == prizePool");
    }

    /// @notice F7: withdraw-order-independence. Same lifecycle as the canonical
    ///         single-tournament test, but withdraws platform FIRST, then dev.
    ///         End balances must be identical to the dev-then-platform order.
    function test_integration_withdraw_orderIndependent() public {
        bytes32 id = _tournamentId(970);
        address dev = _devAddr(97);

        _createTournamentWithDev(id, dev);

        // 3 players each pay 1 free + 2 paid solos (mirrors the canonical lifecycle test).
        for (uint256 i; i < 3; ++i) {
            address p = players[i];
            _fundAndApprove(p, 5 * ENTRY_FEE);
            _submitSolo(id, p, 1000 + i * 100, 1, i * 10);
            for (uint256 r; r < 2; ++r) {
                vm.prank(p);
                pool.chargeEntryFee(id, p);
                _submitSolo(id, p, 1100 + i * 100 + r * 50, 1, i * 10 + r + 1);
            }
        }

        uint256 totalFees = 6 * ENTRY_FEE;
        uint256 expectedDevBucket = (totalFees * DEV_BPS) / TOTAL_BPS;
        uint256 expectedPlatformBucket = (totalFees * PLATFORM_BPS) / TOTAL_BPS;

        vm.warp(ENDS_AT + 1);
        address[] memory ranking = new address[](3);
        ranking[0] = players[2];
        ranking[1] = players[1];
        ranking[2] = players[0];
        pool.settle(id, ranking);

        // Withdraw in REVERSE canonical order: platform first, dev second.
        uint256 ownerBefore = usdc.balanceOf(address(this));
        pool.withdrawFeesToPlatform(id);
        assertEq(
            usdc.balanceOf(address(this)) - ownerBefore,
            expectedPlatformBucket,
            "platform-first: 30% recovered correctly"
        );
        assertEq(pool.feeCollected_platform(id), 0, "platform bucket drained first");
        // Dev bucket UNCHANGED by platform withdraw.
        assertEq(pool.feeCollected_dev(id), expectedDevBucket, "dev bucket untouched by platform withdraw");

        vm.prank(dev);
        pool.withdrawFeesToDev(id);
        assertEq(usdc.balanceOf(dev), expectedDevBucket, "dev recovered 70% second");
        assertEq(pool.feeCollected_dev(id), 0, "dev bucket drained");

        // End state matches dev-first ordering: pool drained, both buckets zero,
        // dev/platform got their respective shares. Order independence proven.
        assertEq(usdc.balanceOf(address(pool)), 0, "all funds drained");
    }
}
