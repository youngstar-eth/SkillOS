# SkillbaseAnchor MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the DecisionAnchor pattern from ceos.run into Skillbase MAS as a flat-mapping snapshot anchor for the SP ledger, deployed to Base Sepolia. Ships Gates 1-8 of the parent spec; Gates 9-13 (x402 endpoint, apex copy, smoke matrix, atomic apex commit) deferred to a follow-up sprint.

**Architecture:** A Solidity contract (`contracts/src/SkillbaseAnchor.sol`) with a flat `snapshots[timestamp_unix] → bytes32 hash` mapping, paired with an off-chain canonicalization service (`packages/sp-engine/src/anchor.ts`) producing deterministic SHA-256 hashes of SP ledger snapshots. A daily cron in `apps/2048` reads the SP ledger, canonicalizes it, persists to Supabase `sp_snapshots`, and anchors the hash on-chain. Reuses STUDIO_PRIVATE_KEY for the anchor wallet (testnet trust model — Phase 2 mainnet sprint will introduce role separation).

**Tech Stack:** Solidity 0.8.26, Foundry, OpenZeppelin Ownable + ReentrancyGuard, Node `crypto.createHash('sha256')`, viem, Next.js 16 cron route, Supabase Postgres.

**Decisions locked (from brainstorming):**
- Contract shape: **flat** `snapshots[uint256 timestamp] → bytes32 hash` (not nested per-agent like source)
- Source bug fix: emit `SnapshotAnchored(timestamp, hash, block.timestamp)` with correct first topic
- Anchor wallet: reuse `STUDIO_PRIVATE_KEY` (same key as TournamentPool v2 trustedSigner)
- Scope: Gates 1-8 only — descope x402 endpoint, apex copy, smoke matrix
- Path correction: contracts at `MAS/contracts/`, NOT `MAS/packages/contracts/`

---

## File Structure

**Create:**
- `contracts/src/SkillbaseAnchor.sol` — the anchor contract (≈110 LOC)
- `contracts/test/SkillbaseAnchor.t.sol` — 17 Foundry tests
- `contracts/script/DeploySkillbaseAnchor.s.sol` — deploy + setAuthorizedAnchor in one tx batch
- `packages/sp-engine/src/anchor.ts` — canonicalization + hash (≈80 LOC)
- `packages/sp-engine/src/anchor.test.ts` — vitest unit tests (determinism + golden hash)
- `packages/contracts/src/skillbase-anchor.abi.ts` — ABI export
- `supabase/migrations/v2_20260428_sp_snapshots.sql` — DB migration
- `apps/2048/src/app/api/cron/anchor-sp-snapshot/route.ts` — cron handler

**Modify:**
- `packages/contracts/src/addresses.ts` — add `SKILLBASE_ANCHOR_ADDRESS`
- `apps/2048/vercel.json` — add new cron entry (daily 02:07 UTC)
- `.env.example` — add `SKILLBASE_ANCHOR_ADDRESS`
- `packages/sp-engine/package.json` — confirm vitest already present (it is)

**Don't touch:**
- TournamentPool.sol, ChallengeEscrow.sol, ArcadePool.sol — explicitly out of scope
- AI coach inference paths
- `engine.ts` SP award logic — anchor.ts is read-only on the ledger

---

## Task 1: Add SkillbaseAnchor.sol contract

**Files:**
- Create: `contracts/src/SkillbaseAnchor.sol`

- [ ] **Step 1.1: Write the contract**

```solidity
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
///        (b) event first-topic bug fixed (source emitted hash twice; we emit timestamp)
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
    /// @param timestamp The unix timestamp this snapshot represents
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
    function getSnapshotHash(uint256 timestamp) external view returns (bytes32) {
        return snapshots[timestamp];
    }

    /// @notice Verify that a given hash matches the anchored snapshot
    function verifySnapshot(
        uint256 timestamp,
        bytes32 expectedHash
    ) external view returns (bool) {
        return snapshots[timestamp] == expectedHash;
    }

    // ── Admin Functions ─────────────────────────────────────────

    /// @notice Authorize or deauthorize an address to anchor snapshots
    function setAuthorizedAnchor(address anchor, bool authorized) external onlyOwner {
        if (anchor == address(0)) revert ZeroAddress();
        authorizedAnchors[anchor] = authorized;
        emit AnchorAuthorized(anchor, authorized);
    }
}
```

- [ ] **Step 1.2: Verify clean compile**

Run: `cd /Users/inancayvaz/MAS/contracts && forge build`
Expected: SkillbaseAnchor compiles with 0 errors, 0 warnings (other than pre-existing warnings).

---

## Task 2: Port + adapt 17 Foundry tests

**Files:**
- Create: `contracts/test/SkillbaseAnchor.t.sol`

- [ ] **Step 2.1: Write the test file**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { SkillbaseAnchor } from "../src/SkillbaseAnchor.sol";

/// 17 tests mirror ceos.run DecisionAnchor.t.sol coverage shape:
/// 7 core (write/read/verify happy + unanchored), 3 guards (replay/zero/auth),
/// 1 multi-slot, 5 admin (owner+grant+revoke+only-owner+zero-addr ctor and admin).
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
        anchor.anchorSnapshot(TS_1, HASH_B); // Same timestamp
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
```

- [ ] **Step 2.2: Run tests**

Run: `cd /Users/inancayvaz/MAS/contracts && forge test --match-contract SkillbaseAnchorTest -vvv`
Expected: `Suite result: ok. 17 passed; 0 failed; 0 skipped`

If any fail: read the failure, fix the contract or the test (mention the fix in commit). Don't move on with red.

- [ ] **Step 2.3: Run full test suite to confirm no regressions**

Run: `cd /Users/inancayvaz/MAS/contracts && forge test`
Expected: All pre-existing tests still pass + 17 new SkillbaseAnchor tests pass.

---

## Task 3: Add ABI + address constants to packages/contracts

**Files:**
- Create: `packages/contracts/src/skillbase-anchor.abi.ts`
- Modify: `packages/contracts/src/addresses.ts`

- [ ] **Step 3.1: Generate ABI from compiled artifact**

Run: `cd /Users/inancayvaz/MAS/contracts && forge build && cat out/SkillbaseAnchor.sol/SkillbaseAnchor.json | jq '.abi'`
Inspect output, then write `packages/contracts/src/skillbase-anchor.abi.ts`:

```ts
// Auto-generated from contracts/out/SkillbaseAnchor.sol/SkillbaseAnchor.json
// Regenerate: cd contracts && forge build && cat out/SkillbaseAnchor.sol/SkillbaseAnchor.json | jq '.abi'

export const SKILLBASE_ANCHOR_ABI = [
  // ... paste full ABI here from the forge output
] as const;
```

- [ ] **Step 3.2: Add address constant**

Edit `packages/contracts/src/addresses.ts` — append after `RETRY_FEE`:

```ts
// ─── SkillbaseAnchor (SP ledger snapshot anchoring) ─────────────────────────

/** SkillbaseAnchor contract — Base Sepolia. Set after first deploy. */
export const SKILLBASE_ANCHOR_ADDRESS = (process.env
  .NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS ?? "") as Address;
```

(Empty default OK — cron will refuse to run if address unset, fail-loud is correct here.)

- [ ] **Step 3.3: Re-export from package index**

Check `packages/contracts/src/index.ts` re-exports both new symbols. Add if missing.

---

## Task 4: Off-chain canonicalization (anchor.ts) — USER CONTRIBUTION

**Files:**
- Create: `packages/sp-engine/src/anchor.ts`

This task has **two parts**: I write the deterministic skeleton, and you (the user) author the per-wallet canonical-form selector. That selector decides *what* an AI lab can verify — which fields are committed to chain. It's the load-bearing business decision.

- [ ] **Step 4.1: Write the canonicalization skeleton (no field selection)**

```ts
// ───────────────────────────────────────────────────────────────────────────
// @skillbase/sp-engine — anchor.ts
//
// Deterministic SHA-256 canonicalization of the SP ledger.
//
// Invariant: same SP state → same hash, every time, anywhere. This is the
// load-bearing primitive for AI lab verification. If an external caller hashes
// the canonical JSON we publish, they MUST get the same hash that's anchored
// on-chain via SkillbaseAnchor.anchorSnapshot().
//
// Ported from ceos.run reputation-anchor.ts canonicalize() pattern:
//   - deep-sort all object keys recursively
//   - JSON.stringify with no whitespace
//   - SHA-256 the UTF-8 bytes
// ───────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

/** A single wallet's row in the SP ledger snapshot. */
export interface CanonicalWalletEntry {
  // TODO(user): selectCanonicalWalletFields() defines this shape
  [key: string]: string | number | boolean | null;
}

/** The full canonical snapshot envelope. */
export interface CanonicalSnapshot {
  /** Schema version — bump when field selection changes. */
  version: 1;
  /** Unix seconds. The on-chain slot key. */
  timestampUnix: number;
  /** Number of wallets in `wallets` array. */
  walletCount: number;
  /** Sum of total_sp across all wallets. Sanity check for verifiers. */
  totalSpAtSnapshot: number;
  /** Sorted by address asc. */
  wallets: CanonicalWalletEntry[];
}

/** Source row from Supabase v2_user_stats. */
export interface UserStatsRow {
  user_address: string;
  total_sp: number;
  current_level: number;
  duels_won: number;
  duels_lost: number;
  tournaments_participated: number;
  tournaments_won: number;
  last_active_at: string | null; // ISO-8601
  created_at: string; // ISO-8601
}

/**
 * Recursively sort object keys for deterministic serialization.
 * Arrays preserve order; only object key iteration order is normalized.
 */
function deepSortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Canonical JSON — sorted keys, no whitespace.
 * Public so verifiers can call it client-side after fetching the snapshot.
 */
export function canonicalize(snapshot: CanonicalSnapshot): string {
  return JSON.stringify(deepSortKeys(snapshot));
}

/** SHA-256 of canonical JSON, as 0x-prefixed 32-byte hex. */
export function hashSnapshot(snapshot: CanonicalSnapshot): `0x${string}` {
  const canonical = canonicalize(snapshot);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `0x${digest}` as const;
}

// ─── USER CONTRIBUTION REQUESTED ──────────────────────────────────────────
//
// This is the selector that decides what AI labs can verify on-chain.
// See block comment in `selectCanonicalWalletFields` below for context
// and the trade-offs you should weigh.
//
// Implementation goes in this function. Everything else above is glue.
//
// ───────────────────────────────────────────────────────────────────────────

/**
 * Project a UserStatsRow into the per-wallet canonical entry.
 *
 * Trade-offs to consider:
 *   - More fields → richer AI lab verification (e.g., they can check duels_won
 *     historical claims) but bigger snapshots and tighter coupling between the
 *     ledger schema and the on-chain hash. Adding a column to v2_user_stats
 *     later forces a schema version bump.
 *   - Fewer fields → smaller, more durable hashes, but AI labs can only verify
 *     the committed slice (e.g., total_sp + level only).
 *   - Address case: lowercase is safest for determinism (EIP-55 checksums vary
 *     by tooling). But lowercase loses validation utility.
 *   - Numeric format: BigInt strings vs JS numbers. v2_user_stats counters are
 *     all int4/int8 in Postgres, so JS Number is safe up to 2^53. Documenting
 *     this explicitly here protects future schema changes.
 *   - Timestamps: ISO-8601 strings or unix seconds? ISO-8601 is human-readable
 *     and self-documenting; unix seconds are smaller and timezone-agnostic.
 *
 * Whatever you pick — pick deterministically. Same input, same output. The
 * unit tests in anchor.test.ts will hammer this with the same row twice and
 * assert identical hashes.
 */
export function selectCanonicalWalletFields(row: UserStatsRow): CanonicalWalletEntry {
  // TODO(user): implement
  throw new Error("selectCanonicalWalletFields not yet implemented");
}

// ─── End user contribution section ─────────────────────────────────────────

/**
 * Build a full canonical snapshot from a list of UserStatsRows.
 * Sorts wallets by lowercase address before inclusion (deterministic order).
 */
export function buildSnapshot(
  timestampUnix: number,
  rows: UserStatsRow[],
): CanonicalSnapshot {
  const wallets = rows
    .filter((r) => r.total_sp > 0) // Only non-zero SP wallets per spec
    .map(selectCanonicalWalletFields);

  // Sort by address ascending. Determinism: case-insensitive sort to avoid
  // ambiguity if the selector preserves checksummed addresses.
  wallets.sort((a, b) =>
    String(a.address).toLowerCase().localeCompare(String(b.address).toLowerCase()),
  );

  const totalSpAtSnapshot = wallets.reduce(
    (sum, w) => sum + (typeof w.total_sp === "number" ? w.total_sp : 0),
    0,
  );

  return {
    version: 1,
    timestampUnix,
    walletCount: wallets.length,
    totalSpAtSnapshot,
    wallets,
  };
}
```

- [ ] **Step 4.2: USER FILLS IN `selectCanonicalWalletFields`**

The user provides 5-15 lines implementing `selectCanonicalWalletFields`. After the user commits this, executor proceeds to Step 4.3.

If the user defers to executor: pick the minimal-viable shape — `{ address: row.user_address.toLowerCase(), total_sp: row.total_sp, current_level: row.current_level }` — and document the choice in a follow-up.

- [ ] **Step 4.3: Add a re-export to packages/sp-engine/src/index.ts**

```ts
export { canonicalize, hashSnapshot, buildSnapshot, selectCanonicalWalletFields } from "./anchor.js";
export type { CanonicalSnapshot, CanonicalWalletEntry, UserStatsRow } from "./anchor.js";
```

---

## Task 5: anchor.test.ts — determinism + golden hash

**Files:**
- Create: `packages/sp-engine/src/anchor.test.ts`

- [ ] **Step 5.1: Write tests**

```ts
import { describe, it, expect } from "vitest";
import { buildSnapshot, canonicalize, hashSnapshot, selectCanonicalWalletFields } from "./anchor.js";
import type { UserStatsRow } from "./anchor.js";

const ROW_A: UserStatsRow = {
  user_address: "0xAaaa1111aaaa1111AAAA1111AAAA1111aaaa1111",
  total_sp: 1500,
  current_level: 3,
  duels_won: 5,
  duels_lost: 3,
  tournaments_participated: 2,
  tournaments_won: 0,
  last_active_at: "2026-04-27T18:30:00.000Z",
  created_at: "2026-04-01T00:00:00.000Z",
};

const ROW_B: UserStatsRow = {
  user_address: "0xBbbb2222bbbb2222BBBB2222BBBB2222bbbb2222",
  total_sp: 7500,
  current_level: 5,
  duels_won: 25,
  duels_lost: 8,
  tournaments_participated: 6,
  tournaments_won: 1,
  last_active_at: "2026-04-28T01:15:00.000Z",
  created_at: "2026-03-15T00:00:00.000Z",
};

const TS = 1_761_868_800; // 2025-10-31 00:00:00 UTC

describe("selectCanonicalWalletFields", () => {
  it("is deterministic — same row → same projection", () => {
    expect(selectCanonicalWalletFields(ROW_A)).toEqual(selectCanonicalWalletFields(ROW_A));
  });
});

describe("canonicalize", () => {
  it("produces identical strings for input order variations", () => {
    const s1 = buildSnapshot(TS, [ROW_A, ROW_B]);
    const s2 = buildSnapshot(TS, [ROW_B, ROW_A]); // Reverse order
    expect(canonicalize(s1)).toBe(canonicalize(s2));
  });

  it("produces no-whitespace output", () => {
    const s = buildSnapshot(TS, [ROW_A]);
    expect(canonicalize(s)).not.toMatch(/\s/);
  });
});

describe("hashSnapshot", () => {
  it("returns 0x-prefixed 32-byte hex", () => {
    const s = buildSnapshot(TS, [ROW_A]);
    const h = hashSnapshot(s);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic — same snapshot → same hash, every call", () => {
    const s = buildSnapshot(TS, [ROW_A, ROW_B]);
    expect(hashSnapshot(s)).toBe(hashSnapshot(s));
  });

  it("is order-invariant — same wallets in any input order → same hash", () => {
    const s1 = buildSnapshot(TS, [ROW_A, ROW_B]);
    const s2 = buildSnapshot(TS, [ROW_B, ROW_A]);
    expect(hashSnapshot(s1)).toBe(hashSnapshot(s2));
  });

  it("excludes wallets with total_sp == 0", () => {
    const zeroRow: UserStatsRow = { ...ROW_A, total_sp: 0 };
    const sWithZero = buildSnapshot(TS, [ROW_A, zeroRow, ROW_B]);
    const sWithout = buildSnapshot(TS, [ROW_A, ROW_B]);
    expect(hashSnapshot(sWithZero)).toBe(hashSnapshot(sWithout));
  });

  it("changes when total_sp changes (sanity)", () => {
    const s1 = buildSnapshot(TS, [ROW_A]);
    const s2 = buildSnapshot(TS, [{ ...ROW_A, total_sp: ROW_A.total_sp + 1 }]);
    expect(hashSnapshot(s1)).not.toBe(hashSnapshot(s2));
  });

  it("changes when timestamp changes (sanity)", () => {
    const s1 = buildSnapshot(TS, [ROW_A]);
    const s2 = buildSnapshot(TS + 1, [ROW_A]);
    expect(hashSnapshot(s1)).not.toBe(hashSnapshot(s2));
  });
});
```

- [ ] **Step 5.2: Run vitest**

Run: `cd /Users/inancayvaz/MAS && pnpm --filter @skillbase/sp-engine test` (or the workspace's existing test command — verify from package.json)
Expected: All 7 anchor tests + pre-existing engine tests green.

If `total_sp` doesn't appear in the user's selectCanonicalWalletFields output, the `excludes wallets with total_sp == 0` test still passes (it tests `buildSnapshot`, not the selector). The `changes when total_sp changes` sanity test will fail if the selector doesn't include something that derives from total_sp — flag this back to the user as a hint that the canonical form should commit total_sp.

---

## Task 6: Supabase migration sp_snapshots

**Files:**
- Create: `supabase/migrations/v2_20260428_sp_snapshots.sql`

- [ ] **Step 6.1: Write migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- v2 SP snapshot anchoring — daily SHA-256 of canonical SP ledger JSON.
--
-- Each row records:
--   1. the canonical_json (full SP ledger state at snapshot time, public)
--   2. the hash (SHA-256 of canonical_json)
--   3. the on-chain anchor tx (links hash to SkillbaseAnchor contract)
--
-- Workflow: cron writes (snapshot_id, hash, canonical_json) BEFORE the
-- on-chain anchor tx. After the anchor tx confirms, anchor_tx_hash and
-- anchored_at are filled in. A row with NULL anchor_tx_hash means the
-- canonical JSON was saved but the on-chain anchor hasn't landed yet
-- (could be in-flight or could have failed — operator inspects).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists v2_sp_snapshots (
  snapshot_id          uuid primary key default gen_random_uuid(),
  timestamp_unix       bigint not null unique, -- on-chain slot key
  hash                 text not null check (hash ~ '^0x[0-9a-f]{64}$'),
  wallet_count         integer not null check (wallet_count >= 0),
  total_sp_at_snapshot bigint not null check (total_sp_at_snapshot >= 0),
  canonical_json       jsonb not null,
  anchor_tx_hash       text check (anchor_tx_hash is null or anchor_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  anchored_at          timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists v2_sp_snapshots_timestamp_idx
  on v2_sp_snapshots (timestamp_unix desc);

create index if not exists v2_sp_snapshots_anchored_idx
  on v2_sp_snapshots (anchored_at desc nulls last);

comment on table v2_sp_snapshots is
  'Daily canonical SP ledger snapshots + on-chain anchor tx hashes. Public read for AI lab verification.';
comment on column v2_sp_snapshots.timestamp_unix is
  'Unix seconds. Doubles as the SkillbaseAnchor.snapshots[] mapping key on-chain.';
comment on column v2_sp_snapshots.hash is
  'SHA-256 of canonicalize(canonical_json), 0x-prefixed 32-byte hex.';
comment on column v2_sp_snapshots.anchor_tx_hash is
  'Base Sepolia tx hash of the SkillbaseAnchor.anchorSnapshot() call. NULL until on-chain confirm.';
```

- [ ] **Step 6.2: Apply migration**

Run: `cd /Users/inancayvaz/MAS && npx supabase db push` (or whatever the project's existing migration command is — check `package.json` scripts). Confirm with the user before pushing if there's any ambiguity.

Expected: migration applies cleanly. `select * from v2_sp_snapshots limit 1` returns 0 rows (table empty).

---

## Task 7: Anchor cron handler + Vercel cron config

**Files:**
- Create: `apps/2048/src/app/api/cron/anchor-sp-snapshot/route.ts`
- Modify: `apps/2048/vercel.json`

- [ ] **Step 7.1: Write cron handler**

```ts
// Vercel cron — runs daily at 02:07 UTC (after settle-tournaments at 00:05).
// Anchors a SHA-256 of the current SP ledger to SkillbaseAnchor on Base Sepolia.
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" <url>

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import {
  SKILLBASE_ANCHOR_ADDRESS,
  SKILLBASE_ANCHOR_ABI,
} from "@skillbase/contracts";
import { buildSnapshot, hashSnapshot, canonicalize } from "@skillbase/sp-engine";
import type { UserStatsRow } from "@skillbase/sp-engine";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!SKILLBASE_ANCHOR_ADDRESS) {
    return Response.json(
      { ok: false, error: "SKILLBASE_ANCHOR_ADDRESS not configured" },
      { status: 500 },
    );
  }

  try {
    // ── 1. Read SP ledger ─────────────────────────────────────────────
    const supabase = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: rows, error } = await supabase
      .from("v2_user_stats")
      .select("user_address,total_sp,current_level,duels_won,duels_lost,tournaments_participated,tournaments_won,last_active_at,created_at")
      .gt("total_sp", 0);

    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    const ledger = (rows ?? []) as UserStatsRow[];

    // ── 2. Canonicalize + hash ────────────────────────────────────────
    const timestampUnix = Math.floor(Date.now() / 1000);
    const snapshot = buildSnapshot(timestampUnix, ledger);
    const hash = hashSnapshot(snapshot);

    // ── 3. Persist to Supabase ────────────────────────────────────────
    const { data: inserted, error: insertErr } = await supabase
      .from("v2_sp_snapshots")
      .insert({
        timestamp_unix: timestampUnix,
        hash,
        wallet_count: snapshot.walletCount,
        total_sp_at_snapshot: snapshot.totalSpAtSnapshot,
        canonical_json: JSON.parse(canonicalize(snapshot)),
      })
      .select("snapshot_id")
      .single();

    if (insertErr) throw new Error(`Supabase insert failed: ${insertErr.message}`);
    const snapshotId = inserted.snapshot_id;

    // ── 4. Anchor on-chain ────────────────────────────────────────────
    const rpcUrl = requireEnv("BASE_SEPOLIA_RPC_URL");
    const studioKey = requireEnv("STUDIO_PRIVATE_KEY");
    const account = privateKeyToAccount(
      (studioKey.startsWith("0x") ? studioKey : `0x${studioKey}`) as `0x${string}`,
    );

    const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
    const pub = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

    const txHash = await wallet.writeContract({
      address: SKILLBASE_ANCHOR_ADDRESS,
      abi: SKILLBASE_ANCHOR_ABI,
      functionName: "anchorSnapshot",
      args: [BigInt(timestampUnix), hash],
    });

    const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      // Anchor row stays with NULL anchor_tx_hash — operator can re-anchor manually
      throw new Error(`Anchor tx reverted: ${txHash}`);
    }

    // ── 5. Update Supabase row with tx hash ───────────────────────────
    await supabase
      .from("v2_sp_snapshots")
      .update({ anchor_tx_hash: txHash, anchored_at: new Date().toISOString() })
      .eq("snapshot_id", snapshotId);

    return Response.json({
      ok: true,
      snapshotId,
      timestampUnix,
      hash,
      txHash,
      walletCount: snapshot.walletCount,
      totalSpAtSnapshot: snapshot.totalSpAtSnapshot,
      blockNumber: Number(receipt.blockNumber),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron anchor-sp-snapshot] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 7.2: Add Vercel cron entry**

Edit `apps/2048/vercel.json`. Add to the `crons` array (off-minute :07 to avoid the :00 fleet pile-up):

```json
{ "path": "/api/cron/anchor-sp-snapshot", "schedule": "7 2 * * *" }
```

Final crons array should be:
```json
"crons": [
  { "path": "/api/cron/create-tournaments", "schedule": "0 0 * * *" },
  { "path": "/api/cron/settle-tournaments", "schedule": "5 0 * * *" },
  { "path": "/api/cron/anchor-sp-snapshot", "schedule": "7 2 * * *" }
]
```

---

## Task 8: Deploy script

**Files:**
- Create: `contracts/script/DeploySkillbaseAnchor.s.sol`

- [ ] **Step 8.1: Write deploy script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { SkillbaseAnchor } from "../src/SkillbaseAnchor.sol";

/// @title DeploySkillbaseAnchor
/// @dev Usage:
///   forge script script/DeploySkillbaseAnchor.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify -vvvv
///
/// Env required:
///   STUDIO_PRIVATE_KEY  — deployer + initial authorized anchor
///   BASESCAN_API_KEY    — for --verify flag
contract DeploySkillbaseAnchor is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("STUDIO_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);
        SkillbaseAnchor anchor = new SkillbaseAnchor(deployer);
        // Authorize deployer (also implicit via owner fallback, but explicit is clearer in indexing)
        anchor.setAuthorizedAnchor(deployer, true);
        vm.stopBroadcast();

        console2.log("SkillbaseAnchor deployed:", address(anchor));
        console2.log("Authorized anchor:", deployer);
        console2.log("");
        console2.log("=== Next Steps ===");
        console2.log("1. Set NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS in Vercel + .env to:");
        console2.log("   ", address(anchor));
        console2.log("2. forge verify-contract if --verify did not pick up automatically");
    }
}
```

- [ ] **Step 8.2: Local dry-run**

Run: `cd /Users/inancayvaz/MAS/contracts && forge script script/DeploySkillbaseAnchor.s.sol`
Expected: simulation succeeds, prints deployer + would-be address. No broadcast.

---

## Task 9: Deploy to Base Sepolia + verify on BaseScan

- [ ] **Step 9.1: Pre-flight env check**

Run: `echo "$STUDIO_PRIVATE_KEY" | wc -c` (should be 65 or 67 with newline). `echo $BASE_SEPOLIA_RPC_URL`. `echo $BASESCAN_API_KEY`.

If any missing → load from `.env`: `set -a && source .env && set +a`.

- [ ] **Step 9.2: Broadcast deploy**

Run:
```bash
cd /Users/inancayvaz/MAS/contracts
forge script script/DeploySkillbaseAnchor.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

Expected output: `SkillbaseAnchor deployed: 0x...` + BaseScan verification confirmation.

If verification fails inline, try standalone:
```bash
forge verify-contract \
  --chain base-sepolia \
  --watch \
  --constructor-args $(cast abi-encode "constructor(address)" $DEPLOYER_ADDRESS) \
  $DEPLOYED_ADDRESS \
  src/SkillbaseAnchor.sol:SkillbaseAnchor
```

- [ ] **Step 9.3: Wire address everywhere**

After deploy succeeds, the deployed address goes into:
- `.env` → `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS=0x...`
- `.env.example` → `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS=` (empty placeholder, with comment)
- Vercel project env (apps/2048): same key, paste value via Vercel CLI or dashboard
- `packages/contracts/src/addresses.ts` default fallback: replace `""` with the deployed address (so local dev works without env)

Confirm with user before touching Vercel project settings.

- [ ] **Step 9.4: Sanity read**

Run: `cast call $DEPLOYED_ADDRESS "totalAnchored()(uint256)" --rpc-url $BASE_SEPOLIA_RPC_URL`
Expected: `0`

Run: `cast call $DEPLOYED_ADDRESS "owner()(address)" --rpc-url $BASE_SEPOLIA_RPC_URL`
Expected: deployer address.

Run: `cast call $DEPLOYED_ADDRESS "authorizedAnchors(address)(bool)" $DEPLOYER --rpc-url $BASE_SEPOLIA_RPC_URL`
Expected: `true`

---

## Task 10: 3 manual cron triggers

- [ ] **Step 10.1: Local trigger (loopback)**

Start the dev server:
```bash
cd /Users/inancayvaz/MAS/apps/2048 && pnpm dev
```

In another shell:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/anchor-sp-snapshot
```

Expected JSON: `{ "ok": true, "snapshotId": "...", "txHash": "0x...", "walletCount": N, "totalSpAtSnapshot": M }`.

If `walletCount` is 0 (empty SP ledger on dev DB), that's fine — the contract still accepts the snapshot of an empty ledger. The hash will be deterministic for the empty case.

- [ ] **Step 10.2: Verify on BaseScan**

Open `https://sepolia.basescan.org/tx/$TX_HASH`. Expected:
- Contract: SkillbaseAnchor (verified ✓)
- Method: `anchorSnapshot`
- Status: Success
- One `SnapshotAnchored` event log

- [ ] **Step 10.3: Verify Supabase row**

Run via Supabase SQL editor or psql:
```sql
select snapshot_id, timestamp_unix, hash, anchor_tx_hash, anchored_at
from v2_sp_snapshots
order by created_at desc
limit 5;
```

Expected: most recent row has both `hash` and `anchor_tx_hash` populated.

- [ ] **Step 10.4: Repeat for two more triggers**

Wait at least 1 second between triggers (timestamp_unix is unique). Repeat steps 10.1-10.3 two more times.

After three runs:
- BaseScan contract page → Transactions tab shows 3 `anchorSnapshot` calls + 1 `setAuthorizedAnchor` (from deploy) = 4 total writes
- `v2_sp_snapshots` table has 3 rows with non-null `anchor_tx_hash`

- [ ] **Step 10.5: Verify on-chain hash matches off-chain hash**

Pick the most recent row. Run:
```bash
cast call $SKILLBASE_ANCHOR_ADDRESS \
  "verifySnapshot(uint256,bytes32)(bool)" \
  $TIMESTAMP_UNIX \
  $HASH_FROM_SUPABASE \
  --rpc-url $BASE_SEPOLIA_RPC_URL
```
Expected: `true`

This is the gate: the on-chain hash and the Supabase hash match → end-to-end verification works.

---

## Task 11: Atomic commit

- [ ] **Step 11.1: Stage and review**

Run: `cd /Users/inancayvaz/MAS && git status`
Expected files added/modified:
- `contracts/src/SkillbaseAnchor.sol` (new)
- `contracts/test/SkillbaseAnchor.t.sol` (new)
- `contracts/script/DeploySkillbaseAnchor.s.sol` (new)
- `packages/sp-engine/src/anchor.ts` (new)
- `packages/sp-engine/src/anchor.test.ts` (new)
- `packages/sp-engine/src/index.ts` (modified — re-exports)
- `packages/contracts/src/skillbase-anchor.abi.ts` (new)
- `packages/contracts/src/addresses.ts` (modified)
- `packages/contracts/src/index.ts` (possibly modified)
- `supabase/migrations/v2_20260428_sp_snapshots.sql` (new)
- `apps/2048/src/app/api/cron/anchor-sp-snapshot/route.ts` (new)
- `apps/2048/vercel.json` (modified — new cron)
- `.env.example` (modified — new key)
- `docs/superpowers/plans/2026-04-28-skillbase-anchor-mvp.md` (this plan)

Run: `git diff --stat` for a summary. Read for surprises.

- [ ] **Step 11.2: Commit**

```bash
git add contracts/src/SkillbaseAnchor.sol contracts/test/SkillbaseAnchor.t.sol contracts/script/DeploySkillbaseAnchor.s.sol \
  packages/sp-engine/src/anchor.ts packages/sp-engine/src/anchor.test.ts packages/sp-engine/src/index.ts \
  packages/contracts/src/skillbase-anchor.abi.ts packages/contracts/src/addresses.ts packages/contracts/src/index.ts \
  supabase/migrations/v2_20260428_sp_snapshots.sql \
  apps/2048/src/app/api/cron/anchor-sp-snapshot/route.ts apps/2048/vercel.json \
  .env.example \
  docs/superpowers/plans/2026-04-28-skillbase-anchor-mvp.md

git commit -m "$(cat <<'EOF'
feat(anchor): port DecisionAnchor → SkillbaseAnchor MVP for SP ledger transparency

Ships SP ledger snapshot anchoring on Base Sepolia. Daily cron canonicalizes
v2_user_stats, computes SHA-256, persists to v2_sp_snapshots, and writes the
hash to SkillbaseAnchor contract. Reuses STUDIO_PRIVATE_KEY for testnet.

- contracts/src/SkillbaseAnchor.sol — flat snapshots[timestamp]→hash, ported
  from ceos.run DecisionAnchor with bug fix (correct event first topic) and
  storage shape adapted for SP ledger semantics
- contracts/test/SkillbaseAnchor.t.sol — 17 tests, mirrors source coverage
- packages/sp-engine/src/anchor.ts — deterministic SHA-256 canonicalization
- supabase/migrations/v2_20260428_sp_snapshots.sql — public-readable snapshot
  table with anchor tx hash linkage
- apps/2048/.../anchor-sp-snapshot/route.ts — daily 02:07 UTC cron

Deferred to follow-up sprint (Gates 9-13): x402 endpoint, Bazaar registration,
apex marketing copy, smoke matrix +6 assertions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11.3: Confirm with user before pushing**

Per safety rules, ask explicitly: "Push to origin/main?" Wait for affirmative. Then `git push origin main`.

---

## Self-Review Checklist (Run after writing this plan)

- [x] **Spec coverage** — Gates 1-8 mapped. Gates 9-13 explicitly deferred at top.
- [x] **No placeholders** — every step has concrete code or commands. The one deliberate user-input slot (`selectCanonicalWalletFields`) is called out as such.
- [x] **Type consistency** — `CanonicalSnapshot`, `UserStatsRow`, `SKILLBASE_ANCHOR_ABI`, `SKILLBASE_ANCHOR_ADDRESS` all consistent across tasks.
- [x] **Path corrections** — contracts at `contracts/`, not `packages/contracts/`. Cron in `apps/2048`. ABI export under `packages/contracts/`.
- [x] **Bug fix locked in** — Task 2 step 2.1 explicitly tests the corrected event first topic.

---

## Backlog (defer to follow-up sprint)

- x402 endpoint `/api/public/data/sp-snapshot` ($0.05/call)
- x402 Bazaar registration
- Apex marketing copy: lift "SP Merkle anchoring" from planned → shipped in `skillbase-apex/lib/constants.ts`
- Smoke matrix +6 assertions (`sp.anchor_published_today` per game subdomain)
- Wallet balance heartbeat for STUDIO key (alert when ETH < threshold)
- Anchor frequency tuning study (daily vs hourly vs on-event)
- Merkle proof generation API (per-wallet inclusion proofs against snapshot hash)
- AI lab licensing kit: client-side SDK for snapshot integrity verification
- ERC-8004 Trust Registry port (player + sponsor + AI lab reputation layer)
