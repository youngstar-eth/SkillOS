// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TournamentPool} from "../src/TournamentPool.sol";
import {DevAttributionNFT} from "../src/DevAttributionNFT.sol";
import {MockSanctionsOracle} from "../src/MockSanctionsOracle.sol";
import {SponsorReceiptSBT} from "../src/SponsorReceiptSBT.sol";
import {SponsorshipModule, ITournamentPool} from "../src/SponsorshipModule.sol";
import {ISanctionsOracle} from "../src/ISanctionsOracle.sol";

/// @title DeploySponsorStack — Permissionless Sponsor Pool stack
/// @notice Deploys TournamentPool v2.1 (with fundPrizePool), MockSanctionsOracle,
///         SponsorReceiptSBT, and SponsorshipModule on Base Sepolia.
///
/// @dev Usage (Base Sepolia):
///        forge script contracts/script/DeploySponsorStack.s.sol \
///          --rpc-url base_sepolia \
///          --broadcast --verify \
///          --etherscan-api-key $BASESCAN_API_KEY -vvvv
///
///      Required env vars:
///        DEPLOYER_PRIVATE_KEY    — Deployer EOA (must hold Base Sepolia ETH)
///        SCORE_SIGNER_ADDRESS    — Trusted signer for the v2.1 pool
///        BASESCAN_API_KEY        — For --verify
///
///      Mainnet deploy is gated. This script reverts on chain_id != Base Sepolia.
///
/// Deployment order (CREATE address prediction):
///   1. TournamentPool (v2.1)
///   2. MockSanctionsOracle
///   3. SponsorReceiptSBT(predictedModuleAddr)  ← predict next-next deployer address
///   4. SponsorshipModule(...)                  ← address must match prediction
contract DeploySponsorStack is Script {
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;

    /// @dev Base Sepolia USDC (Circle).
    address constant USDC_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        if (block.chainid != CHAIN_BASE_SEPOLIA) {
            revert("DeploySponsorStack: Base Sepolia only (mainnet gated on legal review)");
        }

        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address trustedSigner = vm.envAddress("SCORE_SIGNER_ADDRESS");

        console2.log("=== DeploySponsorStack ===");
        console2.log("Chain ID:       ", block.chainid);
        console2.log("Deployer:       ", deployer);
        console2.log("USDC (Sepolia): ", USDC_SEPOLIA);
        console2.log("Trusted Signer: ", trustedSigner);

        // Predict TournamentPool address ahead of broadcast — DevAttributionNFT
        // (deployed first) needs to pin the pool's address into its immutable.
        // Pool deploys at deployerNonce + 1 (NFT uses nonce, then pool).
        uint256 deployerNonce = vm.getNonce(deployer);
        address predictedPool = vm.computeCreateAddress(deployer, deployerNonce + 1);

        vm.startBroadcast(deployerPk);

        // 0. DevAttributionNFT (v2.2 — pinned to predicted pool address).
        DevAttributionNFT devNFT = new DevAttributionNFT(predictedPool);

        // 1. TournamentPool v2.2 (entry-fee 70/30 split + DevAttributionNFT mint).
        TournamentPool pool = new TournamentPool(IERC20(USDC_SEPOLIA), trustedSigner, address(devNFT));
        require(address(pool) == predictedPool, "DeploySponsorStack: pool address prediction mismatch");

        // 2. Sanctions oracle (testnet mock — production swaps to Chainalysis address).
        MockSanctionsOracle oracle = new MockSanctionsOracle();

        // 3. Predict the SponsorshipModule address ahead of time so the SBT can be
        //    deployed with a non-zero immutable minter. Module is the next-next
        //    deployment after SBT, so we add +1 to the post-SBT nonce.
        uint256 nonceAfterOracle = vm.getNonce(deployer);
        address predictedModule = vm.computeCreateAddress(deployer, nonceAfterOracle + 1);
        SponsorReceiptSBT receipt = new SponsorReceiptSBT(predictedModule);

        // 4. SponsorshipModule — wires USDC, pool v2.1, receipt SBT, sanctions oracle.
        SponsorshipModule module = new SponsorshipModule(
            IERC20(USDC_SEPOLIA), ITournamentPool(address(pool)), receipt, ISanctionsOracle(address(oracle))
        );

        // Sanity check the predicted address held — if not, the receipt's MINTER
        // points to the wrong contract and mints would revert.
        require(address(module) == predictedModule, "module address mismatch");

        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("TournamentPool (v2.1): ", address(pool));
        console2.log("MockSanctionsOracle:   ", address(oracle));
        console2.log("SponsorReceiptSBT:     ", address(receipt));
        console2.log("SponsorshipModule:     ", address(module));
        console2.log("");
        console2.log("Pool owner:            ", pool.owner());
        console2.log("Oracle owner:          ", oracle.owner());
        console2.log("Module owner:          ", module.owner());
        console2.log("SBT MINTER:            ", receipt.MINTER());
    }
}
