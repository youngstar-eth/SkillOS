// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArcadePool} from "../src/ArcadePool.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address signer = vm.envAddress("SCORE_SIGNER_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        vm.startBroadcast(pk);
        ArcadePool pool = new ArcadePool(usdc, signer, feeRecipient);
        console.log("ArcadePool deployed:", address(pool));
        console.log("USDC:", usdc);
        console.log("Score signer:", signer);
        console.log("Fee recipient:", feeRecipient);
        vm.stopBroadcast();
    }
}
