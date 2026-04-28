// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SkillbaseAnchor — On-chain provenance for Skillbase SP ledger snapshots
/// @notice Stores SHA-256 snapshot hashes per timestamp.
///         Provides cryptographic proof that a specific SP ledger state existed at a
///         specific moment without exposing raw wallet data on-chain.
///
/// @dev Architecture:
///      1. Backend reads SP ledger from Supabase v2_user_stats (all wallets, non-zero SP)
///      2. Backend canonicalizes the ledger (deterministic JSON, sorted keys)
///      3. Backend computes SHA-256 of canonical form
///      4. Backend calls anchorSnapshot(timestamp, hash) — onlyAuthorized
///      5. Anyone can verify: verifySnapshot(timestamp, expectedHash) → bool
///
///      Ported from ceos.run DecisionAnchor.sol with two adaptations:
///        (a) flat mapping(timestamp → hash) instead of nested (agentTokenId, epoch → hash)
///            because Skillbase has one global SP ledger, not per-agent decision logs
///        (b) event first-topic bug fixed (source emitted decisionHash twice; we emit
///            timestamp as the first indexed topic so AI lab event subscribers can
///            index snapshots by their natural key)
///
///      Permissioning:
///        - anchorSnapshot: onlyAnchor modifier (deployer-controlled backend wallet)
///        - Verification functions: public (anyone can verify)
///
///      Security:
///        - One anchor per timestamp — immutable after write
///        - Zero hash and zero timestamp rejected
///        - ReentrancyGuard on writes
contract SkillbaseAnchor is Ownable, ReentrancyGuard {
    // ── Errors ──────────────────────────────────────────────────────
    error AlreadyAnchored();
    error InvalidHash();
    error InvalidTimestamp();
    error ZeroAddress();
    error UnauthorizedAnchor();

    // ── Events ──────────────────────────────────────────────────────
    event SnapshotAnchored(
        uint256 indexed timestamp,
        bytes32 indexed snapshotHash,
        uint256 anchoredAt
    );
    event AnchorAuthorized(address indexed anchor, bool authorized);

    // ── State ───────────────────────────────────────────────────────

    /// @notice timestamp_unix → SHA-256 hash of canonical SP ledger JSON
    mapping(uint256 => bytes32) public snapshots;

    /// @notice Authorized anchor addresses (server wallets that can write snapshots)
    mapping(address => bool) public authorizedAnchors;

    /// @notice Total number of snapshots anchored
    uint256 public totalAnchored;

    // ── Modifiers ───────────────────────────────────────────────

    modifier onlyAnchor() {
        if (!authorizedAnchors[msg.sender] && msg.sender != owner()) revert UnauthorizedAnchor();
        _;
    }

    // ── Constructor ─────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {
        if (_owner == address(0)) revert ZeroAddress();
    }

    // ── Write Functions ─────────────────────────────────────────

    /// @notice Anchor a snapshot hash for a specific timestamp
    /// @param timestamp The unix timestamp this snapshot represents (the on-chain slot key)
    /// @param snapshotHash The SHA-256 hash of the canonical SP ledger JSON
    function anchorSnapshot(
        uint256 timestamp,
        bytes32 snapshotHash
    ) external onlyAnchor nonReentrant {
        if (snapshotHash == bytes32(0)) revert InvalidHash();
        if (timestamp == 0) revert InvalidTimestamp();
        if (snapshots[timestamp] != bytes32(0)) revert AlreadyAnchored();

        snapshots[timestamp] = snapshotHash;
        totalAnchored++;

        emit SnapshotAnchored(timestamp, snapshotHash, block.timestamp);
    }

    // ── View Functions ──────────────────────────────────────────

    /// @notice Get the anchored hash for a snapshot at a specific timestamp
    /// @param timestamp The timestamp to query
    /// @return The anchored snapshot hash (bytes32(0) if not anchored)
    function getSnapshotHash(uint256 timestamp) external view returns (bytes32) {
        return snapshots[timestamp];
    }

    /// @notice Verify that a given hash matches the anchored snapshot
    /// @param timestamp The timestamp to verify
    /// @param expectedHash The hash to compare against
    /// @return True if the hashes match
    function verifySnapshot(
        uint256 timestamp,
        bytes32 expectedHash
    ) external view returns (bool) {
        return snapshots[timestamp] == expectedHash;
    }

    // ── Admin Functions ─────────────────────────────────────────

    /// @notice Authorize or deauthorize an address to anchor snapshots
    /// @param anchor The address to authorize/deauthorize
    /// @param authorized Whether the address should be authorized
    function setAuthorizedAnchor(address anchor, bool authorized) external onlyOwner {
        if (anchor == address(0)) revert ZeroAddress();
        authorizedAnchors[anchor] = authorized;
        emit AnchorAuthorized(anchor, authorized);
    }
}
