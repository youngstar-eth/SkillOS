// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { SkillbaseAnchor } from "../src/SkillbaseAnchor.sol";

/// @title DeploySkillbaseAnchor — SP ledger snapshot anchoring
/// @notice Deploys SkillbaseAnchor to Base Sepolia and authorizes the studio
///         wallet (matching STUDIO_PRIVATE_KEY) as the anchor.
///
/// @dev Usage (Base Sepolia):
///        forge script contracts/script/DeploySkillbaseAnchor.s.sol \
///          --rpc-url base_sepolia \
///          --broadcast --verify \
///          --etherscan-api-key $BASESCAN_API_KEY -vvvv
///
///      Required env vars:
///        DEPLOYER_PRIVATE_KEY  — Deployer EOA (same wallet used for TournamentPool deploy)
///        STUDIO_ANCHOR_ADDRESS — Address corresponding to STUDIO_PRIVATE_KEY; this is the
///                                wallet the daily cron uses to call anchorSnapshot().
///                                Compute via: cast wallet address $STUDIO_PRIVATE_KEY
///        BASESCAN_API_KEY      — For --verify flag (read via env, not passed inline)
///
///      Reverts if run against chain_id != Base Sepolia. Phase 1 is testnet-bounded
///      by design — mainnet deploy is audit-gated.
contract DeploySkillbaseAnchor is Script {
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;

    function run() external {
        require(
            block.chainid == CHAIN_BASE_SEPOLIA,
            "DeploySkillbaseAnchor: chain_id != Base Sepolia (Phase 1 testnet-only)"
        );

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address studioAnchor = vm.envAddress("STUDIO_ANCHOR_ADDRESS");

        require(studioAnchor != address(0), "STUDIO_ANCHOR_ADDRESS unset");

        console2.log("Deployer:        ", deployer);
        console2.log("Studio anchor:   ", studioAnchor);
        console2.log("Chain ID:        ", block.chainid);

        vm.startBroadcast(deployerKey);

        SkillbaseAnchor anchor = new SkillbaseAnchor(deployer);

        // Authorize the studio wallet (the cron's STUDIO_PRIVATE_KEY).
        // Deployer remains owner — owner can also anchor (onlyAnchor modifier
        // accepts owner via fallback) but in practice all writes flow from
        // the studio wallet via the anchor-sp-snapshot cron.
        anchor.setAuthorizedAnchor(studioAnchor, true);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== SkillbaseAnchor deployed ===");
        console2.log("Address:         ", address(anchor));
        console2.log("Owner:           ", deployer);
        console2.log("Authorized:      ", studioAnchor);
        console2.log("");
        console2.log("=== Next Steps ===");
        console2.log("1. Set NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS in .env + Vercel:");
        console2.log("   ", address(anchor));
        console2.log("2. forge verify-contract if --verify did not pick it up");
        console2.log("3. Trigger /api/cron/anchor-sp-snapshot manually 3x to populate history");
    }
}
