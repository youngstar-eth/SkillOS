// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TournamentPool} from "../src/TournamentPool.sol";
import {DevAttributionNFT} from "../src/DevAttributionNFT.sol";
import {MockSanctionsOracle} from "../src/MockSanctionsOracle.sol";
import {SponsorReceiptSBT} from "../src/SponsorReceiptSBT.sol";
import {SponsorshipModule, ITournamentPool} from "../src/SponsorshipModule.sol";
import {ISanctionsOracle} from "../src/ISanctionsOracle.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract SponsorshipModuleTest is Test {
    // ── Actors
    address internal originalSponsor = address(0x5907503);
    address internal trustedSigner = address(0x516E5);
    address internal sponsorA = address(0xA1);
    address internal sponsorB = address(0xB2);
    address internal sanctionedAddr = address(0xBAD);

    // ── Contracts
    MockUSDC internal usdc;
    TournamentPool internal pool;
    DevAttributionNFT internal devNFT;
    MockSanctionsOracle internal oracle;
    SponsorReceiptSBT internal receipt;
    SponsorshipModule internal module;

    // ── Constants
    uint256 internal constant PRIZE_POOL = 10_000_000;
    uint256 internal constant PARTICIPATION_BONUS = 50;
    bytes32 internal constant GAME = keccak256("2048");
    uint64 internal STARTS_AT;
    uint64 internal ENDS_AT;

    function setUp() public {
        usdc = new MockUSDC();

        // Predict TournamentPool's address before deploying DevAttributionNFT,
        // since the NFT pins its tournamentPool immutable. Same pattern as the
        // SBT/Module dance below.
        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        devNFT = new DevAttributionNFT(predictedPool);
        pool = new TournamentPool(IERC20(address(usdc)), trustedSigner, address(devNFT));
        require(address(pool) == predictedPool, "test setup: pool address mismatch");

        oracle = new MockSanctionsOracle();

        // Deterministic deploy order for SBT/Module circular dep: predict
        // module address using deployer nonce, deploy SBT pinned to it, then
        // deploy module and assert prediction.
        address predictedModule = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        receipt = new SponsorReceiptSBT(predictedModule);
        module = new SponsorshipModule(
            IERC20(address(usdc)), ITournamentPool(address(pool)), receipt, ISanctionsOracle(address(oracle))
        );
        require(address(module) == predictedModule, "test setup: module address mismatch");

        // Original sponsor creates the tournament being sponsored on.
        usdc.mint(originalSponsor, 1_000_000_000);
        vm.prank(originalSponsor);
        usdc.approve(address(pool), type(uint256).max);

        STARTS_AT = uint64(block.timestamp);
        ENDS_AT = uint64(block.timestamp + 1 days);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function _tournamentId(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("tournament", seed));
    }

    /// @dev v2.2: createTournament requires devAddr; tests in this suite don't exercise
    ///      dev-attribution semantics, so we pass a fixed sentinel.
    address internal constant DEFAULT_DEV = address(0xDE7de7de7De7dE7de7De7De7DE7De7De7dE7dE7D);

    function _createTournament(bytes32 id) internal {
        vm.prank(originalSponsor);
        pool.createTournament(
            id, DEFAULT_DEV, GAME, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, PARTICIPATION_BONUS
        );
    }

    function _fundAndApprove(address sponsor, uint256 amount) internal {
        usdc.mint(sponsor, amount);
        vm.prank(sponsor);
        usdc.approve(address(module), amount);
    }

    // ─── Happy path ────────────────────────────────────────────────────────────

    function test_sponsorPool_success_mintsReceipt_andForwards() public {
        bytes32 id = _tournamentId(1);
        _createTournament(id);
        _fundAndApprove(sponsorA, 5_000_000);

        uint256 sponsorBefore = usdc.balanceOf(sponsorA);
        uint256 poolBefore = usdc.balanceOf(address(pool));

        vm.prank(sponsorA);
        uint256 tokenId = module.sponsorPool(id, 5_000_000);

        // Receipt minted and owned by sponsor.
        assertEq(tokenId, 1, "first mint = tokenId 1");
        assertEq(receipt.ownerOf(tokenId), sponsorA, "owner");
        assertTrue(receipt.locked(tokenId), "locked");

        // USDC moved sponsor → pool (module is transient).
        assertEq(usdc.balanceOf(sponsorA), sponsorBefore - 5_000_000, "sponsor debited");
        assertEq(usdc.balanceOf(address(pool)), poolBefore + 5_000_000, "pool credited");
        assertEq(usdc.balanceOf(address(module)), 0, "module holds nothing");

        // Pool's prizePool augmented.
        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.prizePool, PRIZE_POOL + 5_000_000, "prize pool augmented");

        // Module trackers updated.
        assertEq(module.sponsorContributions(id, sponsorA), 5_000_000, "contribution recorded");
        assertEq(module.totalSponsorsByTournament(id), 1, "unique count");

        // Receipt metadata captured.
        (bytes32 mTid, uint256 mAmount, address mSponsor, uint64 mTs) = receipt.receiptOf(tokenId);
        assertEq(mTid, id, "metadata tid");
        assertEq(mAmount, 5_000_000, "metadata amount");
        assertEq(mSponsor, sponsorA, "metadata sponsor");
        assertGt(mTs, 0, "metadata timestamp");
    }

    function test_sponsorPool_emitsEvent() public {
        bytes32 id = _tournamentId(2);
        _createTournament(id);
        _fundAndApprove(sponsorA, 3_000_000);

        vm.expectEmit(true, true, false, true, address(module));
        emit SponsorshipModule.PoolSponsored(id, sponsorA, 3_000_000, 1);

        vm.prank(sponsorA);
        module.sponsorPool(id, 3_000_000);
    }

    // ─── Revert paths ──────────────────────────────────────────────────────────

    function test_sponsorPool_revert_zeroAmount() public {
        bytes32 id = _tournamentId(10);
        _createTournament(id);
        vm.prank(sponsorA);
        vm.expectRevert(SponsorshipModule.ZeroAmount.selector);
        module.sponsorPool(id, 0);
    }

    function test_sponsorPool_revert_sanctioned() public {
        bytes32 id = _tournamentId(11);
        _createTournament(id);
        oracle.addToBlacklist(sanctionedAddr);

        _fundAndApprove(sanctionedAddr, 1_000_000);
        vm.prank(sanctionedAddr);
        vm.expectRevert(SponsorshipModule.SponsorSanctioned.selector);
        module.sponsorPool(id, 1_000_000);
    }

    function test_sponsorPool_revert_settledTournament() public {
        bytes32 id = _tournamentId(12);
        _createTournament(id);

        // Close + settle the tournament with a single trivially-fundable participant.
        // (Sponsorship reverts come from POOL.fundPrizePool; we just need t.settled = true.)
        vm.warp(ENDS_AT + 1);
        // settle requires verified ranking; use empty ranking (no participants).
        address[] memory empty = new address[](0);
        // ranking length must equal expected non-excluded count = 0 for empty tournament.
        pool.settle(id, empty);

        _fundAndApprove(sponsorA, 1_000_000);
        vm.prank(sponsorA);
        vm.expectRevert(TournamentPool.TournamentAlreadySettled.selector);
        module.sponsorPool(id, 1_000_000);
    }

    function test_sponsorPool_revert_nonexistentTournament() public {
        _fundAndApprove(sponsorA, 1_000_000);
        vm.prank(sponsorA);
        vm.expectRevert(TournamentPool.TournamentNotFound.selector);
        module.sponsorPool(_tournamentId(99), 1_000_000);
    }

    function test_sponsorPool_revert_insufficientApproval() public {
        bytes32 id = _tournamentId(13);
        _createTournament(id);

        // Fund but DON'T approve the module.
        usdc.mint(sponsorA, 1_000_000);
        vm.prank(sponsorA);
        // Standard ERC20: insufficient allowance error from OZ.
        vm.expectRevert();
        module.sponsorPool(id, 1_000_000);
    }

    // ─── Multi-sponsor tracking ────────────────────────────────────────────────

    function test_multipleSponsors_accumulatePool() public {
        bytes32 id = _tournamentId(20);
        _createTournament(id);

        _fundAndApprove(sponsorA, 4_000_000);
        _fundAndApprove(sponsorB, 6_000_000);

        vm.prank(sponsorA);
        module.sponsorPool(id, 4_000_000);
        vm.prank(sponsorB);
        module.sponsorPool(id, 6_000_000);

        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.prizePool, PRIZE_POOL + 10_000_000, "pool sum");
        assertEq(module.totalSponsorsByTournament(id), 2, "unique count");
        assertEq(module.sponsorContributions(id, sponsorA), 4_000_000);
        assertEq(module.sponsorContributions(id, sponsorB), 6_000_000);

        // Two SBTs minted (one per sponsorship event).
        assertEq(receipt.ownerOf(1), sponsorA);
        assertEq(receipt.ownerOf(2), sponsorB);
    }

    function test_sameSponsor_twiceCountsOnce() public {
        bytes32 id = _tournamentId(21);
        _createTournament(id);

        _fundAndApprove(sponsorA, 2_000_000 + 3_000_000);
        vm.prank(sponsorA);
        module.sponsorPool(id, 2_000_000);
        vm.prank(sponsorA);
        module.sponsorPool(id, 3_000_000);

        assertEq(module.sponsorContributions(id, sponsorA), 5_000_000, "cumulative");
        assertEq(module.totalSponsorsByTournament(id), 1, "unique still 1");

        // Two SBT receipts (one per sponsorship event).
        assertEq(receipt.balanceOf(sponsorA), 2, "two receipts");
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function test_setSanctionsOracle_onlyOwner() public {
        MockSanctionsOracle newOracle = new MockSanctionsOracle();

        vm.prank(sponsorA);
        vm.expectRevert(); // OZ Ownable: OwnableUnauthorizedAccount(sponsorA)
        module.setSanctionsOracle(ISanctionsOracle(address(newOracle)));

        // Owner (test contract) can rotate.
        vm.expectEmit(true, true, false, false, address(module));
        emit SponsorshipModule.SanctionsOracleUpdated(address(oracle), address(newOracle));
        module.setSanctionsOracle(ISanctionsOracle(address(newOracle)));
        assertEq(address(module.sanctionsOracle()), address(newOracle));
    }

    function test_setSanctionsOracle_revert_zeroAddress() public {
        vm.expectRevert(SponsorshipModule.ZeroAddress.selector);
        module.setSanctionsOracle(ISanctionsOracle(address(0)));
    }
}
