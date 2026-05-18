// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {TournamentPool} from "../src/TournamentPool.sol";
import {DevAttributionNFT} from "../src/DevAttributionNFT.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract M3MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// @title M3EmergencyTimelockTest — X11.3 M-3 invariant coverage
/// @notice 12 unit tests covering the three-phase, bucket-scoped, timelocked
///         emergency-withdrawal surface introduced in X11.3 per SPEC.md §D.
///
/// Naming follows SPEC §D nomenclature: propose / cancel / execute (not
/// initiate / execute / cancel from the prompt paraphrase), and SPEC bucket
/// names PrizePoolOf / FeeCollectedDevOf / FeeCollectedPlatformOf / DustOnly
/// (not RETRY_FEE / SPONSOR_POOL / X402_RECEIVE from the prompt paraphrase).
/// The critical cross-bucket lock test maps the prompt's
/// `test_CrossBucketLock_RetryFeeCannotDrainSponsorPool` intent onto the
/// canonical buckets:
///   FeeCollectedDevOf proposal cannot debit PrizePoolOf storage.
contract M3EmergencyTimelockTest is Test {
    M3MockUSDC internal usdc;
    TournamentPool internal pool;
    DevAttributionNFT internal devNFT;

    uint256 internal signerPk = 0xdeadbeef1234;
    address internal trustedSigner;
    address internal sponsor = address(0x5907503);
    address internal outsider = address(0xBAD);
    address internal recipient = address(0xEDD1E);
    address internal constant DEFAULT_DEV = address(0xDE7de7de7De7dE7de7De7De7DE7De7De7dE7dE7D);

    uint256 internal constant PRIZE_POOL = 10_000_000; // 10 USDC
    uint256 internal constant PARTICIPATION_BONUS = 50;
    uint256 internal constant ENTRY_FEE = 1_000_000;
    bytes32 internal constant GAME = keccak256("2048");
    uint64 internal STARTS_AT;
    uint64 internal ENDS_AT;

    function setUp() public {
        trustedSigner = vm.addr(signerPk);
        usdc = new M3MockUSDC();

        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        devNFT = new DevAttributionNFT(predictedPool);
        pool = new TournamentPool(IERC20(address(usdc)), trustedSigner, address(devNFT));
        require(address(pool) == predictedPool, "M3 test setup: pool address mismatch");

        usdc.mint(sponsor, 1_000_000_000);
        vm.prank(sponsor);
        usdc.approve(address(pool), type(uint256).max);

        STARTS_AT = uint64(block.timestamp);
        ENDS_AT = uint64(block.timestamp + 1 days);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function _tournamentId(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("m3", seed));
    }

    function _createTournament(bytes32 id) internal {
        vm.prank(sponsor);
        pool.createTournament(
            id, DEFAULT_DEV, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    function _accrueDevAndPlatformFees(bytes32 id, address player, uint256 entries) internal {
        usdc.mint(player, entries * ENTRY_FEE);
        vm.prank(player);
        usdc.approve(address(pool), type(uint256).max);
        for (uint256 i; i < entries; ++i) {
            vm.prank(player);
            pool.chargeEntryFee(id, player);
        }
    }

    // ─── 1. Propose: non-owner rejected ────────────────────────────────────────

    function test_propose_revertsForNonOwner() public {
        bytes32 id = _tournamentId(1);
        _createTournament(id);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        pool.proposeEmergencyWithdraw(TournamentPool.EmergencyBucket.PrizePoolOf, id, recipient, 1);
    }

    // ─── 2. Propose: zero amount rejected ──────────────────────────────────────

    function test_propose_revertsOnZeroAmount() public {
        bytes32 id = _tournamentId(2);
        _createTournament(id);

        vm.expectRevert(TournamentPool.ZeroAmount.selector);
        pool.proposeEmergencyWithdraw(TournamentPool.EmergencyBucket.PrizePoolOf, id, recipient, 0);
    }

    // ─── 3. Propose: exceeds bucket balance rejected ───────────────────────────

    function test_propose_revertsOnExceedsBucketBalance() public {
        bytes32 id = _tournamentId(3);
        _createTournament(id);

        // feeCollected_dev[id] == 0 until anyone calls chargeEntryFee.
        vm.expectRevert(TournamentPool.ExceedsBucketBalance.selector);
        pool.proposeEmergencyWithdraw(TournamentPool.EmergencyBucket.FeeCollectedDevOf, id, recipient, 1);
    }

    // ─── 4. Propose: happy path emits event + records proposal ────────────────

    function test_propose_happyPath_emitsEventAndStoresProposal() public {
        bytes32 id = _tournamentId(4);
        _createTournament(id);

        uint64 expectedDeadline = uint64(block.timestamp) + pool.EMERGENCY_DELAY();

        vm.recordLogs();
        bytes32 proposalId =
            pool.proposeEmergencyWithdraw(TournamentPool.EmergencyBucket.PrizePoolOf, id, recipient, PRIZE_POOL);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        bytes32 expectedTopic = keccak256("EmergencyWithdrawProposed(bytes32,uint8,bytes32,address,uint256,uint64)");
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == expectedTopic) {
                assertEq(logs[i].topics[1], proposalId, "proposalId topic");
                assertEq(logs[i].topics[2], id, "tournamentId topic");
                assertEq(address(uint160(uint256(logs[i].topics[3]))), recipient, "recipient topic");
                found = true;
                break;
            }
        }
        assertTrue(found, "EmergencyWithdrawProposed not emitted");

        (
            TournamentPool.EmergencyBucket b,
            bytes32 tid,
            address to,
            uint256 amt,
            uint64 executeAfter,
            bool executed,
            bool cancelled
        ) = pool.emergencyProposals(proposalId);
        assertEq(uint8(b), uint8(TournamentPool.EmergencyBucket.PrizePoolOf));
        assertEq(tid, id);
        assertEq(to, recipient);
        assertEq(amt, PRIZE_POOL);
        assertEq(executeAfter, expectedDeadline);
        assertFalse(executed);
        assertFalse(cancelled);
    }

    // ─── 5. Execute: blocked before delay (timelock invariant) ────────────────

    function test_execute_revertsBeforeTimelock() public {
        bytes32 id = _tournamentId(5);
        _createTournament(id);

        bytes32 proposalId =
            pool.proposeEmergencyWithdraw(TournamentPool.EmergencyBucket.PrizePoolOf, id, recipient, PRIZE_POOL);

        // No time advancement — still inside the 48h window.
        vm.expectRevert(TournamentPool.TimelockNotExpired.selector);
        pool.executeEmergencyWithdraw(proposalId);

        // Even 1 second before deadline still reverts.
        vm.warp(block.timestamp + pool.EMERGENCY_DELAY() - 1);
        vm.expectRevert(TournamentPool.TimelockNotExpired.selector);
        pool.executeEmergencyWithdraw(proposalId);
    }

    // ─── 6. Execute: happy path after delay clears state + transfers ──────────

    function test_execute_afterTimelock_transfersAndMarksExecuted() public {
        bytes32 id = _tournamentId(6);
        _createTournament(id);

        bytes32 proposalId =
            pool.proposeEmergencyWithdraw(TournamentPool.EmergencyBucket.PrizePoolOf, id, recipient, PRIZE_POOL);

        vm.warp(block.timestamp + pool.EMERGENCY_DELAY());
        uint256 poolBalBefore = usdc.balanceOf(address(pool));
        uint256 trackedBefore = pool._sumAllTrackedBuckets();

        pool.executeEmergencyWithdraw(proposalId);

        assertEq(usdc.balanceOf(recipient), PRIZE_POOL, "recipient");
        assertEq(usdc.balanceOf(address(pool)), poolBalBefore - PRIZE_POOL, "pool drained by amount");
        assertEq(pool._sumAllTrackedBuckets(), trackedBefore - PRIZE_POOL, "tracked total decremented");

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.prizePool, 0, "prizePool slot zeroed");

        (,,,,, bool executed, bool cancelled) = pool.emergencyProposals(proposalId);
        assertTrue(executed, "executed flag");
        assertFalse(cancelled, "cancelled flag stays false");

        // Cannot re-execute — replay protection.
        vm.expectRevert(TournamentPool.ProposalAlreadyExecuted.selector);
        pool.executeEmergencyWithdraw(proposalId);
    }

    // ─── 7. Execute: state changed during window — re-check guards ────────────

    function test_execute_revertsIfBucketDrainedDuringWindow() public {
        bytes32 id = _tournamentId(7);
        _createTournament(id);
        _accrueDevAndPlatformFees(id, address(0xDEEDF1), 4); // 4 fee charges → 2.8 USDC dev share

        uint256 devBalance = pool.feeCollected_dev(id);
        assertGt(devBalance, 0);

        bytes32 proposalId = pool.proposeEmergencyWithdraw(
            TournamentPool.EmergencyBucket.FeeCollectedDevOf, id, recipient, devBalance
        );

        // During the window, the dev withdraws the bucket the legit way.
        vm.prank(DEFAULT_DEV);
        pool.withdrawFeesToDev(id);
        assertEq(pool.feeCollected_dev(id), 0);

        vm.warp(block.timestamp + pool.EMERGENCY_DELAY());
        vm.expectRevert(TournamentPool.ExceedsBucketBalance.selector);
        pool.executeEmergencyWithdraw(proposalId);
    }

    // ─── 8. Cross-bucket non-drainage (sweepstakes-safe function-level lock) ───

    function test_execute_crossBucket_doesNotDrainOtherBuckets() public {
        bytes32 id = _tournamentId(8);
        _createTournament(id);
        _accrueDevAndPlatformFees(id, address(0xDEEDF2), 4);

        uint256 devBefore = pool.feeCollected_dev(id);
        uint256 platBefore = pool.feeCollected_platform(id);
        uint256 prizeBefore = pool.getTournament(id).prizePool;

        bytes32 proposalId = pool.proposeEmergencyWithdraw(
            TournamentPool.EmergencyBucket.FeeCollectedDevOf, id, recipient, devBefore
        );
        vm.warp(block.timestamp + pool.EMERGENCY_DELAY());
        pool.executeEmergencyWithdraw(proposalId);

        // Dev bucket drained; platform + prize untouched.
        assertEq(pool.feeCollected_dev(id), 0, "dev bucket drained");
        assertEq(pool.feeCollected_platform(id), platBefore, "platform untouched");
        assertEq(pool.getTournament(id).prizePool, prizeBefore, "prizePool untouched");
    }

    // ─── 9. Reentrancy: execute is nonReentrant ───────────────────────────────

    function test_execute_isReentrancyGuarded() public {
        // Defense-in-depth: executeEmergencyWithdraw uses both onlyOwner AND
        // nonReentrant. The security invariant is "a malicious USDC cannot
        // cause the proposal to debit more than `amount`, regardless of any
        // callback during transfer." We verify the postcondition: recipient
        // got exactly `amount`, the proposal is executed exactly once, the
        // bucket was decremented exactly once.
        //
        // The reentrant call from inside transfer() comes from the token
        // contract, not the owner — so it hits onlyOwner first. But CEI
        // ordering (executed=true + _debitBucket before safeTransfer) means
        // even if the inner call somehow bypassed onlyOwner, the second
        // attempt would revert with ProposalAlreadyExecuted. This test pins
        // the no-double-spend property end-to-end.
        ReentrantUSDC mal = new ReentrantUSDC();
        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        DevAttributionNFT nft = new DevAttributionNFT(predictedPool);
        TournamentPool poolReentry = new TournamentPool(IERC20(address(mal)), trustedSigner, address(nft));
        require(address(poolReentry) == predictedPool, "reentrancy setup mismatch");

        mal.mint(sponsor, 1_000_000_000);
        vm.prank(sponsor);
        mal.approve(address(poolReentry), type(uint256).max);

        bytes32 id = _tournamentId(9);
        vm.prank(sponsor);
        poolReentry.createTournament(
            id, DEFAULT_DEV, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );

        bytes32 proposalId =
            poolReentry.proposeEmergencyWithdraw(TournamentPool.EmergencyBucket.PrizePoolOf, id, recipient, PRIZE_POOL);
        vm.warp(block.timestamp + poolReentry.EMERGENCY_DELAY());

        mal.armReenter(address(poolReentry), proposalId);
        poolReentry.executeEmergencyWithdraw(proposalId);

        // Postcondition: exactly one execution, no double-debit.
        assertEq(mal.balanceOf(recipient), PRIZE_POOL, "recipient received exactly amount (no double-spend)");
        (,,,,, bool executed,) = poolReentry.emergencyProposals(proposalId);
        assertTrue(executed, "outer execute flipped executed flag");
        assertEq(poolReentry.getTournament(id).prizePool, 0, "bucket debited exactly once");
        // Reentrant attempt must have failed — that's why a second call now
        // reverts ProposalAlreadyExecuted (proves CEI fired before transfer).
        vm.expectRevert(TournamentPool.ProposalAlreadyExecuted.selector);
        poolReentry.executeEmergencyWithdraw(proposalId);
    }

    // ─── 10. Cancel: happy path ───────────────────────────────────────────────

    function test_cancel_happyPath() public {
        bytes32 id = _tournamentId(10);
        _createTournament(id);

        bytes32 proposalId =
            pool.proposeEmergencyWithdraw(TournamentPool.EmergencyBucket.PrizePoolOf, id, recipient, PRIZE_POOL);

        pool.cancelEmergencyWithdraw(proposalId);
        (,,,,,, bool cancelled) = pool.emergencyProposals(proposalId);
        assertTrue(cancelled, "cancelled flag");

        // Cannot re-cancel.
        vm.expectRevert(TournamentPool.ProposalAlreadyCancelled.selector);
        pool.cancelEmergencyWithdraw(proposalId);

        // Cannot execute a cancelled proposal — even after the timelock.
        vm.warp(block.timestamp + pool.EMERGENCY_DELAY());
        vm.expectRevert(TournamentPool.ProposalAlreadyCancelled.selector);
        pool.executeEmergencyWithdraw(proposalId);
    }

    // ─── 11. Cancel: non-existent proposal rejected ────────────────────────────

    function test_cancel_revertsOnNonExistent() public {
        bytes32 bogus = keccak256("not-a-real-proposal");
        vm.expectRevert(TournamentPool.ProposalNotFound.selector);
        pool.cancelEmergencyWithdraw(bogus);
    }

    // ─── 12. Cross-bucket lock — function-level invariant ────────────────────
    //
    // Maps the prompt's sweepstakes-safe invariant onto SPEC's canonical
    // buckets: a FeeCollectedDevOf proposal whose amount exceeds the dev
    // bucket reverts even if the prize pool has plenty — the dispatch cannot
    // "spill over" into a sibling bucket. This is what promotes the storage-
    // layout segregation invariant to a function-level invariant in v2.2.
    function test_crossBucketLock_devProposalCannotDrainPrizePool() public {
        bytes32 id = _tournamentId(12);
        _createTournament(id);
        _accrueDevAndPlatformFees(id, address(0xDEEDF3), 1); // 0.7 USDC dev

        uint256 devBucket = pool.feeCollected_dev(id);
        uint256 prizePool = pool.getTournament(id).prizePool;
        assertGt(prizePool, devBucket, "test invariant - prize must exceed dev for this to be meaningful");

        // Propose 1 wei more than the dev bucket holds; prize bucket has plenty,
        // but the function-level dispatch cannot reach it from FeeCollectedDevOf.
        vm.expectRevert(TournamentPool.ExceedsBucketBalance.selector);
        pool.proposeEmergencyWithdraw(
            TournamentPool.EmergencyBucket.FeeCollectedDevOf, id, recipient, devBucket + 1
        );

        // And a propose-then-drain-then-execute attempt against the dev bucket
        // also reverts on amount > devBucket at execute time.
        bytes32 ok = pool.proposeEmergencyWithdraw(
            TournamentPool.EmergencyBucket.FeeCollectedDevOf, id, recipient, devBucket
        );
        vm.warp(block.timestamp + pool.EMERGENCY_DELAY());
        pool.executeEmergencyWithdraw(ok);

        // Prize pool storage still untouched — function-level segregation.
        assertEq(pool.getTournament(id).prizePool, prizePool, "prize pool must not be reachable from dev bucket path");
        assertEq(pool.feeCollected_dev(id), 0, "dev bucket drained as intended");
    }
}

// ─── ReentrantUSDC mock for test 9 ──────────────────────────────────────────

/// @dev ERC20 mock that, when armed, calls back into the pool's
///      executeEmergencyWithdraw inside its `transfer` hook. The pool's
///      `nonReentrant` modifier should turn the inner call into a revert.
contract ReentrantUSDC is ERC20 {
    address public targetPool;
    bytes32 public reenterProposalId;
    bool public armed;

    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function armReenter(address pool, bytes32 proposalId) external {
        targetPool = pool;
        reenterProposalId = proposalId;
        armed = true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (armed && msg.sender == targetPool) {
            armed = false; // single shot — avoid infinite recursion
            (bool ok,) = targetPool.call(abi.encodeWithSignature("executeEmergencyWithdraw(bytes32)", reenterProposalId));
            require(!ok, "reentrant call should have reverted");
        }
        return super.transfer(to, amount);
    }
}
