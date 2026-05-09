// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {TournamentPool} from "../../src/TournamentPool.sol";

/// @title MaliciousReentrantDev — F5 receiver-hook reentrancy attacker
/// @notice Implements `onERC721Received` to recurse into TournamentPool's
///         nonReentrant-protected functions. Each attempt is wrapped in try/catch so
///         the whole `createTournament` call (which triggers the receiver hook via
///         `_safeMint`) doesn't bubble the revert up — instead, the mock records
///         which attempts reverted with what error. Tests then assert each
///         protected function rejected the reentry with `ReentrancyGuardReentrantCall`.
///
///         Submit paths (`submitScore`, `submitSoloScore`) are deliberately NOT tested
///         here — they lack `nonReentrant`, but a malicious caller cannot forge the
///         trustedSigner-signed digest (which includes the tournament id), so reentry
///         attempts on those would fail with `BadSignature` rather than reentrancy.
///         The reentrancy-coverage claim is: every nonReentrant-protected function
///         rejects reentry with `ReentrancyGuardReentrantCall`.
contract MaliciousReentrantDev is IERC721Receiver {
    TournamentPool public immutable pool;

    // Per-attempt outcome records.
    bool public createTournament_reverted;
    bytes public createTournament_revertData;

    bool public chargeEntryFee_reverted;
    bytes public chargeEntryFee_revertData;

    bool public settle_reverted;
    bytes public settle_revertData;

    bool public withdrawFeesToDev_reverted;
    bytes public withdrawFeesToDev_revertData;

    bool public fundPrizePool_reverted;
    bytes public fundPrizePool_revertData;

    /// @notice The tournament being created when this hook fires (passed via
    ///         `setExpectedTournamentId` from the test harness before triggering).
    bytes32 public expectedTournamentId;

    constructor(TournamentPool _pool) {
        pool = _pool;
    }

    function setExpectedTournamentId(bytes32 id) external {
        expectedTournamentId = id;
    }

    /// @notice ERC-721 receiver hook — the attack surface.
    /// @dev    Called by `_safeMint` during `DevAttributionNFT.mint(dev=this)`,
    ///         which is itself called from `TournamentPool.createTournament`.
    ///         Every recursive call into the pool here lands inside the outer
    ///         createTournament's nonReentrant scope.
    function onERC721Received(address, address, uint256, bytes calldata) external override returns (bytes4) {
        // 1) Re-enter createTournament (nonReentrant — must revert).
        try pool.createTournament(
            keccak256("malicious-attempt"),
            address(this),
            keccak256("game"),
            TournamentPool.CycleType.Daily,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 days),
            1_000_000,
            50
        ) {
            createTournament_reverted = false;
        } catch (bytes memory data) {
            createTournament_reverted = true;
            createTournament_revertData = data;
        }

        // 2) Re-enter chargeEntryFee on the in-flight tournament (nonReentrant — must revert).
        try pool.chargeEntryFee(expectedTournamentId, address(this)) {
            chargeEntryFee_reverted = false;
        } catch (bytes memory data) {
            chargeEntryFee_reverted = true;
            chargeEntryFee_revertData = data;
        }

        // 3) Re-enter settle (nonReentrant — must revert; nonReentrant fires before
        //    other lifecycle checks like TournamentNotEnded).
        address[] memory empty = new address[](0);
        try pool.settle(expectedTournamentId, empty) {
            settle_reverted = false;
        } catch (bytes memory data) {
            settle_reverted = true;
            settle_revertData = data;
        }

        // 4) Re-enter withdrawFeesToDev (nonReentrant — must revert).
        try pool.withdrawFeesToDev(expectedTournamentId) {
            withdrawFeesToDev_reverted = false;
        } catch (bytes memory data) {
            withdrawFeesToDev_reverted = true;
            withdrawFeesToDev_revertData = data;
        }

        // 5) Re-enter fundPrizePool (nonReentrant — must revert).
        try pool.fundPrizePool(expectedTournamentId, 1_000_000) {
            fundPrizePool_reverted = false;
        } catch (bytes memory data) {
            fundPrizePool_reverted = true;
            fundPrizePool_revertData = data;
        }

        return this.onERC721Received.selector;
    }
}
