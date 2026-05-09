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
///         protected function rejected the reentry with the expected error.
///
///         Coverage claim:
///         - 5 functions protected by `nonReentrant` reject reentry with
///           `ReentrancyGuardReentrantCall`: createTournament, chargeEntryFee,
///           settle, withdrawFeesToDev, fundPrizePool.
///         - 1 function (`withdrawFeesToPlatform`) is protected by `onlyOwner`
///           firing FIRST (before `nonReentrant`); from a non-owner reentrant
///           context the substitute defense is `OwnableUnauthorizedAccount`.
///           Documented as a different defense, NOT a coverage gap.
///         - Submit paths (`submitScore`, `submitSoloScore`) lack `nonReentrant`
///           but the trustedSigner-signed digest (which includes the tournament
///           id) is unforgeable; reentry attempts revert `BadSignature`. Pinned
///           by the submitScore_ attempt below.
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

    bool public withdrawFeesToPlatform_reverted;
    bytes public withdrawFeesToPlatform_revertData;

    bool public submitScore_reverted;
    bytes public submitScore_revertData;

    /// @notice The tournament being created when this hook fires (passed via
    ///         `setExpectedTournamentId` from the test harness before triggering).
    bytes32 public expectedTournamentId;

    /// @notice A pre-computed signature from a non-trustedSigner key, formatted
    ///         correctly (so ECDSA.recover succeeds) but signed by a wrong key
    ///         (so the contract's `signer != trustedSigner` check fires
    ///         `BadSignature`). The test harness generates this via vm.sign(wrongPk, digest)
    ///         and calls `setFakeSig` before triggering the receiver hook.
    ///         A naive 65-byte zero sig would revert with `ECDSAInvalidSignature`
    ///         from OZ ECDSA before reaching the trustedSigner check; that's a
    ///         valid signature-gate defense too, but a different one.
    bytes public fakeSig;

    constructor(TournamentPool _pool) {
        pool = _pool;
    }

    function setExpectedTournamentId(bytes32 id) external {
        expectedTournamentId = id;
    }

    function setFakeSig(bytes calldata sig) external {
        fakeSig = sig;
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

        // 6) Re-enter withdrawFeesToPlatform — protected by onlyOwner FIRST,
        //    nonReentrant second. From this non-owner reentrant context, the
        //    expected revert is OwnableUnauthorizedAccount(this), NOT
        //    ReentrancyGuardReentrantCall. Substitute-defense documented in the
        //    coverage claim above.
        try pool.withdrawFeesToPlatform(expectedTournamentId) {
            withdrawFeesToPlatform_reverted = false;
        } catch (bytes memory data) {
            withdrawFeesToPlatform_reverted = true;
            withdrawFeesToPlatform_revertData = data;
        }

        // 7) Re-enter submitScore with a FAKE signature — pinning the substitute
        //    defense for submit-paths (no nonReentrant, but unforgeable
        //    trustedSigner-signed digest). The test harness pre-computes a
        //    valid-format wrong-signer sig via vm.sign(wrongPk, digest) and
        //    sets it via setFakeSig() before triggering this hook. That sig
        //    passes ECDSA.recover but fails the `signer != trustedSigner`
        //    check, reverting `BadSignature` — the substitute defense.
        try pool.submitScore(expectedTournamentId, address(this), 100, 1, keccak256("malicious-nonce"), fakeSig) {
            submitScore_reverted = false;
        } catch (bytes memory data) {
            submitScore_reverted = true;
            submitScore_revertData = data;
        }

        return this.onERC721Received.selector;
    }
}
