// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {TournamentPool} from "../src/TournamentPool.sol";
import {DevAttributionNFT} from "../src/DevAttributionNFT.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
            revert("DeployTournamentPool: Base Sepolia only (mainnet gated on legal review)");
        }

        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address trustedSigner = vm.envAddress("SCORE_SIGNER_ADDRESS");

        console2.log("=== DeployTournamentPool ===");
        console2.log("Chain ID:       ", block.chainid);
        console2.log("Deployer:       ", deployer);
        console2.log("USDC (Sepolia): ", USDC_SEPOLIA);
        console2.log("Trusted Signer: ", trustedSigner);

        // Predict the TournamentPool address before broadcasting. The deployer's
        // current nonce is used by the next broadcast tx (DevAttributionNFT
        // deploy); the pool will be deployed at nonce+1.
        uint256 deployerNonce = vm.getNonce(deployer);
        address predictedPool = vm.computeCreateAddress(deployer, deployerNonce + 1);
        console2.log("Predicted Pool: ", predictedPool);

        vm.startBroadcast(deployerPk);

        // Deploy DevAttributionNFT first (uses deployerNonce), pinned to the
        // predicted pool address.
        DevAttributionNFT devNFT = new DevAttributionNFT(predictedPool);

        // Deploy TournamentPool with the NFT address (uses deployerNonce + 1).
        TournamentPool pool = new TournamentPool(IERC20(USDC_SEPOLIA), trustedSigner, address(devNFT));

        vm.stopBroadcast();

        // Sanity: prediction must hold or we deployed an NFT bound to nothing.
        require(address(pool) == predictedPool, "Deploy: pool address prediction mismatch");

        // Δ1 (v2.3): the constructor is UNCHANGED from v2.2 — the Arena config is
        // per-tournament state set at createTournament, not a constructor arg. So
        // this same script deploys the v2.3 bytecode (Tournament struct + config
        // enums + TournamentConfigured event). Post-deploy, verify the new surface
        // with script/AssertTournamentPoolV23.s.sol (reads a canary tournament's
        // config and asserts it defaults correctly).
        console2.log("=== Deployed (v2.3 - Delta1 Arena config + DevAttributionNFT + 70/30 split) ===");
        console2.log("TournamentPool:    ", address(pool));
        console2.log("DevAttributionNFT: ", address(devNFT));
        console2.log("Owner:                ", pool.owner());
        console2.log("SCORE_WEIGHT:         ", pool.SCORE_WEIGHT());
        console2.log("PARTICIPATION_WEIGHT: ", pool.PARTICIPATION_WEIGHT());
        console2.log("MATCH_COUNT_CAP:      ", pool.MATCH_COUNT_CAP());
        console2.log("ENTRY_FEE (USDC atoms):", pool.ENTRY_FEE());
        console2.log("DEV_BPS:              ", pool.DEV_BPS());
        console2.log("PLATFORM_BPS:         ", pool.PLATFORM_BPS());
        console2.log("TOTAL_BPS:            ", pool.TOTAL_BPS());
    }
}
