// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";

/// @title SponsorReceiptSBT
/// @notice Soulbound (non-transferable) ERC-721 minted to sponsors on successful
///         pool funding via SponsorshipModule. ERC-5192 compliant.
/// @author ceos.run (Simpl3 Inc.)
/// @dev Mint is restricted to a single immutable minter address (the
///      SponsorshipModule). Transfers and approvals revert. Burns are
///      permitted (sponsor can renounce their own receipt) for forward
///      compatibility — rarely useful in practice.
///
/// Soulbound enforcement: implemented at the lowest hook (`_update`), so
/// transferFrom, safeTransferFrom, and any future ERC721 extension that
/// transitions ownership all funnel through the same revert. Approvals
/// are blocked separately for defense-in-depth (a soulbound NFT should
/// not even appear approve-able in marketplace UIs).
///
/// Metadata is stored on-chain (no IPFS dependency) and rendered as a
/// data: URI from tokenURI(). For brand-verification use cases the JSON
/// contains tournamentId, amount (USDC atoms), sponsor, and timestamp —
/// enough to prove sponsorship participation without an off-chain index.
contract SponsorReceiptSBT is ERC721 {
    using Strings for uint256;
    using Strings for address;

    // ─── Errors ────────────────────────────────────────────────────────────────

    error TransferLocked();
    error ApprovalLocked();
    error NotMinter();
    error ZeroAddress();
    error TokenDoesNotExist();

    // ─── Types ─────────────────────────────────────────────────────────────────

    struct ReceiptMetadata {
        bytes32 tournamentId;
        uint256 amount;
        address sponsor;
        uint64 mintedAt;
    }

    // ─── State ─────────────────────────────────────────────────────────────────

    /// @notice Authorized minter — the SponsorshipModule. Immutable post-deploy.
    address public immutable MINTER;

    /// @notice Monotonic token id counter. First mint produces tokenId = 1.
    uint256 public nextTokenId;

    /// @notice On-chain metadata per receipt token.
    mapping(uint256 => ReceiptMetadata) public receiptOf;

    // ─── Events ────────────────────────────────────────────────────────────────

    /// @notice ERC-5192: emitted at mint to signal permanent lock.
    event Locked(uint256 tokenId);

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(address minter) ERC721("Skillbase Sponsor Receipt", "SKILL-SBT") {
        if (minter == address(0)) revert ZeroAddress();
        MINTER = minter;
    }

    // ─── Mint ──────────────────────────────────────────────────────────────────

    /// @notice Mint a new soulbound sponsor receipt to `to`.
    /// @dev    Restricted to the SponsorshipModule. Token id is auto-incremented.
    /// @param  to            Sponsor address (recipient).
    /// @param  tournamentId  Tournament being sponsored.
    /// @param  amount        USDC atoms contributed in this sponsorship event.
    /// @return tokenId       Newly minted token id (>= 1).
    function mint(address to, bytes32 tournamentId, uint256 amount) external returns (uint256 tokenId) {
        if (msg.sender != MINTER) revert NotMinter();
        if (to == address(0)) revert ZeroAddress();

        unchecked {
            tokenId = ++nextTokenId;
        }

        receiptOf[tokenId] = ReceiptMetadata({
            tournamentId: tournamentId,
            amount: amount,
            sponsor: to,
            mintedAt: uint64(block.timestamp)
        });

        _safeMint(to, tokenId);
        emit Locked(tokenId);
    }

    // ─── ERC-5192 ──────────────────────────────────────────────────────────────

    /// @notice ERC-5192: returns true for any existing token (always locked).
    function locked(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        return true;
    }

    /// @notice ERC-165: declare ERC-5192 support (0xb45a3c0e) plus parent.
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }

    // ─── Soulbound Enforcement ─────────────────────────────────────────────────

    /// @dev Lowest-level hook in OZ v5 ERC721. Allows mint (from == 0) and burn
    ///      (to == 0); reverts on any owner-to-owner transition.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert TransferLocked();
        return super._update(to, tokenId, auth);
    }

    /// @dev Block approvals — a soulbound NFT cannot be transferred, so an
    ///      approval has no legitimate effect and just confuses marketplace UIs.
    function approve(address, uint256) public virtual override {
        revert ApprovalLocked();
    }

    /// @dev Block setApprovalForAll for the same reason.
    function setApprovalForAll(address, bool) public virtual override {
        revert ApprovalLocked();
    }

    // ─── Metadata ──────────────────────────────────────────────────────────────

    /// @notice Returns a base64-encoded data: URI with on-chain JSON metadata.
    /// @dev    Self-contained — no IPFS / HTTP dependency. Includes tournament
    ///         id, sponsored amount, sponsor address, and mint timestamp.
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        ReceiptMetadata memory r = receiptOf[tokenId];
        bytes memory json = _buildJSON(tokenId, r);
        return string(
            abi.encodePacked("data:application/json;base64,", Base64.encode(json))
        );
    }

    /// @dev Split out from tokenURI to keep stack depth manageable without via_ir.
    function _buildJSON(uint256 tokenId, ReceiptMetadata memory r) internal pure returns (bytes memory) {
        bytes memory head = abi.encodePacked(
            '{"name":"Skillbase Sponsor Receipt #', tokenId.toString(),
            '","description":"Soulbound proof of permissionless sponsorship for a Skillbase tournament prize pool.",',
            '"attributes":['
        );
        bytes memory attrs = abi.encodePacked(
            '{"trait_type":"Tournament","value":"0x', _toHexString(r.tournamentId), '"},',
            '{"trait_type":"Amount (USDC atoms)","value":', r.amount.toString(), '},',
            '{"trait_type":"Sponsor","value":"', r.sponsor.toHexString(), '"},',
            '{"trait_type":"Minted At","display_type":"date","value":', uint256(r.mintedAt).toString(), '}',
            ']}'
        );
        return abi.encodePacked(head, attrs);
    }

    function _toHexString(bytes32 value) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory result = new bytes(64);
        for (uint256 i = 0; i < 32; ++i) {
            result[i * 2] = alphabet[uint8(value[i] >> 4)];
            result[i * 2 + 1] = alphabet[uint8(value[i] & 0x0f)];
        }
        return string(result);
    }
}
