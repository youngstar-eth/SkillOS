// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {TournamentPool} from "../src/TournamentPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title BackfillV2TournamentsBatch
/// @notice Reconcile the 5 non-2048 daily tournaments that were created on v1
///         by the cron at UTC midnight 2026-04-23, before the v2 cut-over flip.
///
/// @dev Same shape as BackfillV2Tournament.s.sol (2048 single-shot), batched.
///      Kept separate so git history preserves the one-shot record cleanly.
///
///      Each entry mirrors exactly what the cron's deriveTournamentId +
///      ensureUsdcAllowance + createTournament would have produced — DB rows
///      already carry these on_chain_ids + params, so after this script the
///      DB ↔ on-chain alignment holds for every Phase-1 game.
///
///      All 5 tournaments share the same window (today UTC daily) and prize
///      pool (1 USDC). They differ by game slug + participation_bonus per
///      TOURNAMENT_GAMES config in duel-backend/cron/tournaments.ts.
///
///      Required env vars:
///        DEPLOYER_PRIVATE_KEY        — sponsor wallet (paid for 2048 already)
///        TOURNAMENT_POOL_V2_ADDRESS  — 0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1
///
///      Safety:
///        - Reverts if not Base Sepolia
///        - Reverts if sponsor USDC balance < 5 USDC (total prize needed)
///        - Skips USDC approve step if allowance already sufficient (it will be
///          after the 2048 backfill approved max)
///        - Per-tournament createTournament reverts idempotently with
///          TournamentAlreadyExists on re-run
contract BackfillV2TournamentsBatch is Script {
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;
    address constant USDC_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    uint64 constant STARTS_AT = 1_776_902_400; // 2026-04-23T00:00:00Z
    uint64 constant ENDS_AT = 1_776_988_800; // 2026-04-24T00:00:00Z
    uint256 constant PRIZE_POOL = 1_000_000; // 1 USDC each
    uint256 constant TOTAL_PRIZE_NEEDED = 5_000_000; // 5 USDC for all 5

    // ─── Tournament params, copied from v2_tournaments DB rows ────────────

    // clicker: id 0x2bfe7ade…, bonus 1
    bytes32 constant ID_CLICKER = 0x2bfe7adea994b00f5e6c2639f05a268dff43bbb9d8846f8ad9e9bf0513505047;
    uint256 constant BONUS_CLICKER = 1;

    // match3: id 0x77d971f6…, bonus 15
    bytes32 constant ID_MATCH3 = 0x77d971f6937999e794267d16a2b0b2d76caf5771db820f1eef7b9a61c7f0400b;
    uint256 constant BONUS_MATCH3 = 15;

    // minesweeper: id 0xb489b0f9…, bonus 20
    bytes32 constant ID_MINESWEEPER = 0xb489b0f9ef46fa6a0a1629a47cba11725edf0e20ecce4da2768ebe961cbdd90a;
    uint256 constant BONUS_MINESWEEPER = 20;

    // sudoku: id 0x4478fa2d…, bonus 10
    bytes32 constant ID_SUDOKU = 0x4478fa2dda6bf90bf21a52ddbd8b78c247b688c5aedab4f9c6f114f32e556989;
    uint256 constant BONUS_SUDOKU = 10;

    // wordle: id 0x60ebce49…, bonus 200
    bytes32 constant ID_WORDLE = 0x60ebce49f92ae1132be51cc341d02bee3f26b007300b6129b991e138d9587a79;
    uint256 constant BONUS_WORDLE = 200;

    function run() external {
        if (block.chainid != CHAIN_BASE_SEPOLIA) {
            revert("BackfillV2TournamentsBatch: Base Sepolia only");
        }

        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address poolAddr = vm.envAddress("TOURNAMENT_POOL_V2_ADDRESS");

        TournamentPool pool = TournamentPool(poolAddr);
        IERC20 usdc = IERC20(USDC_SEPOLIA);

        uint256 balanceBefore = usdc.balanceOf(deployer);
        uint256 allowance = usdc.allowance(deployer, poolAddr);

        console2.log("=== BackfillV2TournamentsBatch ===");
        console2.log("Deployer:         ", deployer);
        console2.log("Pool (v2):        ", poolAddr);
        console2.log("USDC balance:     ", balanceBefore);
        console2.log("Current allowance:", allowance);
        console2.log("Prize pool needed:", TOTAL_PRIZE_NEEDED);

        if (balanceBefore < TOTAL_PRIZE_NEEDED) {
            revert("BackfillV2TournamentsBatch: sponsor USDC balance below 5 USDC total");
        }

        vm.startBroadcast(deployerPk);

        // Approve only if needed. Prior 2048 backfill set allowance to max,
        // so this should be a no-op on the expected path.
        if (allowance < TOTAL_PRIZE_NEEDED) {
            console2.log("Approving USDC max to v2 pool...");
            usdc.approve(poolAddr, type(uint256).max);
        } else {
            console2.log("Allowance already sufficient; skipping approve.");
        }

        _create(pool, "clicker", ID_CLICKER, keccak256("clicker"), BONUS_CLICKER);
        _create(pool, "match3", ID_MATCH3, keccak256("match3"), BONUS_MATCH3);
        _create(pool, "minesweeper", ID_MINESWEEPER, keccak256("minesweeper"), BONUS_MINESWEEPER);
        _create(pool, "sudoku", ID_SUDOKU, keccak256("sudoku"), BONUS_SUDOKU);
        _create(pool, "wordle", ID_WORDLE, keccak256("wordle"), BONUS_WORDLE);

        vm.stopBroadcast();

        uint256 balanceAfter = usdc.balanceOf(deployer);
        console2.log("=== Batch complete ===");
        console2.log("USDC spent:", balanceBefore - balanceAfter);
        console2.log("USDC left :", balanceAfter);

        // Post-write verification — read back each one.
        _verify(pool, "clicker", ID_CLICKER, BONUS_CLICKER);
        _verify(pool, "match3", ID_MATCH3, BONUS_MATCH3);
        _verify(pool, "minesweeper", ID_MINESWEEPER, BONUS_MINESWEEPER);
        _verify(pool, "sudoku", ID_SUDOKU, BONUS_SUDOKU);
        _verify(pool, "wordle", ID_WORDLE, BONUS_WORDLE);
    }

    function _create(TournamentPool pool, string memory label, bytes32 id, bytes32 game, uint256 bonus) internal {
        // Historical v2.1 backfill — devAddr defaults to msg.sender (deployer)
        // so the script compiles against the v2.2 source ABI. Not intended for
        // re-run against v2.2.
        console2.log("Creating tournament:", label);
        pool.createTournament(
            id, msg.sender, game, TournamentPool.CycleType.Daily, STARTS_AT, ENDS_AT, PRIZE_POOL, bonus
        );
    }

    function _verify(TournamentPool pool, string memory label, bytes32 id, uint256 expectedBonus) internal view {
        TournamentPool.Tournament memory t = pool.getTournament(id);
        console2.log("[verify]", label);
        console2.log("  sponsor           :", t.sponsor);
        console2.log("  startsAt          :", t.startsAt);
        console2.log("  endsAt            :", t.endsAt);
        console2.log("  prizePool         :", t.prizePool);
        console2.log("  participationBonus:", t.participationBonus);
        if (t.participationBonus != expectedBonus) {
            revert(string.concat("participationBonus mismatch on ", label));
        }
    }
}
