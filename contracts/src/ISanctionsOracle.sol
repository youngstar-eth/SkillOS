// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ISanctionsOracle
/// @notice Minimal oracle interface for sanctions screening.
/// @dev Compatible with the Chainalysis on-chain Sanctions Oracle deployed on
///      Base mainnet at 0x40C57923924B5c5c5455c48D93317139ADDaC8fb. The
///      MockSanctionsOracle in this repo implements the same interface for
///      testnet + Foundry tests, so production swap is a simple address change.
interface ISanctionsOracle {
    /// @notice True if the address is on the configured sanctions list.
    function isSanctioned(address addr) external view returns (bool);
}
