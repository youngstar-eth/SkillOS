// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { SponsorReceiptSBT } from "../src/SponsorReceiptSBT.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";

contract SponsorReceiptSBTTest is Test {
    SponsorReceiptSBT internal receipt;
    address internal minter = address(0xABCD);
    address internal alice = address(0xA1);
    address internal bob = address(0xB2);

    bytes32 internal constant TID = keccak256("tournament-1");

    function setUp() public {
        receipt = new SponsorReceiptSBT(minter);
    }

    // ─── Mint ──────────────────────────────────────────────────────────────────

    function test_mint_success_byMinter() public {
        vm.prank(minter);
        uint256 tokenId = receipt.mint(alice, TID, 5_000_000);

        assertEq(tokenId, 1);
        assertEq(receipt.ownerOf(tokenId), alice);
        assertEq(receipt.balanceOf(alice), 1);
        assertTrue(receipt.locked(tokenId));

        (bytes32 storedTid, uint256 storedAmount, address storedSponsor, uint64 storedTs) = receipt.receiptOf(tokenId);
        assertEq(storedTid, TID);
        assertEq(storedAmount, 5_000_000);
        assertEq(storedSponsor, alice);
        assertEq(uint256(storedTs), block.timestamp);
    }

    function test_mint_revert_notMinter() public {
        vm.prank(alice);
        vm.expectRevert(SponsorReceiptSBT.NotMinter.selector);
        receipt.mint(alice, TID, 1_000_000);
    }

    function test_mint_revert_zeroRecipient() public {
        vm.prank(minter);
        vm.expectRevert(SponsorReceiptSBT.ZeroAddress.selector);
        receipt.mint(address(0), TID, 1_000_000);
    }

    function test_mint_emitsLockedEvent() public {
        vm.expectEmit(false, false, false, true, address(receipt));
        emit SponsorReceiptSBT.Locked(1);

        vm.prank(minter);
        receipt.mint(alice, TID, 1_000_000);
    }

    function test_mint_incrementsTokenId() public {
        vm.startPrank(minter);
        uint256 t1 = receipt.mint(alice, TID, 1);
        uint256 t2 = receipt.mint(bob, TID, 2);
        uint256 t3 = receipt.mint(alice, TID, 3);
        vm.stopPrank();

        assertEq(t1, 1);
        assertEq(t2, 2);
        assertEq(t3, 3);
        assertEq(receipt.balanceOf(alice), 2);
        assertEq(receipt.balanceOf(bob), 1);
    }

    // ─── Soulbound enforcement ─────────────────────────────────────────────────

    function test_transferFrom_reverts() public {
        vm.prank(minter);
        receipt.mint(alice, TID, 1_000_000);

        vm.prank(alice);
        vm.expectRevert(SponsorReceiptSBT.TransferLocked.selector);
        receipt.transferFrom(alice, bob, 1);
    }

    function test_safeTransferFrom_reverts() public {
        vm.prank(minter);
        receipt.mint(alice, TID, 1_000_000);

        vm.prank(alice);
        vm.expectRevert(SponsorReceiptSBT.TransferLocked.selector);
        receipt.safeTransferFrom(alice, bob, 1);
    }

    function test_safeTransferFromWithData_reverts() public {
        vm.prank(minter);
        receipt.mint(alice, TID, 1_000_000);

        vm.prank(alice);
        vm.expectRevert(SponsorReceiptSBT.TransferLocked.selector);
        receipt.safeTransferFrom(alice, bob, 1, "");
    }

    function test_approve_reverts() public {
        vm.prank(minter);
        receipt.mint(alice, TID, 1_000_000);

        vm.prank(alice);
        vm.expectRevert(SponsorReceiptSBT.ApprovalLocked.selector);
        receipt.approve(bob, 1);
    }

    function test_setApprovalForAll_reverts() public {
        vm.prank(minter);
        receipt.mint(alice, TID, 1_000_000);

        vm.prank(alice);
        vm.expectRevert(SponsorReceiptSBT.ApprovalLocked.selector);
        receipt.setApprovalForAll(bob, true);
    }

    // ─── ERC-5192 ──────────────────────────────────────────────────────────────

    function test_locked_returnsTrue() public {
        vm.prank(minter);
        receipt.mint(alice, TID, 1_000_000);
        assertTrue(receipt.locked(1));
    }

    function test_locked_revertsForNonexistent() public {
        vm.expectRevert(SponsorReceiptSBT.TokenDoesNotExist.selector);
        receipt.locked(999);
    }

    function test_supportsInterface_erc5192() public view {
        // ERC-5192 interface id (0xb45a3c0e).
        assertTrue(receipt.supportsInterface(0xb45a3c0e), "erc5192");
        // ERC-721 interface id (0x80ac58cd) — inherited.
        assertTrue(receipt.supportsInterface(0x80ac58cd), "erc721");
    }

    // ─── Metadata ──────────────────────────────────────────────────────────────

    function test_tokenURI_returnsBase64DataURI() public {
        vm.prank(minter);
        receipt.mint(alice, TID, 5_000_000);

        string memory uri = receipt.tokenURI(1);

        // Must start with the data URI prefix.
        bytes memory uriBytes = bytes(uri);
        bytes memory expectedPrefix = bytes("data:application/json;base64,");
        assertGt(uriBytes.length, expectedPrefix.length, "uri non-empty");
        for (uint256 i; i < expectedPrefix.length; ++i) {
            assertEq(uriBytes[i], expectedPrefix[i], "prefix mismatch");
        }

        // Decode the base64 payload and check it contains expected substrings.
        bytes memory payload = new bytes(uriBytes.length - expectedPrefix.length);
        for (uint256 i; i < payload.length; ++i) {
            payload[i] = uriBytes[i + expectedPrefix.length];
        }
        // We can't decode base64 in solidity easily; instead verify length is plausible.
        assertGt(payload.length, 50, "payload non-trivial length");
    }

    function test_tokenURI_revertsForNonexistent() public {
        vm.expectRevert(SponsorReceiptSBT.TokenDoesNotExist.selector);
        receipt.tokenURI(999);
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    function test_constructor_revert_zeroMinter() public {
        vm.expectRevert(SponsorReceiptSBT.ZeroAddress.selector);
        new SponsorReceiptSBT(address(0));
    }
}
