// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { ISanctionsOracle } from "./ISanctionsOracle.sol";
import { SponsorReceiptSBT } from "./SponsorReceiptSBT.sol";

/// @notice Minimal interface to TournamentPool's fundPrizePool entry point.
/// @dev    Inlined to avoid importing the full v2.1 contract surface.
interface ITournamentPool {
    function fundPrizePool(bytes32 id, uint256 amount) external;
}

/// @title SponsorshipModule
/// @notice Permissionless sponsor-onramp for TournamentPool prize pools.
/// @author ceos.run (Simpl3 Inc.)
/// @dev Flow per sponsorship event:
///   1. Sanctions check on msg.sender via injected oracle.
///   2. Pull USDC from sponsor to this module (sponsor must pre-approve).
///   3. Forward USDC to TournamentPool via fundPrizePool() — module's
///      max allowance to the pool is set once at construction.
///   4. Mint a soulbound SponsorReceiptSBT to the sponsor.
///   5. Track per-(tournament, sponsor) cumulative contribution and the
///      unique-sponsor count per tournament.
///   6. Emit PoolSponsored.
///
/// Sanctions oracle is hot-swappable by owner (testnet → mainnet
/// migration, or future Chainalysis address rotation). Pool, USDC, and
/// receipt addresses are immutable — replacing them implies a new module
/// deployment.
///
/// Reentrancy posture: sponsorPool is nonReentrant. The only callback
/// surface is SBT._safeMint → onERC721Received on contract sponsors.
/// State writes that depend on this transaction are completed before
/// the mint call so a malicious sponsor contract can only observe a
/// consistent post-state.
contract SponsorshipModule is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Errors ────────────────────────────────────────────────────────────────

    error SponsorSanctioned();
    error ZeroAddress();
    error ZeroAmount();

    // ─── State (immutable) ─────────────────────────────────────────────────────

    /// @notice USDC (6 decimals) — the only supported sponsor currency.
    IERC20 public immutable USDC;

    /// @notice TournamentPool v2.1 with fundPrizePool entry point.
    ITournamentPool public immutable POOL;

    /// @notice Soulbound receipt token contract. This module is its sole minter.
    SponsorReceiptSBT public immutable RECEIPT;

    // ─── State (mutable) ───────────────────────────────────────────────────────

    /// @notice Sanctions oracle. Owner can rotate (testnet mock ↔ Chainalysis).
    ISanctionsOracle public sanctionsOracle;

    /// @notice Cumulative USDC contributed per (tournament, sponsor).
    mapping(bytes32 => mapping(address => uint256)) public sponsorContributions;

    /// @notice Unique sponsor count per tournament.
    mapping(bytes32 => uint256) public totalSponsorsByTournament;

    /// @dev Internal flag: has `sponsor` ever sponsored `tournamentId`?
    ///      Used to avoid double-counting in totalSponsorsByTournament.
    mapping(bytes32 => mapping(address => bool)) private _hasSponsored;

    // ─── Events ────────────────────────────────────────────────────────────────

    event PoolSponsored(
        bytes32 indexed tournamentId,
        address indexed sponsor,
        uint256 amount,
        uint256 receiptTokenId
    );
    event SanctionsOracleUpdated(address indexed previousOracle, address indexed newOracle);

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(
        IERC20 usdc,
        ITournamentPool pool,
        SponsorReceiptSBT receipt,
        ISanctionsOracle oracle
    ) Ownable(msg.sender) {
        if (address(usdc) == address(0)) revert ZeroAddress();
        if (address(pool) == address(0)) revert ZeroAddress();
        if (address(receipt) == address(0)) revert ZeroAddress();
        if (address(oracle) == address(0)) revert ZeroAddress();

        USDC = usdc;
        POOL = pool;
        RECEIPT = receipt;
        sanctionsOracle = oracle;

        // Set max allowance once — module never holds USDC outside a sponsorPool tx,
        // and pool is the only authorized recipient.
        usdc.forceApprove(address(pool), type(uint256).max);
    }

    // ─── Sponsor Entry Point ───────────────────────────────────────────────────

    /// @notice Permissionlessly fund a tournament's prize pool.
    /// @dev    Pre-flight ordering (cheap → expensive, regulatory must-checks first):
    ///           1. amount > 0 (free)
    ///           2. sanctions screen (single SLOAD on oracle)
    ///           3. USDC.safeTransferFrom (external, requires prior approval)
    ///           4. POOL.fundPrizePool (bubbles TournamentNotFound /
    ///              TournamentAlreadySettled with native errors)
    ///           5. SBT.mint (after pool succeeds → no orphan receipts)
    /// @param  tournamentId  Tournament to sponsor.
    /// @param  amount        USDC atoms (6 decimals).
    /// @return receiptTokenId  The minted soulbound receipt token id.
    function sponsorPool(bytes32 tournamentId, uint256 amount)
        external
        nonReentrant
        returns (uint256 receiptTokenId)
    {
        if (amount == 0) revert ZeroAmount();
        if (sanctionsOracle.isSanctioned(msg.sender)) revert SponsorSanctioned();

        USDC.safeTransferFrom(msg.sender, address(this), amount);
        POOL.fundPrizePool(tournamentId, amount);

        // Effects: tracking state must be authoritative before SBT mint
        // (which can callback into a contract sponsor via onERC721Received).
        sponsorContributions[tournamentId][msg.sender] += amount;
        if (!_hasSponsored[tournamentId][msg.sender]) {
            _hasSponsored[tournamentId][msg.sender] = true;
            unchecked {
                totalSponsorsByTournament[tournamentId] += 1;
            }
        }

        receiptTokenId = RECEIPT.mint(msg.sender, tournamentId, amount);

        emit PoolSponsored(tournamentId, msg.sender, amount, receiptTokenId);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Rotate the sanctions oracle (testnet → mainnet, or vendor change).
    function setSanctionsOracle(ISanctionsOracle newOracle) external onlyOwner {
        if (address(newOracle) == address(0)) revert ZeroAddress();
        address prev = address(sanctionsOracle);
        sanctionsOracle = newOracle;
        emit SanctionsOracleUpdated(prev, address(newOracle));
    }
}
