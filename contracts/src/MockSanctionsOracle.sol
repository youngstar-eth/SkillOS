// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ISanctionsOracle } from "./ISanctionsOracle.sol";

/// @title MockSanctionsOracle
/// @notice TESTNET-ONLY oracle that lets the owner curate a sanctions blacklist.
/// @author ceos.run (Simpl3 Inc.)
/// @dev Mainnet uses Chainalysis's on-chain oracle directly (no admin
///      endpoint). This mock matches the same `isSanctioned` view so
///      SponsorshipModule needs zero code change between environments.
///
///      Addressing the mainnet swap: deploy SponsorshipModule with the
///      Chainalysis address and never call addToBlacklist (it doesn't
///      exist on the real oracle). On testnet, the deployer can curate
///      a sanctions list to exercise the revert path.
contract MockSanctionsOracle is Ownable, ISanctionsOracle {
    error ZeroAddress();

    mapping(address => bool) public sanctioned;

    event AddedToBlacklist(address indexed addr);
    event RemovedFromBlacklist(address indexed addr);

    constructor() Ownable(msg.sender) {}

    /// @notice Mark `addr` as sanctioned.
    function addToBlacklist(address addr) external onlyOwner {
        if (addr == address(0)) revert ZeroAddress();
        sanctioned[addr] = true;
        emit AddedToBlacklist(addr);
    }

    /// @notice Clear the sanctioned flag for `addr`.
    function removeFromBlacklist(address addr) external onlyOwner {
        sanctioned[addr] = false;
        emit RemovedFromBlacklist(addr);
    }

    /// @inheritdoc ISanctionsOracle
    function isSanctioned(address addr) external view returns (bool) {
        return sanctioned[addr];
    }
}
