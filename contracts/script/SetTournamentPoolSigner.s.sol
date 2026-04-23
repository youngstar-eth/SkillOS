// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { TournamentPool } from "../src/TournamentPool.sol";

/// @title SetTournamentPoolSigner — owner-ceremonial setTrustedSigner call.
/// @dev Idempotent when called with the same signer already set by the constructor.
///      Run after DeployTournamentPool to confirm owner-key control of the new contract.
///      Also used as the hot-fix path when SCORE_SIGNER_ADDRESS env drifts from the
///      address STUDIO_PRIVATE_KEY actually derives to (happened once during v2
///      cut-over; symptom was on-chain BadSignature on every submit). Override
///      SCORE_SIGNER_ADDRESS inline at invocation time to correct it.
///
///      Required env vars:
///        DEPLOYER_PRIVATE_KEY       — Owner of the contract (matches deployer).
///        TOURNAMENT_POOL_V2_ADDRESS — Contract address from deploy step.
///        SCORE_SIGNER_ADDRESS       — Target signer. MUST equal the address that
///                                     STUDIO_PRIVATE_KEY (app-side .env.local)
///                                     derives to — otherwise every broadcast
///                                     reverts with BadSignature.
contract SetTournamentPoolSigner is Script {
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;

    function run() external {
        if (block.chainid != CHAIN_BASE_SEPOLIA) {
            revert("SetTournamentPoolSigner: Base Sepolia only");
        }

        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address poolAddr = vm.envAddress("TOURNAMENT_POOL_V2_ADDRESS");
        address signer = vm.envAddress("SCORE_SIGNER_ADDRESS");

        TournamentPool pool = TournamentPool(poolAddr);

        console2.log("=== SetTrustedSigner ===");
        console2.log("Pool:         ", poolAddr);
        console2.log("Target signer:", signer);
        console2.log("Current:      ", pool.trustedSigner());

        vm.startBroadcast(deployerPk);
        pool.setTrustedSigner(signer);
        vm.stopBroadcast();

        console2.log("Post-call:    ", pool.trustedSigner());
    }
}
