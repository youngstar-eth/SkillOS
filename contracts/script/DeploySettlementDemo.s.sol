// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {SettlementDemo} from "../src/SettlementDemo.sol";

/// @title DeploySettlementDemo — Faz 0 Pitch-MVP standalone challenge-loop demo
/// @notice Deploys SettlementDemo to Base Sepolia. The FOUNDER broadcasts —
///         `DEPLOYER_PRIVATE_KEY` lives only in the founder's local environment
///         and never reaches the agent. Enforces `deployer != resolver`
///         (distinct trust roles; Settlement SPEC §9 / dispatch Stage 3).
///
/// @dev Dry-run (no broadcast; a throwaway key is fine — nothing is signed):
///        DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
///        RESOLVER_ADDRESS=0x000000000000000000000000000000000000dEaD \
///        forge script script/DeploySettlementDemo.s.sol:DeploySettlementDemo -vvvv
///
///      Broadcast to Base Sepolia (founder runs locally):
///        DEPLOYER_PRIVATE_KEY=0x<founder-key>  RESOLVER_ADDRESS=0x<resolver-eoa> \
///        forge script script/DeploySettlementDemo.s.sol:DeploySettlementDemo \
///          --rpc-url base_sepolia --broadcast -vvvv
///        (optional Basescan source verification: append
///          --verify --etherscan-api-key $BASESCAN_API_KEY)
///
///      Required env:
///        DEPLOYER_PRIVATE_KEY  — deployer EOA key (founder-local; broadcast only)
///        RESOLVER_ADDRESS      — resolver role address; MUST differ from deployer
contract DeploySettlementDemo is Script {
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;

    function run() external returns (SettlementDemo demo) {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address resolver = vm.envAddress("RESOLVER_ADDRESS");

        require(resolver != address(0), "RESOLVER_ADDRESS is zero");
        require(deployer != resolver, "deployer == resolver: Stage 3 requires distinct roles");

        console2.log("=== DeploySettlementDemo (Faz 0) ===");
        console2.log("Chain ID:         ", block.chainid);
        console2.log("Deployer (owner): ", deployer);
        console2.log("Resolver:         ", resolver);

        vm.startBroadcast(deployerPk);
        demo = new SettlementDemo(resolver);
        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("SettlementDemo: ", address(demo));
        console2.log("Owner:          ", demo.owner());
        console2.log("Resolver:       ", demo.resolver());

        // Sanity: the on-chain wiring matches the intended distinct roles.
        require(demo.owner() == deployer, "owner != deployer");
        require(demo.resolver() == resolver, "resolver mismatch");
        require(demo.owner() != demo.resolver(), "owner == resolver");
    }
}
