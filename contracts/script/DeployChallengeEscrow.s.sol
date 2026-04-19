// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title DeployChallengeEscrow — F2 Non-Custodial On-Chain Escrow
/// @notice Deploys ChallengeEscrow to Base Sepolia (or Mainnet).
///
/// @dev Usage (Base Sepolia):
///        forge script contracts/script/DeployChallengeEscrow.s.sol \
///          --rpc-url $BASE_SEPOLIA_RPC_URL \
///          --broadcast --verify \
///          --etherscan-api-key $BASESCAN_API_KEY -vvvv
///
///      Required env vars:
///        DEPLOYER_PRIVATE_KEY  — Deployer EOA private key
///        USDC_ADDRESS          — USDC token (Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e)
///        TRUSTED_SIGNER        — Server-side EOA that signs attestations
///        FEE_VAULT             — Address that receives 10% platform fee
contract DeployChallengeEscrow is Script {
    uint256 constant CHAIN_BASE_MAINNET = 8453;
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;

    // Base Sepolia USDC (Circle)
    address constant USDC_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    // Base Mainnet USDC
    address constant USDC_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        address trustedSigner = vm.envAddress("TRUSTED_SIGNER");
        address feeVault = vm.envAddress("FEE_VAULT");

        address usdcAddr;
        if (block.chainid == CHAIN_BASE_MAINNET) {
            usdcAddr = USDC_MAINNET;
        } else if (block.chainid == CHAIN_BASE_SEPOLIA) {
            usdcAddr = USDC_SEPOLIA;
        } else {
            // Local fork — read from env
            usdcAddr = vm.envAddress("USDC_ADDRESS");
        }

        console2.log("=== DeployChallengeEscrow ===");
        console2.log("Chain ID:       ", block.chainid);
        console2.log("Deployer:       ", deployer);
        console2.log("USDC:           ", usdcAddr);
        console2.log("Trusted Signer: ", trustedSigner);
        console2.log("Fee Vault:      ", feeVault);

        vm.startBroadcast(deployerPk);

        ChallengeEscrow escrow = new ChallengeEscrow(IERC20(usdcAddr), trustedSigner, feeVault);

        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("ChallengeEscrow:", address(escrow));
        console2.log("Owner:          ", escrow.owner());
        console2.log("FEE_BPS:        ", escrow.FEE_BPS());
    }
}
