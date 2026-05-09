// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {TournamentPool} from "../src/TournamentPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title BackfillV2Tournament
/// @notice One-shot backfill of today's cron-missed tournament on the v2 pool.
///
/// @dev Background. The cron that creates daily tournaments was pointing at
///      the v1 TournamentPool when it ran at UTC midnight on 2026-04-23.
///      After the v2 cut-over (feat/tournaments-v2-solo branch), new
///      backend code broadcasts submitSoloScore()/submitScore() at the v2
///      address — which has no record of today's (id, startsAt). Result:
///      every fire-and-forget broadcast reverts with TournamentNotFound
///      until we recreate that tournament on v2.
///
///      This script replays the cron's createTournament call once, with the
///      exact same deterministic id the DB already has. After this runs,
///      DB on_chain_id ↔ on-chain state match again, and the solo path
///      broadcasts start landing.
///
///      Approval path: the sponsor wallet (== DEPLOYER wallet in Phase-1,
///      the STUDIO multisig later) previously approved USDC to the v1 pool.
///      v2 is a new address so that allowance doesn't carry over; we
///      approve max again.
///
///      Required env vars:
///        DEPLOYER_PRIVATE_KEY        — sponsor wallet, holds USDC + pays gas
///        TOURNAMENT_POOL_V2_ADDRESS  — 0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1
///
///      Hardcoded constants (derived from the DB row we're reconciling):
///        id           — 0x70a1b897... (matches v2_tournaments.on_chain_id)
///        gameSlug     — keccak256(utf8("2048"))
///        cycleType    — Daily (0)
///        startsAt     — 1776902400 (2026-04-23T00:00:00Z)
///        endsAt       — 1776988800 (2026-04-24T00:00:00Z)
///        prizePool    — 1_000_000 (1 USDC, 6 decimals)
///        participationBonus — 50 (2048 calibration)
///
///      Safety:
///        - Reverts if any chain other than Base Sepolia.
///        - Reverts with TournamentAlreadyExists if already backfilled
///          (idempotent re-run surfaces the right error).
contract BackfillV2Tournament is Script {
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;
    address constant USDC_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // Exact values from v2_tournaments row id=41dbaa20-2ee9-4d28-b312-5d021d041567.
    bytes32 constant TOURNAMENT_ID = 0x70a1b897e2cc00e9ab2538536c6c84d5bce09bb68fcb28a12b02a4443d4cc6d0;
    bytes32 constant GAME_2048 = keccak256("2048");
    uint64 constant STARTS_AT = 1_776_902_400; // 2026-04-23T00:00:00Z
    uint64 constant ENDS_AT = 1_776_988_800; // 2026-04-24T00:00:00Z
    uint256 constant PRIZE_POOL = 1_000_000; // 1 USDC
    uint256 constant PARTICIPATION_BONUS = 50;

    function run() external {
        if (block.chainid != CHAIN_BASE_SEPOLIA) {
            revert("BackfillV2Tournament: Base Sepolia only");
        }

        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address poolAddr = vm.envAddress("TOURNAMENT_POOL_V2_ADDRESS");

        TournamentPool pool = TournamentPool(poolAddr);
        IERC20 usdc = IERC20(USDC_SEPOLIA);

        uint256 usdcBalance = usdc.balanceOf(deployer);
        uint256 currentAllowance = usdc.allowance(deployer, poolAddr);

        console2.log("=== BackfillV2Tournament ===");
        console2.log("Deployer:         ", deployer);
        console2.log("Pool (v2):        ", poolAddr);
        console2.log("USDC balance:     ", usdcBalance);
        console2.log("Current allowance:", currentAllowance);
        console2.log("Prize pool needed:", PRIZE_POOL);

        if (usdcBalance < PRIZE_POOL) {
            revert("BackfillV2Tournament: sponsor USDC balance below 1 USDC");
        }

        vm.startBroadcast(deployerPk);

        // 1. Approve max if current allowance to v2 pool is insufficient.
        //    Using max-uint256 matches the cron's ensureUsdcAllowance pattern,
        //    so future cron runs don't need to re-approve either.
        if (currentAllowance < PRIZE_POOL) {
            console2.log("Approving USDC max to v2 pool...");
            usdc.approve(poolAddr, type(uint256).max);
        } else {
            console2.log("Allowance already sufficient; skipping approve.");
        }

        // 2. Create the tournament with the exact id the DB already has.
        // NOTE: This is a historical v2.1 backfill script. Re-running against
        //       v2.2 is not intended; v2.1 already holds this tournament id.
        //       devAddr is set to deployer so the script compiles against the
        //       v2.2 source ABI without changing the v2.1 deployment behavior.
        console2.log("Creating tournament on v2...");
        pool.createTournament(
            TOURNAMENT_ID,
            deployer,
            GAME_2048,
            TournamentPool.CycleType.Daily,
            STARTS_AT,
            ENDS_AT,
            PRIZE_POOL,
            PARTICIPATION_BONUS
        );

        vm.stopBroadcast();

        // Post-write read to prove the state landed.
        TournamentPool.Tournament memory t = pool.getTournament(TOURNAMENT_ID);
        console2.log("=== Backfilled ===");
        console2.log("Sponsor:         ", t.sponsor);
        console2.log("Game:            ");
        console2.logBytes32(t.game);
        console2.log("startsAt:        ", t.startsAt);
        console2.log("endsAt:          ", t.endsAt);
        console2.log("prizePool:       ", t.prizePool);
        console2.log("participationBonus:", t.participationBonus);
    }
}
