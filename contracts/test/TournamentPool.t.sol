// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { TournamentPool } from "../src/TournamentPool.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

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
    address[] internal players;

    // ── Contracts
    MockUSDC internal usdc;
    TournamentPool internal pool;

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
        pool = new TournamentPool(IERC20(address(usdc)), trustedSigner);

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
        vm.prank(sponsor);
        pool.createTournament(
            id,
            GAME,
            TournamentPool.CycleType.Daily,
            STARTS_AT,
            ENDS_AT,
            PRIZE_POOL,
            PARTICIPATION_BONUS
        );
    }

    function _signSubmit(
        bytes32 id,
        address player,
        uint256 score,
        uint256 matchCountDelta,
        bytes32 nonce
    )
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest =
            keccak256(abi.encode(id, player, score, matchCountDelta, nonce, address(pool), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _submit(bytes32 id, address player, uint256 score, uint256 matchCountDelta, uint256 nonceSeed)
        internal
    {
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
        for (uint256 i; i < n; ++i) r[i] = players[i];
        return r;
    }

    // ─── createTournament ──────────────────────────────────────────────────────

    function test_createTournament_success() public {
        bytes32 id = _tournamentId(1);
        uint256 sponsorBefore = usdc.balanceOf(sponsor);

        _createTournament(id);

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.sponsor, sponsor, "sponsor");
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
            id, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    function test_createTournament_revert_invalidWindow() public {
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.InvalidWindow.selector);
        pool.createTournament(
            _tournamentId(3),
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
            _tournamentId(4), GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, 0, PARTICIPATION_BONUS
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
        for (uint256 i; i < 10; ++i) before_[i] = usdc.balanceOf(players[i]);
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
        for (uint160 i = 21; i <= 30; ++i) players.push(address(uint160(0x1000 + i)));

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
}
