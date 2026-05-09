// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DevAttributionNFT, IERC5192} from "../src/DevAttributionNFT.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract DevAttributionNFTTest is Test {
    DevAttributionNFT internal nft;
    address internal pool = address(0xCAFE);
    address internal outsider = address(0xBAD);
    address internal dev = address(0x1234);

    event Locked(uint256 tokenId);

    function setUp() public {
        nft = new DevAttributionNFT(pool);
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    function test_constructor_pinsTournamentPool() public view {
        assertEq(nft.tournamentPool(), pool);
    }

    function test_constructor_revert_zeroPool() public {
        vm.expectRevert(DevAttributionNFT.ZeroAddress.selector);
        new DevAttributionNFT(address(0));
    }

    function test_constructor_setsNameAndSymbol() public view {
        assertEq(nft.name(), "Skillbase Dev Attribution");
        assertEq(nft.symbol(), "SBDEV");
    }

    // ─── mint ──────────────────────────────────────────────────────────────────

    function test_mint_byTournamentPool_succeeds() public {
        uint256 tokenId = uint256(uint160(dev));

        vm.expectEmit(true, false, false, false, address(nft));
        emit Locked(tokenId);

        vm.prank(pool);
        nft.mint(dev);

        assertEq(nft.ownerOf(tokenId), dev);
        assertEq(nft.balanceOf(dev), 1);
    }

    function test_mint_revert_onNonTournamentPool() public {
        vm.prank(outsider);
        vm.expectRevert(DevAttributionNFT.OnlyTournamentPool.selector);
        nft.mint(dev);
    }

    function test_mint_revert_onZeroDev() public {
        vm.prank(pool);
        vm.expectRevert(DevAttributionNFT.ZeroAddress.selector);
        nft.mint(address(0));
    }

    function test_mint_revert_onDoubleMintSameDev() public {
        // Backstop for any future cache desync in TournamentPool.devNFTMinted.
        // The revert comes from OUR _update override (Soulbound), not OZ's _mint
        // post-check (ERC721InvalidSender). When a token already exists,
        // _ownerOf(tokenId) returns the existing owner, our override sees
        // `from != 0` and reverts Soulbound BEFORE super._update is called —
        // so OZ's duplicate check is unreachable in our flow.
        vm.startPrank(pool);
        nft.mint(dev);
        vm.expectRevert(DevAttributionNFT.Soulbound.selector);
        nft.mint(dev);
        vm.stopPrank();
    }

    function test_mint_tokenId_isDeterministicFromDevAddr() public {
        address devA = address(0xAAAA);
        address devB = address(0xBBBB);

        vm.startPrank(pool);
        nft.mint(devA);
        nft.mint(devB);
        vm.stopPrank();

        assertEq(nft.ownerOf(uint256(uint160(devA))), devA, "devA tokenId");
        assertEq(nft.ownerOf(uint256(uint160(devB))), devB, "devB tokenId");
        // Confirm the mapping is exactly uint256(uint160(addr)).
        assertEq(uint256(uint160(devA)), 0xAAAA);
        assertEq(uint256(uint160(devB)), 0xBBBB);
    }

    // ─── ERC-5192 locked() ─────────────────────────────────────────────────────

    function test_locked_returnsTrue_forMintedToken() public {
        vm.prank(pool);
        nft.mint(dev);
        assertTrue(nft.locked(uint256(uint160(dev))));
    }

    function test_locked_revert_onNonexistentToken() public {
        // Per ERC-5192 spec: queries about non-existent tokens revert.
        // OZ _requireOwned reverts with ERC721NonexistentToken.
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(12345)));
        nft.locked(12345);
    }

    // ─── Transfer / approve / setApprovalForAll all reject ─────────────────────

    function test_transferFrom_revert() public {
        vm.prank(pool);
        nft.mint(dev);

        vm.prank(dev);
        vm.expectRevert(DevAttributionNFT.Soulbound.selector);
        nft.transferFrom(dev, outsider, uint256(uint160(dev)));
    }

    function test_safeTransferFrom_revert() public {
        vm.prank(pool);
        nft.mint(dev);

        vm.prank(dev);
        vm.expectRevert(DevAttributionNFT.Soulbound.selector);
        nft.safeTransferFrom(dev, outsider, uint256(uint160(dev)));
    }

    function test_safeTransferFromWithData_revert() public {
        vm.prank(pool);
        nft.mint(dev);

        vm.prank(dev);
        vm.expectRevert(DevAttributionNFT.Soulbound.selector);
        nft.safeTransferFrom(dev, outsider, uint256(uint160(dev)), "");
    }

    function test_approve_revert_explicit() public {
        // Even before mint, approve reverts immediately (no silent set-then-fail).
        vm.expectRevert(DevAttributionNFT.Soulbound.selector);
        nft.approve(outsider, 1);
    }

    function test_setApprovalForAll_revert_explicit() public {
        vm.expectRevert(DevAttributionNFT.Soulbound.selector);
        nft.setApprovalForAll(outsider, true);
    }

    // ─── ERC-165 surface ───────────────────────────────────────────────────────

    function test_supportsInterface_includesERC721() public view {
        assertTrue(nft.supportsInterface(type(IERC721).interfaceId), "ERC721");
        assertTrue(nft.supportsInterface(type(IERC165).interfaceId), "ERC165");
    }

    function test_supportsInterface_includesERC5192() public view {
        assertTrue(nft.supportsInterface(type(IERC5192).interfaceId), "ERC5192");
        // Pin the literal ERC-5192 spec ID (https://eips.ethereum.org/EIPS/eip-5192)
        // so any future drift of the locally-defined IERC5192 (e.g., adding a function)
        // surfaces here even though `type(...).interfaceId` would still match the local def.
        assertTrue(nft.supportsInterface(0xb45a3c0e), "ERC-5192 spec ID 0xb45a3c0e (literal) -- must not drift");
    }

    function test_supportsInterface_excludesUnknown() public view {
        assertFalse(nft.supportsInterface(0xdeadbeef));
    }

    // ─── Defensive: minted tokens persist across "would-be transfers" ──────────

    function test_mintedToken_remainsWithDev_afterRevertedTransferAttempt() public {
        vm.prank(pool);
        nft.mint(dev);
        uint256 tokenId = uint256(uint160(dev));

        vm.prank(dev);
        vm.expectRevert(DevAttributionNFT.Soulbound.selector);
        nft.transferFrom(dev, outsider, tokenId);

        // Token still owned by dev — revert leaves state untouched.
        assertEq(nft.ownerOf(tokenId), dev);
        assertEq(nft.balanceOf(dev), 1);
        assertEq(nft.balanceOf(outsider), 0);
    }
}
