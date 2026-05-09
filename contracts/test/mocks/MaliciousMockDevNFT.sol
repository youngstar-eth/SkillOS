// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IDevAttributionNFT} from "../../src/DevAttributionNFT.sol";

/// @title TournamentPoolView — minimal pool surface used by the mock to read cache.
/// @dev   Inlined to avoid pulling the full TournamentPool ABI into the mock.
interface ITournamentPoolView {
    function devNFTMinted(address dev) external view returns (bool);
}

/// @title MaliciousMockDevNFT — F4 cache-ordering observer
/// @notice Implements `IDevAttributionNFT.mint` as an OBSERVER, not an actual minter.
///         When the bound TournamentPool calls `mint(devAddr)`, this mock reads back
///         `pool.devNFTMinted(devAddr)` and records what it saw. This proves whether
///         `TournamentPool.createTournament` flipped the cache BEFORE making the
///         external mint call (CEI), or after (a CEI violation that would let a
///         malicious NFT replacement read stale cache state mid-callback).
/// @dev    The mock is not a real ERC-721 — it just satisfies the IDevAttributionNFT
///         interface so a TournamentPool can be constructed with it as `_devNFT`. Use
///         in dedicated test functions that deploy a separate pool bound to this mock
///         (not the standard pool from setUp which uses the real DevAttributionNFT).
contract MaliciousMockDevNFT is IDevAttributionNFT {
    /// @notice The TournamentPool authorized to call mint(). Pinned at construction
    ///         via address-prediction, mirroring the real DevAttributionNFT pattern.
    address public immutable tournamentPool;

    /// @notice Was `pool.devNFTMinted(dev)` already true when mint() was invoked?
    ///         If true, proves the cache was set BEFORE the external call (CEI holds).
    ///         If false, would prove CEI was violated (cache set after the external call).
    bool public cacheTrueAtMintTime;

    /// @notice Records the address `dev` argument the pool passed in, for cross-check.
    address public observedDev;

    /// @notice Number of times mint() was called — should be 1 for a single-tournament test.
    uint256 public mintCallCount;

    error OnlyTournamentPool();

    constructor(address _tournamentPool) {
        tournamentPool = _tournamentPool;
    }

    /// @notice Observer-only mint: reads pool state, does not mutate any external state.
    /// @dev    The pool's call sequence inside createTournament is:
    ///           devNFTMinted[devAddr] = true;   // cache flip
    ///           devNFT.mint(devAddr);            // external call -> this function
    ///         If `cacheTrueAtMintTime` reads true post-call, the cache flip
    ///         preceded the external invocation (the CEI ordering we want to verify).
    function mint(address dev) external override {
        if (msg.sender != tournamentPool) revert OnlyTournamentPool();
        cacheTrueAtMintTime = ITournamentPoolView(tournamentPool).devNFTMinted(dev);
        observedDev = dev;
        mintCallCount += 1;
    }
}
