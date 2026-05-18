// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArcadePool} from "../../src/ArcadePool.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// X11.1 M-1 PullPayment pattern (SPEC docs/sprints/x11-v2-2/SPEC.md §B + §H.2).
// Verifies refundIfEmpty accrues per-player credits and withdrawRefund pulls
// safely. Anchors the DoS-vector invariants from v1.4 §3.11 Track A audit M-1.

contract _PullPaymentMockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// @dev Reverts on receive — models a smart wallet whose hook reverts or
/// a Circle-blacklisted address. Used to prove M-1 invariant: a single
/// poisoned receiver cannot DoS the refund batch.
contract RevertingReceiver {
    ArcadePool public pool;
    constructor(ArcadePool _pool) { pool = _pool; }
    function enter(uint256 id) external { pool.enter(id); }
    function pull(uint256 id) external { pool.withdrawRefund(id); }
}

/// @dev Approves; then this receiver reverts on incoming transfers via a
/// token-side hook. We model that by having the malicious USDC revert when
/// transferring to this specific address.
contract BlacklistableUSDC is ERC20 {
    mapping(address => bool) public blocked;
    constructor() ERC20("Block USDC", "bUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
    function setBlocked(address who, bool b) external { blocked[who] = b; }
    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "USDC blacklist");
        super._update(from, to, value);
    }
}

/// @dev USDC that re-enters withdrawRefund mid-transfer. Verifies the
/// nonReentrant guard + CEI ordering on the pull path.
contract ReentrantUSDC is ERC20 {
    ArcadePool public pool;
    uint256 public targetTournamentId;
    bool public attackArmed;
    constructor() ERC20("Reentrant USDC", "rUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
    function setPool(ArcadePool _pool) external { pool = _pool; }
    function armAttack(uint256 id) external { targetTournamentId = id; attackArmed = true; }
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (attackArmed && from == address(pool)) {
            attackArmed = false; // single-shot to avoid infinite loop on test failure
            // Re-enter; expected to revert with ReentrancyGuardReentrantCall
            pool.withdrawRefund(targetTournamentId);
        }
    }
}

contract ArcadePoolPullPaymentTest is Test {
    ArcadePool pool;
    _PullPaymentMockUSDC usdc;

    uint256 internal constant SIGNER_PK =
        0xA11CE00000000000000000000000000000000000000000000000000000000001;
    address internal signer;
    address internal feeRecipient = address(0xFEE);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA801);

    uint256 internal constant ENTRY_FEE = 10e6;
    uint256 internal constant DURATION = 1 hours;

    event RefundsAccrued(uint256 indexed tournamentId, uint256 playerCount, uint256 entryFee);
    event RefundWithdrawn(uint256 indexed tournamentId, address indexed player, uint256 amount);

    function setUp() public {
        signer = vm.addr(SIGNER_PK);
        usdc = new _PullPaymentMockUSDC();
        pool = new ArcadePool(address(usdc), signer, feeRecipient);
        _fundAndApprove(alice);
        _fundAndApprove(bob);
        _fundAndApprove(carol);
    }

    function _fundAndApprove(address who) internal {
        usdc.mint(who, 1000e6);
        vm.prank(who);
        usdc.approve(address(pool), type(uint256).max);
    }

    function _createTournament() internal returns (uint256 id) {
        return pool.createTournament(bytes32("2048"), ENTRY_FEE, DURATION);
    }

    // -------------------------------------------------------------------
    // Test 1 — credits accrue + RefundsAccrued event emitted
    // -------------------------------------------------------------------
    function test_refundIfEmpty_AccruesCreditsAndEmitsEvent() public {
        uint256 id = _createTournament();
        vm.prank(alice); pool.enter(id);
        vm.prank(bob);   pool.enter(id);
        vm.prank(carol); pool.enter(id);

        vm.warp(block.timestamp + DURATION + 1);

        vm.expectEmit(true, false, false, true);
        emit RefundsAccrued(id, 3, ENTRY_FEE);
        pool.refundIfEmpty(id);

        assertEq(pool.refundableBalance(id, alice), ENTRY_FEE);
        assertEq(pool.refundableBalance(id, bob),   ENTRY_FEE);
        assertEq(pool.refundableBalance(id, carol), ENTRY_FEE);
        assertEq(usdc.balanceOf(address(pool)), 3 * ENTRY_FEE, "pool retains until pull");
        assertTrue(pool.getTournament(id).settled);
    }

    // -------------------------------------------------------------------
    // Test 2 — withdrawRefund happy path: transfers + zeroes + emits
    // -------------------------------------------------------------------
    function test_withdrawRefund_HappyPath() public {
        uint256 id = _createTournament();
        vm.prank(alice); pool.enter(id);
        vm.warp(block.timestamp + DURATION + 1);
        pool.refundIfEmpty(id);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.expectEmit(true, true, false, true);
        emit RefundWithdrawn(id, alice, ENTRY_FEE);
        vm.prank(alice);
        pool.withdrawRefund(id);

        assertEq(usdc.balanceOf(alice) - aliceBefore, ENTRY_FEE);
        assertEq(pool.refundableBalance(id, alice), 0, "credit drained after pull");
    }

    // -------------------------------------------------------------------
    // Test 3 — NoRefundAvailable revert when balance is zero (incl. double pull)
    // -------------------------------------------------------------------
    function test_withdrawRefund_RevertsWhenNoBalance() public {
        uint256 id = _createTournament();
        vm.prank(alice); pool.enter(id);
        vm.warp(block.timestamp + DURATION + 1);
        pool.refundIfEmpty(id);

        // First pull succeeds
        vm.prank(alice);
        pool.withdrawRefund(id);

        // Second pull reverts (credit zeroed)
        vm.prank(alice);
        vm.expectRevert(ArcadePool.NoRefundAvailable.selector);
        pool.withdrawRefund(id);

        // Non-entrant has never had credit — same revert
        vm.prank(bob);
        vm.expectRevert(ArcadePool.NoRefundAvailable.selector);
        pool.withdrawRefund(id);
    }

    // -------------------------------------------------------------------
    // Test 4 — Reentrancy guard blocks malicious USDC re-entering withdrawRefund
    // -------------------------------------------------------------------
    function test_withdrawRefund_ReentrancyProtected() public {
        ReentrantUSDC bad = new ReentrantUSDC();
        ArcadePool reentryPool = new ArcadePool(address(bad), signer, feeRecipient);
        bad.setPool(reentryPool);
        bad.mint(alice, 1000e6);
        vm.prank(alice); bad.approve(address(reentryPool), type(uint256).max);

        uint256 id = reentryPool.createTournament(bytes32("g"), ENTRY_FEE, DURATION);
        vm.prank(alice); reentryPool.enter(id);
        vm.warp(block.timestamp + DURATION + 1);
        reentryPool.refundIfEmpty(id);

        bad.armAttack(id);

        // Outer call reverts due to reentry attempt inside the token transfer.
        // Expected reason: ReentrancyGuardReentrantCall (OZ) bubbles up through SafeERC20.
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        reentryPool.withdrawRefund(id);

        // Credit was zeroed before the transfer (CEI) — state rolls back on revert,
        // so balance must still be present for honest retry.
        assertEq(reentryPool.refundableBalance(id, alice), ENTRY_FEE, "CEI + revert preserves credit");
    }

    // -------------------------------------------------------------------
    // Test 5 — SPEC §H.2 KEY M-1 INV:
    //   reverting receiver cannot DoS other players' refunds
    // -------------------------------------------------------------------
    function test_revertingReceiver_doesNotBlockOthers() public {
        // Replace USDC with blacklistable variant for this isolated scenario
        BlacklistableUSDC bUsdc = new BlacklistableUSDC();
        ArcadePool isoPool = new ArcadePool(address(bUsdc), signer, feeRecipient);

        bUsdc.mint(alice, 1000e6);
        bUsdc.mint(bob,   1000e6);
        bUsdc.mint(carol, 1000e6);
        vm.prank(alice); bUsdc.approve(address(isoPool), type(uint256).max);
        vm.prank(bob);   bUsdc.approve(address(isoPool), type(uint256).max);
        vm.prank(carol); bUsdc.approve(address(isoPool), type(uint256).max);

        uint256 id = isoPool.createTournament(bytes32("g"), ENTRY_FEE, DURATION);
        vm.prank(alice); isoPool.enter(id);
        vm.prank(bob);   isoPool.enter(id);
        vm.prank(carol); isoPool.enter(id);

        vm.warp(block.timestamp + DURATION + 1);
        // refundIfEmpty no longer transfers — accrues only. Blacklist applies on pull.
        isoPool.refundIfEmpty(id);
        bUsdc.setBlocked(bob, true);

        // Alice pulls successfully (M-1: not blocked by bob's poison)
        uint256 aliceBefore = bUsdc.balanceOf(alice);
        vm.prank(alice); isoPool.withdrawRefund(id);
        assertEq(bUsdc.balanceOf(alice) - aliceBefore, ENTRY_FEE);

        // Bob's pull reverts — his own problem, NO spillover
        vm.prank(bob);
        vm.expectRevert(bytes("USDC blacklist"));
        isoPool.withdrawRefund(id);
        assertEq(isoPool.refundableBalance(id, bob), ENTRY_FEE, "bob credit preserved on revert");

        // Carol pulls successfully — proves the batch is NOT DoS'd
        uint256 carolBefore = bUsdc.balanceOf(carol);
        vm.prank(carol); isoPool.withdrawRefund(id);
        assertEq(bUsdc.balanceOf(carol) - carolBefore, ENTRY_FEE);
    }

    // -------------------------------------------------------------------
    // Test 6 — SPEC §H.2 gas-bounded: accrual O(N), pull O(1)
    //   Budgets per SPEC: refundIfEmpty < 5M gas at 100 players, pull < 100k
    // -------------------------------------------------------------------
    function test_gasBounded_refundAccrualAndPull() public {
        uint256 N = 100;
        uint256 id = _createTournament();

        // Seed 100 distinct players + entries
        for (uint256 i; i < N; ++i) {
            address p = address(uint160(0x1000 + i));
            usdc.mint(p, ENTRY_FEE);
            vm.prank(p); usdc.approve(address(pool), type(uint256).max);
            vm.prank(p); pool.enter(id);
        }

        vm.warp(block.timestamp + DURATION + 1);

        uint256 gasBefore = gasleft();
        pool.refundIfEmpty(id);
        uint256 accrualGas = gasBefore - gasleft();
        assertLt(accrualGas, 5_000_000, "accrual must stay under 5M for N=100");

        // Measure a single pull
        address p0 = address(uint160(0x1000));
        vm.prank(p0);
        uint256 gasPullBefore = gasleft();
        pool.withdrawRefund(id);
        uint256 pullGas = gasPullBefore - gasleft();
        assertLt(pullGas, 100_000, "pull must stay under 100k per player");
    }

    // -------------------------------------------------------------------
    // Test 7 — credit isolation across multiple tournaments for same player
    // -------------------------------------------------------------------
    function test_refundIfEmpty_AcrossMultipleTournaments() public {
        uint256 id1 = _createTournament();
        uint256 id2 = pool.createTournament(bytes32("wordle"), ENTRY_FEE * 3, DURATION);

        vm.prank(alice); pool.enter(id1);
        vm.prank(alice); pool.enter(id2);

        vm.warp(block.timestamp + DURATION + 1);
        pool.refundIfEmpty(id1);
        pool.refundIfEmpty(id2);

        assertEq(pool.refundableBalance(id1, alice), ENTRY_FEE);
        assertEq(pool.refundableBalance(id2, alice), ENTRY_FEE * 3);

        // Pull id1 — id2 credit untouched
        vm.prank(alice); pool.withdrawRefund(id1);
        assertEq(pool.refundableBalance(id1, alice), 0);
        assertEq(pool.refundableBalance(id2, alice), ENTRY_FEE * 3, "tournament credits isolated");

        // Pull id2
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice); pool.withdrawRefund(id2);
        assertEq(usdc.balanceOf(alice) - aliceBefore, ENTRY_FEE * 3);
    }

    // -------------------------------------------------------------------
    // Test 8 — public mapping accessor returns correct credit
    // -------------------------------------------------------------------
    function test_refundableBalance_PublicAccessor() public {
        uint256 id = _createTournament();
        vm.prank(alice); pool.enter(id);

        // Before refundIfEmpty: zero
        assertEq(pool.refundableBalance(id, alice), 0);

        vm.warp(block.timestamp + DURATION + 1);
        pool.refundIfEmpty(id);

        // After: equal to entry fee
        assertEq(pool.refundableBalance(id, alice), ENTRY_FEE);

        // Non-entrant always zero
        assertEq(pool.refundableBalance(id, bob), 0);

        // Non-existent tournament always zero
        assertEq(pool.refundableBalance(99, alice), 0);
    }
}
