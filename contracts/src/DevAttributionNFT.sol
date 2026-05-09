// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title IERC5192 — Minimal Soulbound Token interface
/// @dev   https://eips.ethereum.org/EIPS/eip-5192. Defined inline because the
///        OpenZeppelin contracts package does not ship a canonical IERC5192.
interface IERC5192 {
    /// @notice Emitted when a token's locked status is set to true.
    event Locked(uint256 tokenId);
    /// @notice Emitted when a token's locked status is set to false.
    /// @dev    Never emitted by DevAttributionNFT — locked status is permanent.
    event Unlocked(uint256 tokenId);
    /// @notice Returns the locking status of an SBT.
    /// @dev    Reverts (per spec) when queried for a non-existent token.
    function locked(uint256 tokenId) external view returns (bool);
}

/// @title IDevAttributionNFT — Minter-side surface used by TournamentPool.
interface IDevAttributionNFT {
    function mint(address dev) external;
}

/// @title DevAttributionNFT
/// @notice Soulbound (ERC-5192) NFT representing a developer's attribution to
///         the Skillbase tournament platform. Minted exactly once per developer
///         address by the bound TournamentPool when that developer creates their
///         first tournament; immutable thereafter — no transfer, no approve, no
///         burn. The on-chain attribution claim cannot be revoked or moved.
/// @author ceos.run (Simpl3 Inc.)
/// @dev    Token id is deterministic: tokenId == uint256(uint160(devAddr)). This
///         makes the NFT trivially queryable by developer wallet without any
///         off-chain index — `ownerOf(uint256(uint160(devAddr)))` returns
///         devAddr if and only if the NFT has been minted for that wallet.
///
///         Soulbound enforcement (INV4):
///         - locked() returns true for every minted token; reverts on non-existent.
///         - All non-mint paths through ERC-721's _update revert with Soulbound().
///         - approve() and setApprovalForAll() revert directly (no silent no-op).
///         - There is no public burn surface; ERC-721 doesn't expose one and
///           _update would reject burn (transfer-to-zero) anyway.
///
///         Authorization (INV4 mint policy):
///         - Only the bound TournamentPool may mint. The pool's own
///           devNFTMinted mapping enforces idempotency (skip mint on subsequent
///           createTournament calls for the same devAddr). If the pool's mapping
///           ever diverges from this contract's state, our _update override
///           reverts Soulbound() on duplicate tokenId (because _ownerOf returns
///           the existing owner, so `from != 0` even on the mint path). This
///           override-fires-first behavior — not OZ's _mint post-check — is the
///           actual defensive backstop.
contract DevAttributionNFT is ERC721, IERC5192 {
    error OnlyTournamentPool();
    error Soulbound();
    error ZeroAddress();

    /// @notice The TournamentPool authorized to mint dev attribution NFTs.
    /// @dev    Set at construction; cannot change. Pinned via address-prediction
    ///         (vm.computeCreateAddress in tests; nonce arithmetic in production
    ///         deploy scripts — see DeployTournamentPool.s.sol) so the pool can
    ///         reference this contract in its own immutable slot without a
    ///         circular constructor dependency.
    address public immutable tournamentPool;

    constructor(address _tournamentPool) ERC721("Skillbase Dev Attribution", "SBDEV") {
        if (_tournamentPool == address(0)) revert ZeroAddress();
        tournamentPool = _tournamentPool;
    }

    /// @notice Mint a soulbound attribution token to `dev`. Only callable by the
    ///         bound TournamentPool. Token id is deterministic on devAddr.
    /// @dev    No idempotency guard here — the pool's devNFTMinted mapping is the
    ///         primary check. On duplicate tokenId, our _update override fires
    ///         Soulbound() first (because _ownerOf returns the existing owner
    ///         making `from != 0`), surfacing any future cache desync as a hard
    ///         failure. OZ's _mint also has a duplicate check (ERC721InvalidSender)
    ///         but our override preempts it.
    function mint(address dev) external {
        if (msg.sender != tournamentPool) revert OnlyTournamentPool();
        if (dev == address(0)) revert ZeroAddress();
        uint256 tokenId = uint256(uint160(dev));
        _safeMint(dev, tokenId);
        emit Locked(tokenId);
    }

    /// @notice Returns true for every minted token (soulbound, permanent).
    /// @dev    Reverts ERC721NonexistentToken for non-existent tokens per the
    ///         ERC-5192 spec. Implementation note: _requireOwned does the
    ///         existence check + revert and returns the owner; we discard.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @notice Reverts — soulbound tokens cannot be approved for transfer.
    /// @dev    Override returns explicit error rather than the default
    ///         silent-set-then-fail-on-transfer behavior. Caller learns the
    ///         constraint at the approve site, not later at transferFrom.
    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    /// @notice Reverts — soulbound tokens cannot have operators.
    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    /// @notice ERC-165 surface includes IERC5192 in addition to ERC-721's defaults.
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @dev Override of ERC-721's transfer hook. Allows mint (from == address(0))
    ///      only; rejects all other movements (transfers and burns) with Soulbound().
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
