// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, StdInvariant} from "forge-std/Test.sol";
import {DevAttributionNFT} from "../../src/DevAttributionNFT.sol";
import {TournamentPool} from "../../src/TournamentPool.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// X11.4 — DevAttributionNFT invariant coverage (SPEC docs/sprints/x11-v2-2/SPEC.md
// §F.3 + §H.2). StdInvariant fuzzes a Handler that drives the pool↔NFT pair through
// the only paths that touch attribution state: createTournament (mint trigger) and
// the rejected ERC-721 mutations (transferFrom / approve / setApprovalForAll). The
// per-dev unit-level surface lives in test/DevAttributionNFT.t.sol; this file pins
// the same invariants under random call ordering so audit-firm review can rely on
// fuzz-fed proof rather than enumerated cases.

contract _InvariantMockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// @dev Bounded driver — keeps the dev pool small so invariants stay tractable
///      while still letting createTournament order, repeat counts, and transfer
///      attempts mix freely. Tracks every observable side-effect needed by the
///      asserted invariants; never asserts directly (assertions live on the
///      invariant contract per Foundry convention).
contract DevAttributionNFTHandler is Test {
    TournamentPool internal immutable POOL;
    DevAttributionNFT internal immutable NFT;
    _InvariantMockUSDC internal immutable USDC;

    // Small fixed roster keeps invariant_* loops O(1) per run while still letting
    // the fuzzer mix devs across createTournament calls.
    address[3] public devs;

    // Counters that the invariant contract reads.
    uint256 public successfulTransfers;
    uint256 public successfulApprovals;
    uint256 public successfulSetApprovalForAll;

    // Internal id-uniqueness counter — guarantees every createTournament call gets
    // a fresh bytes32 id even when the fuzzer replays a seed.
    uint256 internal _idNonce;

    uint256 internal constant SPONSOR_BALANCE = 1_000_000 * 1e6;     // 1M USDC
    uint256 internal constant PRIZE_POOL = 1e6;                       // 1 USDC per tournament
    uint64  internal constant DURATION = 1 hours;

    constructor(TournamentPool _pool, DevAttributionNFT _nft, _InvariantMockUSDC _usdc) {
        POOL = _pool;
        NFT = _nft;
        USDC = _usdc;
        devs[0] = address(0xD0D0);
        devs[1] = address(0xD1D1);
        devs[2] = address(0xD2D2);

        USDC.mint(address(this), SPONSOR_BALANCE);
        USDC.approve(address(POOL), type(uint256).max);
    }

    /// @dev The only path that triggers NFT mint. Bounded to the 3-dev roster.
    function createTournamentAsDev(uint8 devIdx, uint256 seed) external {
        address dev = devs[devIdx % devs.length];
        unchecked { ++_idNonce; }
        bytes32 id = keccak256(abi.encode(seed, _idNonce, address(this)));

        uint64 startsAt = uint64(block.timestamp);
        uint64 endsAt = startsAt + DURATION;

        // Skip rather than revert if balance dips below a single entry — keeps
        // the run going for further transfer/approve attempts.
        if (USDC.balanceOf(address(this)) < PRIZE_POOL) return;

        try POOL.createTournament(
            id,
            dev,
            keccak256("invariant-game"),
            TournamentPool.CycleType.Daily,
            startsAt,
            endsAt,
            PRIZE_POOL,
            0
        ) {} catch {
            // Any revert (incl. TournamentAlreadyExists collisions) is acceptable
            // for invariant purposes — what we measure is the post-state of the
            // pool/NFT pair, not handler-call success.
        }
    }

    /// @dev INV-N4: every successful transferFrom would violate soulbound. We
    ///      record the success rather than expectRevert so the invariant can
    ///      assert successfulTransfers == 0 across the entire run.
    function attemptTransferFrom(uint8 devIdx, uint8 toIdx) external {
        address dev = devs[devIdx % devs.length];
        address to = devs[toIdx % devs.length];
        if (to == dev) return;
        if (NFT.balanceOf(dev) == 0) return;

        uint256 tokenId = uint256(uint160(dev));
        vm.prank(dev);
        try NFT.transferFrom(dev, to, tokenId) {
            successfulTransfers += 1;
        } catch {}
    }

    /// @dev INV-N4: every successful safeTransferFrom would violate soulbound.
    function attemptSafeTransferFrom(uint8 devIdx, uint8 toIdx) external {
        address dev = devs[devIdx % devs.length];
        address to = devs[toIdx % devs.length];
        if (to == dev) return;
        if (NFT.balanceOf(dev) == 0) return;

        uint256 tokenId = uint256(uint160(dev));
        vm.prank(dev);
        try NFT.safeTransferFrom(dev, to, tokenId) {
            successfulTransfers += 1;
        } catch {}
    }

    /// @dev INV-N4: approve must always revert Soulbound. tokenId need not exist —
    ///      the contract's override reverts unconditionally.
    function attemptApprove(uint8 callerIdx, uint8 spenderIdx, uint256 tokenIdSeed) external {
        address caller = devs[callerIdx % devs.length];
        address spender = devs[spenderIdx % devs.length];
        vm.prank(caller);
        try NFT.approve(spender, tokenIdSeed) {
            successfulApprovals += 1;
        } catch {}
    }

    /// @dev INV-N4: setApprovalForAll must always revert Soulbound.
    function attemptSetApprovalForAll(uint8 callerIdx, uint8 operatorIdx, bool flag) external {
        address caller = devs[callerIdx % devs.length];
        address operator = devs[operatorIdx % devs.length];
        vm.prank(caller);
        try NFT.setApprovalForAll(operator, flag) {
            successfulSetApprovalForAll += 1;
        } catch {}
    }

    // ─── View helpers for the invariant contract ───────────────────────────────

    function devsLength() external pure returns (uint256) {
        return 3;
    }
}

contract DevAttributionNFTInvariants is StdInvariant, Test {
    TournamentPool internal pool;
    DevAttributionNFT internal nft;
    _InvariantMockUSDC internal usdc;
    DevAttributionNFTHandler internal handler;

    address internal trustedSigner = address(0x517E5);

    function setUp() public {
        usdc = new _InvariantMockUSDC();

        // Mirror production pool↔NFT pinning: predict the pool address so the NFT
        // can lock `tournamentPool` to it without a circular constructor. The
        // require below proves the prediction held — any breakage here invalidates
        // every invariant run.
        address self = address(this);
        address predictedPool = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        nft = new DevAttributionNFT(predictedPool);
        pool = new TournamentPool(IERC20(address(usdc)), trustedSigner, address(nft));
        require(address(pool) == predictedPool, "invariant setup: pool address prediction drift");

        handler = new DevAttributionNFTHandler(pool, nft, usdc);

        // Restrict fuzzer to handler functions only — direct pool/NFT calls would
        // bypass the bookkeeping the invariants depend on.
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = DevAttributionNFTHandler.createTournamentAsDev.selector;
        selectors[1] = DevAttributionNFTHandler.attemptTransferFrom.selector;
        selectors[2] = DevAttributionNFTHandler.attemptSafeTransferFrom.selector;
        selectors[3] = DevAttributionNFTHandler.attemptApprove.selector;
        selectors[4] = DevAttributionNFTHandler.attemptSetApprovalForAll.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// @notice INV-N1 (idempotent mint): every dev wallet ever associated with a
    ///         created tournament holds exactly 0 or 1 NFTs — never more. The
    ///         pool's devNFTMinted cache and the NFT's _update override are
    ///         independent guards; this invariant proves their combined effect.
    function invariant_mintIdempotency() public view {
        for (uint256 i; i < handler.devsLength(); ++i) {
            address dev = handler.devs(i);
            uint256 balance = nft.balanceOf(dev);
            assertLe(balance, 1, "INV-N1: dev holds more than one attribution NFT");
        }
    }

    /// @notice INV-N4 (soulbound enforcement): no transfer or approval path ever
    ///         succeeds. The handler records a counter for each variant; all must
    ///         remain zero across the full fuzz run.
    function invariant_soulboundEnforcement() public view {
        assertEq(handler.successfulTransfers(), 0, "INV-N4: transferFrom/safeTransferFrom succeeded");
        assertEq(handler.successfulApprovals(), 0, "INV-N4: approve succeeded");
        assertEq(handler.successfulSetApprovalForAll(), 0, "INV-N4: setApprovalForAll succeeded");
    }

    /// @notice INV-N5 (deterministic tokenId): for every minted dev,
    ///         ownerOf(uint256(uint160(dev))) == dev. No off-chain index is ever
    ///         needed to recover dev attribution from chain state.
    function invariant_deterministicTokenId() public view {
        for (uint256 i; i < handler.devsLength(); ++i) {
            address dev = handler.devs(i);
            if (nft.balanceOf(dev) == 1) {
                assertEq(nft.ownerOf(uint256(uint160(dev))), dev, "INV-N5: tokenId determinism broken");
            }
        }
    }

    /// @notice INV-N1 corollary (pool-cache ⇔ NFT-state): the pool's devNFTMinted
    ///         flag and the NFT's balanceOf for that dev must move together. A
    ///         desync would mean either (a) the pool minted off-chain attribution
    ///         without the NFT, or (b) the NFT minted without the pool's CEI flag —
    ///         both audit-significant deviations from §F invariants.
    function invariant_poolCacheMatchesNFTState() public view {
        for (uint256 i; i < handler.devsLength(); ++i) {
            address dev = handler.devs(i);
            bool poolFlag = pool.devNFTMinted(dev);
            uint256 nftBalance = nft.balanceOf(dev);
            if (poolFlag) {
                assertEq(nftBalance, 1, "INV-N1+: pool cache true but NFT not minted");
            } else {
                assertEq(nftBalance, 0, "INV-N1+: NFT minted but pool cache false");
            }
        }
    }
}
