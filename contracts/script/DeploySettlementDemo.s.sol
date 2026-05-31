// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {SettlementDemo} from "../src/SettlementDemo.sol";

/// @title DeploySettlementDemo — Faz 0 Pitch-MVP standalone challenge-loop demo
/// @notice Deploys SettlementDemo to Base Sepolia via a cast KEYSTORE broadcast —
///         the deployer key is encrypted at rest in `~/.foundry/keystores` and is
///         unlocked only via `--account`/`--password-file`; the raw private key
///         never reaches the agent or the shell. Enforces `deployer != resolver`
///         (distinct trust roles; Settlement SPEC §9 / dispatch Stage 3).
///
/// @dev The broadcasting EOA (owner) is supplied by forge's `--sender`/`--account`
///      keystore — the script reads it from `msg.sender`, not from any env key.
///
///      Dry-run (no broadcast; --sender just needs to differ from RESOLVER_ADDRESS):
///        RESOLVER_ADDRESS=0x<resolver-eoa> \
///        forge script script/DeploySettlementDemo.s.sol:DeploySettlementDemo \
///          --sender 0x<deployer-eoa> -vvvv
///
///      Broadcast to Base Sepolia (keystore-signed; key stays encrypted):
///        RESOLVER_ADDRESS=0x<resolver-eoa> \
///        forge script script/DeploySettlementDemo.s.sol:DeploySettlementDemo \
///          --rpc-url "$RPC" --account deployer --sender 0x<deployer-eoa> \
///          --password-file <path> --broadcast -vvvv
///        (optional Basescan source verification: append
///          --verify --etherscan-api-key $BASESCAN_API_KEY)
///
///      Required env:
///        RESOLVER_ADDRESS — resolver role address; MUST differ from deployer
contract DeploySettlementDemo is Script {
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;

    function run() external returns (SettlementDemo demo) {
        // Deployer/owner = the keystore EOA forge signs with (via --account/--sender).
        // No private key is read here — the key stays encrypted in the keystore.
        address deployer = msg.sender;
        address resolver = vm.envAddress("RESOLVER_ADDRESS");

        require(resolver != address(0), "RESOLVER_ADDRESS is zero");
        require(deployer != resolver, "deployer == resolver: Stage 3 requires distinct roles");

        console2.log("=== DeploySettlementDemo (Faz 0) ===");
        console2.log("Chain ID:         ", block.chainid);
        console2.log("Deployer (owner): ", deployer);
        console2.log("Resolver:         ", resolver);

        vm.startBroadcast();
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
