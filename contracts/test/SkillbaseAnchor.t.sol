// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { SkillbaseAnchor } from "../src/SkillbaseAnchor.sol";

/// @title SkillbaseAnchorTest
/// @notice 17 tests mirror ceos.run DecisionAnchor.t.sol coverage shape:
///   7 core (write/read/verify happy + unanchored), 3 guards (replay/zero/auth),
///   1 multi-slot, 6 admin (owner-can/grant/revoke/only-owner/zero-addr ctor + admin).
///
/// Notable test_anchorSnapshotEmitsEvent: source had a bug emitting hash twice
/// as the first two indexed topics. Fixed on port — first topic is timestamp.
contract SkillbaseAnchorTest is Test {
    SkillbaseAnchor public anchor;

    address public owner = makeAddr("owner");
    address public backend = makeAddr("backend");
    address public attacker = makeAddr("attacker");

    bytes32 constant HASH_A = keccak256("snapshot-payload-alpha");
    bytes32 constant HASH_B = keccak256("snapshot-payload-beta");

    uint256 constant TS_1 = 1_761_868_800; // 2025-10-31 00:00:00 UTC
    uint256 constant TS_2 = 1_761_955_200; // 2025-11-01 00:00:00 UTC

    function setUp() public {
        vm.prank(owner);
        anchor = new SkillbaseAnchor(owner);
        vm.prank(owner);
        anchor.setAuthorizedAnchor(backend, true);
    }

    // ── Core: anchorSnapshot ────────────────────────────────────

    function test_anchorSnapshot() public {
        vm.prank(backend);
        anchor.anchorSnapshot(TS_1, HASH_A);
        assertEq(anchor.getSnapshotHash(TS_1), HASH_A, "Stored hash should match");
        assertEq(anchor.totalAnchored(), 1, "Total anchored should be 1");
    }

    function test_anchorSnapshotEmitsEvent() public {
        vm.prank(backend);
        // Bug fix vs source: first indexed topic is timestamp (correct), not hash (source bug).
        vm.expectEmit(true, true, false, true);
        emit SkillbaseAnchor.SnapshotAnchored(TS_1, HASH_A, block.timestamp);
        anchor.anchorSnapshot(TS_1, HASH_A);
    }

    // ── Core: getSnapshotHash ───────────────────────────────────

    function test_getSnapshotHash() public {
        vm.prank(backend);
        anchor.anchorSnapshot(TS_1, HASH_A);
        assertEq(anchor.getSnapshotHash(TS_1), HASH_A);
    }

    function test_getSnapshotHashUnanchored() public view {
        assertEq(anchor.getSnapshotHash(TS_1), bytes32(0));
    }

    // ── Core: verifySnapshot ────────────────────────────────────

    function test_verifySnapshotTrue() public {
        vm.prank(backend);
        anchor.anchorSnapshot(TS_1, HASH_A);
        assertTrue(anchor.verifySnapshot(TS_1, HASH_A));
    }

    function test_verifySnapshotFalse() public {
        vm.prank(backend);
        anchor.anchorSnapshot(TS_1, HASH_A);
        assertFalse(anchor.verifySnapshot(TS_1, HASH_B));
    }

    function test_verifySnapshotUnanchored() public view {
        assertFalse(anchor.verifySnapshot(TS_1, HASH_A));
    }

    // ── Guards ──────────────────────────────────────────────

    function test_alreadyAnchoredReverts() public {
        vm.prank(backend);
        anchor.anchorSnapshot(TS_1, HASH_A);

        vm.expectRevert(SkillbaseAnchor.AlreadyAnchored.selector);
        vm.prank(backend);
        anchor.anchorSnapshot(TS_1, HASH_B); // Same timestamp, different hash
    }

    function test_invalidHashReverts() public {
        vm.expectRevert(SkillbaseAnchor.InvalidHash.selector);
        vm.prank(backend);
        anchor.anchorSnapshot(TS_1, bytes32(0));
    }

    function test_unauthorizedAnchorReverts() public {
        vm.expectRevert(SkillbaseAnchor.UnauthorizedAnchor.selector);
        vm.prank(attacker);
        anchor.anchorSnapshot(TS_1, HASH_A);
    }

    // ── Multi-slot (mirrors source's multipleAgentsMultipleEpochs) ─────

    function test_multipleTimestamps() public {
        vm.startPrank(backend);
        anchor.anchorSnapshot(TS_1, HASH_A);
        anchor.anchorSnapshot(TS_2, HASH_B);
        vm.stopPrank();

        assertEq(anchor.getSnapshotHash(TS_1), HASH_A);
        assertEq(anchor.getSnapshotHash(TS_2), HASH_B);
        assertEq(anchor.totalAnchored(), 2);
    }

    // ── Admin ───────────────────────────────────────────────

    function test_ownerCanAnchor() public {
        vm.prank(owner);
        anchor.anchorSnapshot(TS_1, HASH_A);
        assertEq(anchor.getSnapshotHash(TS_1), HASH_A);
    }

    function test_setAuthorizedAnchor() public {
        address newBackend = makeAddr("newBackend");
        vm.prank(owner);
        anchor.setAuthorizedAnchor(newBackend, true);
        vm.prank(newBackend);
        anchor.anchorSnapshot(TS_1, HASH_A);
        assertEq(anchor.getSnapshotHash(TS_1), HASH_A);
    }

    function test_revokeAuthorizedAnchor() public {
        vm.prank(owner);
        anchor.setAuthorizedAnchor(backend, false);

        vm.expectRevert(SkillbaseAnchor.UnauthorizedAnchor.selector);
        vm.prank(backend);
        anchor.anchorSnapshot(TS_1, HASH_A);
    }

    function test_setAuthorizedAnchorOnlyOwner() public {
        vm.expectRevert();
        vm.prank(attacker);
        anchor.setAuthorizedAnchor(attacker, true);
    }

    function test_constructorZeroAddress() public {
        // OZ Ownable reverts with OwnableInvalidOwner before our check
        vm.expectRevert();
        new SkillbaseAnchor(address(0));
    }

    function test_setAuthorizedAnchorZeroAddress() public {
        vm.expectRevert(SkillbaseAnchor.ZeroAddress.selector);
        vm.prank(owner);
        anchor.setAuthorizedAnchor(address(0), true);
    }
}
