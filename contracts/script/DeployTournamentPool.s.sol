// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { TournamentPool } from "../src/TournamentPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title DeployTournamentPool — F4 Sponsored Tournaments
/// @notice Deploys TournamentPool to Base Sepolia.
///
/// @dev Usage (Base Sepolia):
///        forge script contracts/script/DeployTournamentPool.s.sol \
///          --rpc-url base_sepolia \
///          --broadcast --verify \
///          --etherscan-api-key $BASESCAN_API_KEY -vvvv
///
///      Required env vars:
///        DEPLOYER_PRIVATE_KEY    — Deployer EOA (reuses F2 Escrow wallet, already funded)
///        SCORE_SIGNER_ADDRESS    — Derived from STUDIO_PRIVATE_KEY; shared signer with
///                                   ChallengeEscrow + ArcadePool. Backend signs
///                                   submitScore attestations with the matching private key.
///        BASESCAN_API_KEY        — For --verify flag (read via env, not passed inline)
///
///      Mainnet deploy is GATED on post-sweepstakes legal review. This script reverts
///      if run against chain_id != Base Sepolia to prevent accidental mainnet spend.
contract DeployTournamentPool is Script {
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;

    // Base Sepolia USDC (Circle)
    address constant USDC_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        if (block.chainid != CHAIN_BASE_SEPOLIA) {
            revert(
                "DeployTournamentPool: Base Sepolia only (mainnet gated on legal review)"
            );
        }

        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address trustedSigner = vm.envAddress("SCORE_SIGNER_ADDRESS");

        console2.log("=== DeployTournamentPool ===");
        console2.log("Chain ID:       ", block.chainid);
        console2.log("Deployer:       ", deployer);
        console2.log("USDC (Sepolia): ", USDC_SEPOLIA);
        console2.log("Trusted Signer: ", trustedSigner);

        vm.startBroadcast(deployerPk);

        TournamentPool pool = new TournamentPool(IERC20(USDC_SEPOLIA), trustedSigner);

        vm.stopBroadcast();

        console2.log("=== Deployed (v2 - solo + retry fee) ===");
        console2.log("TournamentPool:", address(pool));
        console2.log("Owner:         ", pool.owner());
        console2.log("SCORE_WEIGHT:         ", pool.SCORE_WEIGHT());
        console2.log("PARTICIPATION_WEIGHT: ", pool.PARTICIPATION_WEIGHT());
        console2.log("MATCH_COUNT_CAP:      ", pool.MATCH_COUNT_CAP());
        console2.log("RETRY_FEE (USDC atoms):", pool.RETRY_FEE());
    }
}
