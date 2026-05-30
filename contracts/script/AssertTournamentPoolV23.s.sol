// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {TournamentPool} from "../src/TournamentPool.sol";

/// @title AssertTournamentPoolV23 — Δ1 v2.3 post-deploy invariant assertion (SPEC Invariants §9)
/// @notice Read-only. Asserts the deployed v2.3 TournamentPool matches the manifest
///         (constructor immutables + fee/weight constants + intended signer) and, when a
///         canary tournament id is supplied, that the new Δ1 Arena-config surface exists and
///         DEFAULTS CORRECTLY on-chain. Any drift reverts → CI / the deploy operator fails loudly.
///
/// @dev Usage (no broadcast — pure reads):
///        TOURNAMENT_POOL_V23=0x... \
///        SCORE_SIGNER_ADDRESS=0x... \
///        [CANARY_ID=0x...] \
///        forge script contracts/script/AssertTournamentPoolV23.s.sol --rpc-url base_sepolia -vvv
contract AssertTournamentPoolV23 is Script {
    // ── Manifest (deployments/sponsor-stack-base-sepolia.json + TournamentPool constants) ──
    address constant USDC_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint256 constant EXP_SCORE_WEIGHT = 85;
    uint256 constant EXP_PARTICIPATION_WEIGHT = 15;
    uint256 constant EXP_MATCH_COUNT_CAP = 10;
    uint256 constant EXP_ENTRY_FEE = 1_000_000;
    uint256 constant EXP_DEV_BPS = 7000;
    uint256 constant EXP_PLATFORM_BPS = 3000;
    uint256 constant EXP_TOTAL_BPS = 10_000;

    function run() external view {
        address poolAddr = vm.envAddress("TOURNAMENT_POOL_V23");
        address expectedSigner = vm.envAddress("SCORE_SIGNER_ADDRESS");
        TournamentPool pool = TournamentPool(poolAddr);

        console2.log("=== AssertTournamentPoolV23 ===");
        console2.log("Pool:   ", poolAddr);

        require(poolAddr.code.length > 0, "ASSERT: no code at pool address");

        // ── Constructor immutables / intended config ──
        require(address(pool.USDC()) == USDC_SEPOLIA, "ASSERT: USDC mismatch");
        require(pool.trustedSigner() == expectedSigner, "ASSERT: trustedSigner != intended");
        require(address(pool.devNFT()).code.length > 0, "ASSERT: devNFT has no code");

        // ── Fee-share + scoring constants (manifest drift guard) ──
        require(pool.SCORE_WEIGHT() == EXP_SCORE_WEIGHT, "ASSERT: SCORE_WEIGHT");
        require(pool.PARTICIPATION_WEIGHT() == EXP_PARTICIPATION_WEIGHT, "ASSERT: PARTICIPATION_WEIGHT");
        require(pool.MATCH_COUNT_CAP() == EXP_MATCH_COUNT_CAP, "ASSERT: MATCH_COUNT_CAP");
        require(pool.ENTRY_FEE() == EXP_ENTRY_FEE, "ASSERT: ENTRY_FEE");
        require(pool.DEV_BPS() == EXP_DEV_BPS, "ASSERT: DEV_BPS");
        require(pool.PLATFORM_BPS() == EXP_PLATFORM_BPS, "ASSERT: PLATFORM_BPS");
        require(pool.TOTAL_BPS() == EXP_TOTAL_BPS, "ASSERT: TOTAL_BPS");

        console2.log("OK: immutables + fee/scoring constants match manifest");

        // ── Δ1 surface: the new on-chain config exists + defaults correctly ──
        // Optional: supply CANARY_ID of a tournament created via the legacy 8-param
        // path. Its config MUST read back as the all-index-0 default.
        bytes32 canaryId = vm.envOr("CANARY_ID", bytes32(0));
        if (canaryId != bytes32(0)) {
            TournamentPool.TournamentConfig memory c = pool.getTournament(canaryId).config;
            require(c.entry == TournamentPool.EntryType.FREE, "ASSERT: default entry != FREE");
            require(c.feeAmount == 0, "ASSERT: default feeAmount != 0");
            require(c.prizeSource == TournamentPool.PrizeSource.NONE, "ASSERT: default prizeSource != NONE");
            require(c.format == TournamentPool.Format.SOLO_SUBMIT, "ASSERT: default format != SOLO_SUBMIT");
            require(
                c.verification == TournamentPool.VerificationFamily.DETERMINISTIC_REPLAY,
                "ASSERT: default verification != DETERMINISTIC_REPLAY"
            );
            require(c.seedCommit == bytes32(0), "ASSERT: default seedCommit != 0");
            require(
                c.resolution == TournamentPool.ResolutionPolicy.HIGHEST_SCORE,
                "ASSERT: default resolution != HIGHEST_SCORE"
            );
            console2.log("OK: canary tournament Delta1 config exists + defaults correctly");
        } else {
            console2.log("NOTE: CANARY_ID not set - skipped on-chain config default read (set it to prove Delta1 surface)");
        }

        console2.log("=== ALL ASSERTIONS PASSED ===");
    }
}
