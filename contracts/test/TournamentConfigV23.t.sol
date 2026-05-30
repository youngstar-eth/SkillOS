// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TournamentPool} from "../src/TournamentPool.sol";
import {DevAttributionNFT} from "../src/DevAttributionNFT.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// @notice Δ1 (v2.3) Arena-config tests: the on-chain config set on the Tournament
///         struct, the legacy-default path, explicit config + every enum value, the
///         TournamentConfigured event, immutability, and the on-chain read proof.
contract TournamentConfigV23Test is Test {
    MockUSDC internal usdc;
    TournamentPool internal pool;
    DevAttributionNFT internal devNFT;

    address internal sponsor = address(0x5907503);
    address internal constant DEV = address(0xDE7de7de7De7dE7de7De7De7DE7De7De7dE7dE7D);
    uint256 internal constant PRIZE = 10_000_000;
    uint256 internal constant BONUS = 50;
    bytes32 internal constant GAME = keccak256("2048");
    uint64 internal startsAt;
    uint64 internal endsAt;

    // Local copy for vm.expectEmit.
    event TournamentConfigured(bytes32 indexed id, TournamentPool.TournamentConfig config);

    function setUp() public {
        usdc = new MockUSDC();
        address self = address(this);
        address predicted = vm.computeCreateAddress(self, vm.getNonce(self) + 1);
        devNFT = new DevAttributionNFT(predicted);
        pool = new TournamentPool(IERC20(address(usdc)), address(0x51611), address(devNFT));
        require(address(pool) == predicted, "setup: pool mismatch");
        usdc.mint(sponsor, 1_000_000_000);
        vm.prank(sponsor);
        usdc.approve(address(pool), type(uint256).max);
        startsAt = uint64(block.timestamp);
        endsAt = uint64(block.timestamp + 1 days);
    }

    function _id(uint256 s) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("cfg", s));
    }

    function _explicitConfig() internal pure returns (TournamentPool.TournamentConfig memory) {
        return TournamentPool.TournamentConfig({
            entry: TournamentPool.EntryType.FEE,
            feeAmount: 2_500_000, // 2.5 USDC
            prizeSource: TournamentPool.PrizeSource.PLAYER_POOL,
            format: TournamentPool.Format.PVP,
            verification: TournamentPool.VerificationFamily.STAKED_RESOLUTION,
            seedCommit: keccak256("seed-commit-ref"),
            resolution: TournamentPool.ResolutionPolicy.BRACKET_ELIM
        });
    }

    function _assertConfigEq(
        TournamentPool.TournamentConfig memory got,
        TournamentPool.TournamentConfig memory want
    ) internal pure {
        assertEq(uint256(got.entry), uint256(want.entry), "entry");
        assertEq(got.feeAmount, want.feeAmount, "feeAmount");
        assertEq(uint256(got.prizeSource), uint256(want.prizeSource), "prizeSource");
        assertEq(uint256(got.format), uint256(want.format), "format");
        assertEq(uint256(got.verification), uint256(want.verification), "verification");
        assertEq(got.seedCommit, want.seedCommit, "seedCommit");
        assertEq(uint256(got.resolution), uint256(want.resolution), "resolution");
    }

    // ─── Legacy 8-param path defaults correctly ─────────────────────────────────

    function test_legacyCreate_defaultsConfigCorrectly() public {
        bytes32 id = _id(1);
        vm.prank(sponsor);
        pool.createTournament(id, DEV, GAME, TournamentPool.CycleType.Daily, startsAt, endsAt, PRIZE, BONUS);

        TournamentPool.TournamentConfig memory c = pool.getTournament(id).config;
        // Every field at its index-0 / zero default.
        assertEq(uint256(c.entry), uint256(TournamentPool.EntryType.FREE));
        assertEq(c.feeAmount, 0);
        assertEq(uint256(c.prizeSource), uint256(TournamentPool.PrizeSource.NONE));
        assertEq(uint256(c.format), uint256(TournamentPool.Format.SOLO_SUBMIT));
        assertEq(uint256(c.verification), uint256(TournamentPool.VerificationFamily.DETERMINISTIC_REPLAY));
        assertEq(c.seedCommit, bytes32(0));
        assertEq(uint256(c.resolution), uint256(TournamentPool.ResolutionPolicy.HIGHEST_SCORE));
    }

    function test_legacyCreate_emitsDefaultConfigEvent() public {
        bytes32 id = _id(2);
        TournamentPool.TournamentConfig memory def = TournamentPool.TournamentConfig({
            entry: TournamentPool.EntryType.FREE,
            feeAmount: 0,
            prizeSource: TournamentPool.PrizeSource.NONE,
            format: TournamentPool.Format.SOLO_SUBMIT,
            verification: TournamentPool.VerificationFamily.DETERMINISTIC_REPLAY,
            seedCommit: bytes32(0),
            resolution: TournamentPool.ResolutionPolicy.HIGHEST_SCORE
        });
        vm.expectEmit(true, false, false, true, address(pool));
        emit TournamentConfigured(id, def);
        vm.prank(sponsor);
        pool.createTournament(id, DEV, GAME, TournamentPool.CycleType.Daily, startsAt, endsAt, PRIZE, BONUS);
    }

    // ─── Explicit 9-param config path ───────────────────────────────────────────

    function test_configCreate_storesExplicitConfig() public {
        bytes32 id = _id(3);
        TournamentPool.TournamentConfig memory want = _explicitConfig();
        vm.prank(sponsor);
        pool.createTournament(id, DEV, GAME, TournamentPool.CycleType.Weekly, startsAt, endsAt, PRIZE, BONUS, want);

        _assertConfigEq(pool.getTournament(id).config, want);
        // Core (non-config) fields still set as before.
        TournamentPool.Tournament memory t = pool.getTournament(id);
        assertEq(t.sponsor, sponsor);
        assertEq(t.prizePool, PRIZE);
    }

    function test_configCreate_emitsConfiguredEvent() public {
        bytes32 id = _id(4);
        TournamentPool.TournamentConfig memory want = _explicitConfig();
        vm.expectEmit(true, false, false, true, address(pool));
        emit TournamentConfigured(id, want);
        vm.prank(sponsor);
        pool.createTournament(id, DEV, GAME, TournamentPool.CycleType.Weekly, startsAt, endsAt, PRIZE, BONUS, want);
    }

    /// @dev Every enum's full value range round-trips through storage.
    function test_allEnumValues_roundTrip() public {
        TournamentPool.TournamentConfig[3] memory cfgs;
        cfgs[0] = TournamentPool.TournamentConfig({
            entry: TournamentPool.EntryType.FREE,
            feeAmount: 0,
            prizeSource: TournamentPool.PrizeSource.SPONSOR,
            format: TournamentPool.Format.SOLO_SUBMIT,
            verification: TournamentPool.VerificationFamily.DETERMINISTIC_REPLAY,
            seedCommit: keccak256("a"),
            resolution: TournamentPool.ResolutionPolicy.THRESHOLD
        });
        cfgs[1] = TournamentPool.TournamentConfig({
            entry: TournamentPool.EntryType.FEE,
            feeAmount: 1,
            prizeSource: TournamentPool.PrizeSource.PLAYER_POOL,
            format: TournamentPool.Format.PVP,
            verification: TournamentPool.VerificationFamily.STAKED_RESOLUTION,
            seedCommit: keccak256("b"),
            resolution: TournamentPool.ResolutionPolicy.BRACKET_ELIM
        });
        cfgs[2] = TournamentPool.TournamentConfig({
            entry: TournamentPool.EntryType.FEE,
            feeAmount: type(uint256).max,
            prizeSource: TournamentPool.PrizeSource.NONE,
            format: TournamentPool.Format.PVP,
            verification: TournamentPool.VerificationFamily.STAKED_RESOLUTION,
            seedCommit: bytes32(uint256(1)),
            resolution: TournamentPool.ResolutionPolicy.HIGHEST_SCORE
        });
        for (uint256 i; i < cfgs.length; ++i) {
            bytes32 id = _id(100 + i);
            vm.prank(sponsor);
            pool.createTournament(id, DEV, GAME, TournamentPool.CycleType.Daily, startsAt, endsAt, PRIZE, BONUS, cfgs[i]);
            _assertConfigEq(pool.getTournament(id).config, cfgs[i]);
        }
    }

    /// @dev Config is set once at create and immutable — no setter exists, and a
    ///      second create on the same id reverts, so the stored config can't change.
    function test_config_immutable_secondCreateReverts() public {
        bytes32 id = _id(5);
        TournamentPool.TournamentConfig memory want = _explicitConfig();
        vm.prank(sponsor);
        pool.createTournament(id, DEV, GAME, TournamentPool.CycleType.Daily, startsAt, endsAt, PRIZE, BONUS, want);

        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.TournamentAlreadyExists.selector);
        pool.createTournament(id, DEV, GAME, TournamentPool.CycleType.Daily, startsAt, endsAt, PRIZE, BONUS);

        _assertConfigEq(pool.getTournament(id).config, want); // unchanged
    }

    /// @dev Config create keeps the v2.2 fee/prize invariants (prizePool>0 required).
    function test_configCreate_keepsZeroPrizeGuard() public {
        bytes32 id = _id(6);
        TournamentPool.TournamentConfig memory want = _explicitConfig();
        vm.prank(sponsor);
        vm.expectRevert(TournamentPool.ZeroPrize.selector);
        pool.createTournament(id, DEV, GAME, TournamentPool.CycleType.Daily, startsAt, endsAt, 0, BONUS, want);
    }
}
