// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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

contract ChallengeEscrowTest is Test {
    // ── Actors
    uint256 internal signerPk = 0xdeadbeef1234;
    address internal trustedSigner;
    address internal feeVault = address(0xFEE);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);

    // ── Contracts
    MockUSDC internal usdc;
    ChallengeEscrow internal escrow;

    // ── Constants
    uint256 internal constant STAKE = 1_000_000; // 1 USDC (6 decimals)
    uint256 internal constant DURATION = 1 days;
    bytes32 internal constant GAME_SLUG = keccak256("pilot");

    // ─── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        trustedSigner = vm.addr(signerPk);

        usdc = new MockUSDC();
        escrow = new ChallengeEscrow(IERC20(address(usdc)), trustedSigner, feeVault);

        // Fund Alice & Bob with 10 USDC each
        usdc.mint(alice, 10_000_000);
        usdc.mint(bob, 10_000_000);
        usdc.mint(carol, 10_000_000);

        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function _challengeId(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("challenge", seed));
    }

    function _createAliceChallenge(bytes32 id) internal {
        vm.prank(alice);
        escrow.createChallenge(id, GAME_SLUG, STAKE, DURATION);
    }

    function _bobAccepts(bytes32 id) internal {
        vm.prank(bob);
        escrow.acceptChallenge(id);
    }

    function _signSettle(
        bytes32 id,
        address winner,
        uint256 creatorScore,
        uint256 challengerScore
    )
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest =
            keccak256(abi.encode(id, winner, creatorScore, challengerScore, address(escrow), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _signWalkover(bytes32 id, address winner) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encode(id, winner, "walkover", address(escrow), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    // ─── createChallenge ───────────────────────────────────────────────────────

    function test_createChallenge_success() public {
        bytes32 id = _challengeId(1);
        uint256 aliceBefore = usdc.balanceOf(alice);

        _createAliceChallenge(id);

        ChallengeEscrow.Challenge memory c = escrow.getChallenge(id);
        assertEq(c.creator, alice);
        assertEq(c.stake, STAKE);
        assertEq(uint8(c.status), uint8(ChallengeEscrow.Status.Open));
        assertEq(usdc.balanceOf(alice), aliceBefore - STAKE);
        assertEq(usdc.balanceOf(address(escrow)), STAKE);
    }

    function test_createChallenge_revert_duplicate() public {
        bytes32 id = _challengeId(1);
        _createAliceChallenge(id);
        vm.prank(alice);
        vm.expectRevert(ChallengeEscrow.ChallengeAlreadyExists.selector);
        escrow.createChallenge(id, GAME_SLUG, STAKE, DURATION);
    }

    function test_createChallenge_revert_zeroStake() public {
        vm.prank(alice);
        vm.expectRevert(ChallengeEscrow.ZeroStake.selector);
        escrow.createChallenge(_challengeId(99), GAME_SLUG, 0, DURATION);
    }

    function test_createChallenge_revert_zeroDuration() public {
        vm.prank(alice);
        vm.expectRevert(ChallengeEscrow.ZeroDuration.selector);
        escrow.createChallenge(_challengeId(99), GAME_SLUG, STAKE, 0);
    }

    // ─── acceptChallenge ───────────────────────────────────────────────────────

    function test_acceptChallenge_success() public {
        bytes32 id = _challengeId(2);
        _createAliceChallenge(id);

        uint256 bobBefore = usdc.balanceOf(bob);
        _bobAccepts(id);

        ChallengeEscrow.Challenge memory c = escrow.getChallenge(id);
        assertEq(c.challenger, bob);
        assertEq(uint8(c.status), uint8(ChallengeEscrow.Status.Accepted));
        assertEq(usdc.balanceOf(bob), bobBefore - STAKE);
        assertEq(usdc.balanceOf(address(escrow)), STAKE * 2);
    }

    function test_acceptChallenge_revert_selfChallenge() public {
        bytes32 id = _challengeId(3);
        _createAliceChallenge(id);
        vm.prank(alice);
        vm.expectRevert(ChallengeEscrow.SelfChallenge.selector);
        escrow.acceptChallenge(id);
    }

    function test_acceptChallenge_revert_expired() public {
        bytes32 id = _challengeId(4);
        _createAliceChallenge(id);
        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(bob);
        vm.expectRevert(ChallengeEscrow.ChallengeHasExpired.selector);
        escrow.acceptChallenge(id);
    }

    function test_acceptChallenge_revert_alreadyAccepted() public {
        bytes32 id = _challengeId(5);
        _createAliceChallenge(id);
        _bobAccepts(id);
        vm.prank(carol);
        // Status is Accepted (not Open), so ChallengeNotOpen fires before AlreadyAccepted
        vm.expectRevert(ChallengeEscrow.ChallengeNotOpen.selector);
        escrow.acceptChallenge(id);
    }

    // ─── settle ────────────────────────────────────────────────────────────────

    function test_settle_aliceWins() public {
        bytes32 id = _challengeId(6);
        _createAliceChallenge(id);
        _bobAccepts(id);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 vaultBefore = usdc.balanceOf(feeVault);

        bytes memory sig = _signSettle(id, alice, 100, 50);
        escrow.settle(id, alice, 100, 50, sig);

        // totalPool = 2 USDC, fee = 0.20, payout = 1.80
        uint256 expectedPayout = (STAKE * 2 * 9000) / 10_000;
        uint256 expectedFee = STAKE * 2 - expectedPayout;

        assertEq(usdc.balanceOf(alice), aliceBefore + expectedPayout);
        assertEq(usdc.balanceOf(feeVault), vaultBefore + expectedFee);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        ChallengeEscrow.Challenge memory c = escrow.getChallenge(id);
        assertEq(uint8(c.status), uint8(ChallengeEscrow.Status.Settled));
        assertEq(c.winner, alice);
        assertEq(c.payoutAmount, expectedPayout);
    }

    function test_settle_bobWins() public {
        bytes32 id = _challengeId(7);
        _createAliceChallenge(id);
        _bobAccepts(id);

        bytes memory sig = _signSettle(id, bob, 30, 95);
        escrow.settle(id, bob, 30, 95, sig);

        uint256 expectedPayout = (STAKE * 2 * 9000) / 10_000;
        assertEq(usdc.balanceOf(bob), 10_000_000 - STAKE + expectedPayout);
    }

    function test_settle_revert_badSignature() public {
        bytes32 id = _challengeId(8);
        _createAliceChallenge(id);
        _bobAccepts(id);

        // Wrong private key signs
        uint256 badPk = 0xbadbadbad;
        bytes32 digest = keccak256(abi.encode(id, alice, uint256(100), uint256(50), address(escrow), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(badPk, ethDigest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert(ChallengeEscrow.BadSignature.selector);
        escrow.settle(id, alice, 100, 50, badSig);
    }

    function test_settle_revert_invalidWinner() public {
        bytes32 id = _challengeId(9);
        _createAliceChallenge(id);
        _bobAccepts(id);

        bytes memory sig = _signSettle(id, carol, 100, 50);
        vm.expectRevert(ChallengeEscrow.InvalidWinner.selector);
        escrow.settle(id, carol, 100, 50, sig);
    }

    function test_settle_revert_notAccepted() public {
        bytes32 id = _challengeId(10);
        _createAliceChallenge(id);
        // Not accepted yet
        bytes memory sig = _signSettle(id, alice, 100, 50);
        vm.expectRevert(ChallengeEscrow.ChallengeNotAccepted.selector);
        escrow.settle(id, alice, 100, 50, sig);
    }

    // ─── expireOpen ────────────────────────────────────────────────────────────

    function test_expireOpen_success() public {
        bytes32 id = _challengeId(11);
        _createAliceChallenge(id);
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.warp(block.timestamp + DURATION + 1);
        escrow.expireOpen(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + STAKE);
        assertEq(uint8(escrow.getChallenge(id).status), uint8(ChallengeEscrow.Status.Expired));
    }

    function test_expireOpen_revert_notExpired() public {
        bytes32 id = _challengeId(12);
        _createAliceChallenge(id);
        vm.expectRevert(ChallengeEscrow.ChallengeNotExpired.selector);
        escrow.expireOpen(id);
    }

    // ─── expireAccepted ────────────────────────────────────────────────────────

    function test_expireAccepted_success() public {
        bytes32 id = _challengeId(13);
        _createAliceChallenge(id);
        _bobAccepts(id);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.warp(block.timestamp + DURATION + 1);
        escrow.expireAccepted(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + STAKE);
        assertEq(usdc.balanceOf(bob), bobBefore + STAKE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(escrow.getChallenge(id).status), uint8(ChallengeEscrow.Status.Expired));
    }

    function test_expireAccepted_revert_notExpired() public {
        bytes32 id = _challengeId(14);
        _createAliceChallenge(id);
        _bobAccepts(id);
        vm.expectRevert(ChallengeEscrow.ChallengeNotExpired.selector);
        escrow.expireAccepted(id);
    }

    // ─── walkover ──────────────────────────────────────────────────────────────

    function test_walkover_success() public {
        bytes32 id = _challengeId(15);
        _createAliceChallenge(id);
        _bobAccepts(id);

        vm.warp(block.timestamp + DURATION + 1);

        uint256 aliceBefore = usdc.balanceOf(alice);
        bytes memory sig = _signWalkover(id, alice);
        escrow.walkover(id, alice, sig);

        uint256 expectedPayout = (STAKE * 2 * 9000) / 10_000;
        assertEq(usdc.balanceOf(alice), aliceBefore + expectedPayout);
        assertEq(uint8(escrow.getChallenge(id).status), uint8(ChallengeEscrow.Status.Walkover));
    }

    function test_walkover_revert_notExpired() public {
        bytes32 id = _challengeId(16);
        _createAliceChallenge(id);
        _bobAccepts(id);
        bytes memory sig = _signWalkover(id, alice);
        vm.expectRevert(ChallengeEscrow.ChallengeNotExpired.selector);
        escrow.walkover(id, alice, sig);
    }

    function test_walkover_revert_badSignature() public {
        bytes32 id = _challengeId(17);
        _createAliceChallenge(id);
        _bobAccepts(id);
        vm.warp(block.timestamp + DURATION + 1);

        // Wrong key
        uint256 badPk = 0xbadbadbad;
        bytes32 digest = keccak256(abi.encode(id, alice, "walkover", address(escrow), block.chainid));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(badPk, ethDigest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert(ChallengeEscrow.BadSignature.selector);
        escrow.walkover(id, alice, badSig);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function test_setFeeVault() public {
        address newVault = address(0xBEEF);
        escrow.setFeeVault(newVault);
        assertEq(escrow.feeVault(), newVault);
    }

    function test_setFeeVault_revert_zeroAddress() public {
        vm.expectRevert(ChallengeEscrow.ZeroAddress.selector);
        escrow.setFeeVault(address(0));
    }

    function test_setTrustedSigner() public {
        address newSigner = address(0xDEAD);
        escrow.setTrustedSigner(newSigner);
        assertEq(escrow.trustedSigner(), newSigner);
    }

    function test_emergencyWithdraw() public {
        bytes32 id = _challengeId(18);
        _createAliceChallenge(id);

        address recipient = address(0x1234);
        escrow.emergencyWithdraw(recipient);
        assertEq(usdc.balanceOf(recipient), STAKE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ─── Fee Math Invariant ────────────────────────────────────────────────────

    function test_feeMath_invariant() public {
        // Verify: fee + payout == totalPool always
        bytes32 id = _challengeId(19);
        _createAliceChallenge(id);
        _bobAccepts(id);

        uint256 escrowBefore = usdc.balanceOf(address(escrow));
        uint256 vaultBefore = usdc.balanceOf(feeVault);
        uint256 aliceBefore = usdc.balanceOf(alice);

        bytes memory sig = _signSettle(id, alice, 200, 100);
        escrow.settle(id, alice, 200, 100, sig);

        uint256 aliceReceived = usdc.balanceOf(alice) - aliceBefore;
        uint256 feeCollected = usdc.balanceOf(feeVault) - vaultBefore;

        assertEq(aliceReceived + feeCollected, escrowBefore, "fee invariant broken");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow should be empty");
    }
}
