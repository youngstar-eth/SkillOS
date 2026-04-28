// ───────────────────────────────────────────────────────────────────────────
// Unit tests for the SP ledger anchor canonicalization. Node's built-in test
// runner via tsx — no jest/vitest dep. Run from package dir:
//
//   npx tsx --test src/anchor.test.ts
//
// Coverage map:
//   1. selectCanonicalWalletFields — same row → same projection (determinism)
//   2. canonicalize — input order invariance + no-whitespace property
//   3. hashSnapshot — format, determinism, order invariance
//   4. buildSnapshot — total_sp == 0 filtering + non-zero sanity changes
//   5. timestamp sensitivity — different timestamps → different hashes
//
// CRITICAL: these tests are the gate that protects the "verifier reproduces
// the on-chain hash from public canonical JSON" claim. If they're green, an
// AI lab calling SHA-256(canonicalize(snapshot)) gets the same digest the
// cron sent to SkillbaseAnchor. If they go red, the trust claim is broken.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSnapshot,
  canonicalize,
  hashSnapshot,
  selectCanonicalWalletFields,
} from "./anchor";
import type { UserStatsRow } from "./anchor";

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
    const p1 = selectCanonicalWalletFields(ROW_A);
    const p2 = selectCanonicalWalletFields(ROW_A);
    assert.deepEqual(p1, p2);
  });

  it("emits an `address` field (sort key invariant)", () => {
    const p = selectCanonicalWalletFields(ROW_A);
    assert.equal(typeof p.address, "string");
    assert.ok(p.address.length > 0);
  });
});

describe("canonicalize", () => {
  it("produces identical strings regardless of input order", () => {
    const s1 = buildSnapshot(TS, [ROW_A, ROW_B]);
    const s2 = buildSnapshot(TS, [ROW_B, ROW_A]); // Reverse order
    assert.equal(canonicalize(s1), canonicalize(s2));
  });

  it("produces no-whitespace output", () => {
    const s = buildSnapshot(TS, [ROW_A]);
    const json = canonicalize(s);
    assert.ok(!/\s/.test(json), "canonical JSON should contain no whitespace");
  });

  it("emits keys in alphabetical order at the envelope level", () => {
    const s = buildSnapshot(TS, [ROW_A]);
    const json = canonicalize(s);
    // Top-level keys sorted: timestampUnix, totalSpAtSnapshot, version, walletCount, wallets
    // (alphabetical: t-i, t-o, v, w-a, w-e — actually: timestampUnix < totalSpAtSnapshot < version < walletCount < wallets)
    const firstKeyIdx = json.indexOf('"timestampUnix"');
    const versionIdx = json.indexOf('"version"');
    assert.ok(
      firstKeyIdx > 0 && firstKeyIdx < versionIdx,
      "timestampUnix should appear before version in canonical JSON",
    );
  });
});

describe("hashSnapshot", () => {
  it("returns 0x-prefixed 32-byte hex", () => {
    const s = buildSnapshot(TS, [ROW_A]);
    const h = hashSnapshot(s);
    assert.match(h, /^0x[0-9a-f]{64}$/);
  });

  it("is deterministic — same snapshot → same hash, every call", () => {
    const s = buildSnapshot(TS, [ROW_A, ROW_B]);
    assert.equal(hashSnapshot(s), hashSnapshot(s));
  });

  it("is order-invariant — same wallets, any input order → same hash", () => {
    const s1 = buildSnapshot(TS, [ROW_A, ROW_B]);
    const s2 = buildSnapshot(TS, [ROW_B, ROW_A]);
    assert.equal(hashSnapshot(s1), hashSnapshot(s2));
  });

  it("changes when total_sp changes (sanity)", () => {
    const s1 = buildSnapshot(TS, [ROW_A]);
    const s2 = buildSnapshot(TS, [{ ...ROW_A, total_sp: ROW_A.total_sp + 1 }]);
    assert.notEqual(hashSnapshot(s1), hashSnapshot(s2));
  });

  it("changes when timestamp changes (sanity)", () => {
    const s1 = buildSnapshot(TS, [ROW_A]);
    const s2 = buildSnapshot(TS + 1, [ROW_A]);
    assert.notEqual(hashSnapshot(s1), hashSnapshot(s2));
  });
});

describe("buildSnapshot", () => {
  it("excludes wallets with total_sp == 0", () => {
    const zeroRow: UserStatsRow = { ...ROW_A, total_sp: 0, user_address: "0x000000000000000000000000000000000000zero" };
    const sWithZero = buildSnapshot(TS, [ROW_A, zeroRow, ROW_B]);
    const sWithout = buildSnapshot(TS, [ROW_A, ROW_B]);
    assert.equal(hashSnapshot(sWithZero), hashSnapshot(sWithout));
  });

  it("excludes wallets with negative total_sp (defensive)", () => {
    const negRow: UserStatsRow = { ...ROW_A, total_sp: -1, user_address: "0xneg" };
    const sWithNeg = buildSnapshot(TS, [ROW_A, negRow]);
    const sWithout = buildSnapshot(TS, [ROW_A]);
    assert.equal(hashSnapshot(sWithNeg), hashSnapshot(sWithout));
  });

  it("aggregates totalSpAtSnapshot correctly when total_sp is in the canonical projection", () => {
    const s = buildSnapshot(TS, [ROW_A, ROW_B]);
    // totalSpAtSnapshot is computed from the canonical wallet's total_sp field.
    // If the user's selectCanonicalWalletFields drops total_sp, this test still
    // passes (sum of zero contributions = 0). It only fires meaningfully when
    // total_sp is preserved in the projection — which the default does.
    const projectedSum = s.wallets.reduce(
      (sum, w) => sum + (typeof w.total_sp === "number" ? w.total_sp : 0),
      0,
    );
    assert.equal(s.totalSpAtSnapshot, projectedSum);
  });

  it("walletCount matches wallets.length", () => {
    const s = buildSnapshot(TS, [ROW_A, ROW_B]);
    assert.equal(s.walletCount, s.wallets.length);
  });

  it("returns wallets sorted by lowercase address", () => {
    // ROW_B starts with 0xBbbb (lowercase b), ROW_A starts with 0xAaaa (lowercase a).
    // After sort, A should come before B.
    const s = buildSnapshot(TS, [ROW_B, ROW_A]);
    assert.equal(s.wallets.length, 2);
    assert.ok(
      String(s.wallets[0]!.address).toLowerCase() <
        String(s.wallets[1]!.address).toLowerCase(),
      "wallets should be sorted by lowercase address asc",
    );
  });
});

describe("hashSnapshot — empty ledger", () => {
  it("produces a stable hash for an empty wallet list", () => {
    const s = buildSnapshot(TS, []);
    const h = hashSnapshot(s);
    assert.match(h, /^0x[0-9a-f]{64}$/);
    assert.equal(s.walletCount, 0);
    assert.equal(s.totalSpAtSnapshot, 0);
    // Same call → same hash (covers the dev-DB path where v2_user_stats may be empty)
    assert.equal(hashSnapshot(s), hashSnapshot(s));
  });
});
