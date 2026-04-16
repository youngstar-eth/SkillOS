// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ArcadePool} from "../src/ArcadePool.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Simple mintable ERC20 for test pool payments.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract ArcadePoolTest is Test {
    ArcadePool pool;
    MockUSDC usdc;

    // Signer pair — the test signs typed data, contract recovers with this address.
    uint256 internal constant SIGNER_PK =
        0xA11CE00000000000000000000000000000000000000000000000000000000001;
    address internal signer;

    address internal owner = address(this);
    address internal feeRecipient = address(0xFEE);

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA801);

    uint256 internal constant ENTRY_FEE = 10e6; // 10 USDC
    uint256 internal constant DURATION = 1 hours;

    bytes32 internal constant SCORE_TYPEHASH = keccak256(
        "Score(uint256 tournamentId,address player,uint256 score,uint256 nonce)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    event TournamentCreated(uint256 indexed id, bytes32 gameId, uint256 entryFee, uint256 endTime);
    event PlayerEntered(uint256 indexed id, address indexed player);
    event ScoreSubmitted(uint256 indexed id, address indexed player, uint256 score);
    event TournamentSettled(uint256 indexed id, address indexed winner, uint256 prize);

    function setUp() public {
        signer = vm.addr(SIGNER_PK);
        usdc = new MockUSDC();
        pool = new ArcadePool(address(usdc), signer, feeRecipient);

        // Fund players
        usdc.mint(alice, 100e6);
        usdc.mint(bob, 100e6);
        usdc.mint(carol, 100e6);
        vm.prank(alice); usdc.approve(address(pool), type(uint256).max);
        vm.prank(bob); usdc.approve(address(pool), type(uint256).max);
        vm.prank(carol); usdc.approve(address(pool), type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("ArcadePool")),
                keccak256(bytes("1")),
                block.chainid,
                address(pool)
            )
        );
    }

    function _sign(
        uint256 pk,
        uint256 tournamentId,
        address player,
        uint256 score,
        uint256 nonce
    ) internal view returns (bytes memory sig) {
        bytes32 structHash = keccak256(
            abi.encode(SCORE_TYPEHASH, tournamentId, player, score, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _createDefaultTournament() internal returns (uint256 id) {
        return pool.createTournament(bytes32("2048"), ENTRY_FEE, DURATION);
    }

    // ---------------------------------------------------------------------
    // Tests
    // ---------------------------------------------------------------------

    // 2. createTournament → ID 0 + struct correct
    function test_CreateTournament_AssignsIncrementingIdAndStores() public {
        uint256 id = _createDefaultTournament();
        assertEq(id, 0);

        ArcadePool.Tournament memory t = pool.getTournament(id);
        assertEq(t.gameId, bytes32("2048"));
        assertEq(t.entryFee, ENTRY_FEE);
        assertEq(t.startTime, block.timestamp);
        assertEq(t.endTime, block.timestamp + DURATION);
        assertEq(t.totalPool, 0);
        assertEq(t.creator, address(this));
        assertEq(t.winner, address(0));
        assertEq(t.winnerScore, 0);
        assertFalse(t.settled);

        // next id increments
        uint256 id2 = pool.createTournament(bytes32("wordle"), ENTRY_FEE, DURATION);
        assertEq(id2, 1);
    }

    function test_CreateTournament_RevertsOnZeroFee() public {
        vm.expectRevert(bytes("Entry fee required"));
        pool.createTournament(bytes32("2048"), 0, DURATION);
    }

    function test_CreateTournament_RevertsOnOutOfRangeDuration() public {
        vm.expectRevert(bytes("Invalid duration"));
        pool.createTournament(bytes32("2048"), ENTRY_FEE, 30 seconds);
        vm.expectRevert(bytes("Invalid duration"));
        pool.createTournament(bytes32("2048"), ENTRY_FEE, 8 days);
    }

    // 3. enter transfers USDC, flips hasEntered, increments pool
    function test_Enter_TransfersEscrowsAndRecordsPlayer() public {
        uint256 id = _createDefaultTournament();

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 poolBefore = usdc.balanceOf(address(pool));

        vm.expectEmit(true, true, false, false);
        emit PlayerEntered(id, alice);
        vm.prank(alice);
        pool.enter(id);

        assertEq(usdc.balanceOf(alice), aliceBefore - ENTRY_FEE);
        assertEq(usdc.balanceOf(address(pool)), poolBefore + ENTRY_FEE);
        assertTrue(pool.hasEntered(id, alice));
        assertEq(pool.getPlayerCount(id), 1);

        ArcadePool.Tournament memory t = pool.getTournament(id);
        assertEq(t.totalPool, ENTRY_FEE);
    }

    // 4. double enter → reverts
    function test_Enter_RevertsOnDoubleEntry() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        vm.prank(alice);
        vm.expectRevert(bytes("Already entered"));
        pool.enter(id);
    }

    function test_Enter_RevertsOnNonExistentTournament() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Tournament does not exist"));
        pool.enter(999);
    }

    function test_Enter_RevertsAfterEndTime() public {
        uint256 id = _createDefaultTournament();
        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(alice);
        vm.expectRevert(bytes("Tournament ended"));
        pool.enter(id);
    }

    // 5. submitScore with valid sig → recorded + winner updated
    function test_SubmitScore_ValidSignatureRecordsAndUpdatesWinner() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        vm.prank(bob);   pool.enter(id);

        uint256 nonceA = uint256(keccak256("a"));
        bytes memory sigA = _sign(SIGNER_PK, id, alice, 1024, nonceA);

        vm.expectEmit(true, true, false, true);
        emit ScoreSubmitted(id, alice, 1024);
        vm.prank(alice);
        pool.submitScore(id, 1024, nonceA, sigA);

        assertEq(pool.playerScores(id, alice), 1024);
        ArcadePool.Tournament memory t = pool.getTournament(id);
        assertEq(t.winner, alice);
        assertEq(t.winnerScore, 1024);

        // Bob submits higher score → becomes winner
        uint256 nonceB = uint256(keccak256("b"));
        bytes memory sigB = _sign(SIGNER_PK, id, bob, 2048, nonceB);
        vm.prank(bob);
        pool.submitScore(id, 2048, nonceB, sigB);

        t = pool.getTournament(id);
        assertEq(t.winner, bob);
        assertEq(t.winnerScore, 2048);
    }

    // Lower submit does NOT demote existing best
    function test_SubmitScore_LowerDoesNotLowerPlayerBest() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        uint256 n1 = 1;
        uint256 n2 = 2;
        vm.prank(alice);
        pool.submitScore(id, 1024, n1, _sign(SIGNER_PK, id, alice, 1024, n1));
        vm.prank(alice);
        pool.submitScore(id, 512, n2, _sign(SIGNER_PK, id, alice, 512, n2));
        assertEq(pool.playerScores(id, alice), 1024);
    }

    // 6. submitScore with bad signature → reverts
    function test_SubmitScore_RevertsOnInvalidSignature() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        uint256 nonce = 42;
        uint256 wrongPk =
            0xBAD0000000000000000000000000000000000000000000000000000000000001;
        bytes memory wrongSig = _sign(wrongPk, id, alice, 500, nonce);
        vm.prank(alice);
        vm.expectRevert(bytes("Invalid signature"));
        pool.submitScore(id, 500, nonce, wrongSig);
    }

    function test_SubmitScore_RevertsIfNotEntered() public {
        uint256 id = _createDefaultTournament();
        uint256 nonce = 7;
        bytes memory sig = _sign(SIGNER_PK, id, alice, 100, nonce);
        vm.prank(alice);
        vm.expectRevert(bytes("Not entered"));
        pool.submitScore(id, 100, nonce, sig);
    }

    // 7. same nonce twice → reverts
    function test_SubmitScore_RevertsOnReusedNonce() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        uint256 nonce = 99;
        bytes memory sig1 = _sign(SIGNER_PK, id, alice, 500, nonce);
        vm.prank(alice);
        pool.submitScore(id, 500, nonce, sig1);

        // Same nonce — even a different score request with a valid sig must revert.
        bytes memory sig2 = _sign(SIGNER_PK, id, alice, 700, nonce);
        vm.prank(alice);
        vm.expectRevert(bytes("Nonce used"));
        pool.submitScore(id, 700, nonce, sig2);
    }

    // 8. submit after end → reverts
    function test_SubmitScore_RevertsAfterEndTime() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        vm.warp(block.timestamp + DURATION + 1);
        uint256 nonce = 1;
        bytes memory sig = _sign(SIGNER_PK, id, alice, 100, nonce);
        vm.prank(alice);
        vm.expectRevert(bytes("Tournament ended"));
        pool.submitScore(id, 100, nonce, sig);
    }

    // 9. settle before end → reverts
    function test_Settle_RevertsBeforeEnd() public {
        uint256 id = _createDefaultTournament();
        vm.expectRevert(bytes("Still active"));
        pool.settle(id);
    }

    // 10. settle distributes 90 / 10
    function test_Settle_DistributesPrizeMinusProtocolFee() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        vm.prank(bob);   pool.enter(id);
        vm.prank(carol); pool.enter(id);

        uint256 n = 1;
        bytes memory sig = _sign(SIGNER_PK, id, alice, 2048, n);
        vm.prank(alice);
        pool.submitScore(id, 2048, n, sig);

        vm.warp(block.timestamp + DURATION + 1);

        uint256 totalPool = 3 * ENTRY_FEE;
        uint256 fee = (totalPool * 1000) / 10000; // 10%
        uint256 prize = totalPool - fee;

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 feeBefore = usdc.balanceOf(feeRecipient);

        vm.expectEmit(true, true, false, true);
        emit TournamentSettled(id, alice, prize);
        pool.settle(id);

        assertEq(usdc.balanceOf(alice) - aliceBefore, prize);
        assertEq(usdc.balanceOf(feeRecipient) - feeBefore, fee);
        assertTrue(pool.getTournament(id).settled);
    }

    // 11. settle twice → reverts
    function test_Settle_RevertsIfAlreadySettled() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        uint256 n = 1;
        vm.prank(alice);
        pool.submitScore(id, 500, n, _sign(SIGNER_PK, id, alice, 500, n));
        vm.warp(block.timestamp + DURATION + 1);
        pool.settle(id);
        vm.expectRevert(bytes("Already settled"));
        pool.settle(id);
    }

    function test_Settle_RevertsWithNoWinner() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        vm.warp(block.timestamp + DURATION + 1);
        vm.expectRevert(bytes("No winner"));
        pool.settle(id);
    }

    // 12. refundIfEmpty → everyone's money back
    function test_RefundIfEmpty_RefundsAllEntrants() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        vm.prank(bob);   pool.enter(id);
        uint256 aliceMid = usdc.balanceOf(alice);
        uint256 bobMid = usdc.balanceOf(bob);

        vm.warp(block.timestamp + DURATION + 1);
        pool.refundIfEmpty(id);

        assertEq(usdc.balanceOf(alice) - aliceMid, ENTRY_FEE);
        assertEq(usdc.balanceOf(bob) - bobMid, ENTRY_FEE);
        assertEq(usdc.balanceOf(address(pool)), 0);
        assertTrue(pool.getTournament(id).settled);
    }

    function test_RefundIfEmpty_RevertsIfHasWinner() public {
        uint256 id = _createDefaultTournament();
        vm.prank(alice); pool.enter(id);
        uint256 n = 1;
        vm.prank(alice);
        pool.submitScore(id, 123, n, _sign(SIGNER_PK, id, alice, 123, n));
        vm.warp(block.timestamp + DURATION + 1);
        vm.expectRevert(bytes("Has winner"));
        pool.refundIfEmpty(id);
    }

    // 13. Admin gates
    function test_Admin_OnlyOwnerCanSetScoreSigner() public {
        address newSigner = address(0xDEAD);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice)
        );
        pool.setScoreSigner(newSigner);

        pool.setScoreSigner(newSigner);
        assertEq(pool.scoreSigner(), newSigner);
    }

    function test_Admin_SetProtocolFeeCappedAt3000Bps() public {
        pool.setProtocolFee(2500);
        assertEq(pool.protocolFeeBps(), 2500);

        vm.expectRevert(bytes("Max 30%"));
        pool.setProtocolFee(3001);
    }

    function test_Admin_OnlyOwnerCanSetFeeRecipient() public {
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob)
        );
        pool.setFeeRecipient(bob);

        pool.setFeeRecipient(bob);
        assertEq(pool.feeRecipient(), bob);
    }
}
