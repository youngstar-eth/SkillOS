// ───────────────────────────────────────────────────────────────────────────
// @skillbase/sp-engine — anchor.ts
//
// Deterministic SHA-256 canonicalization of the SP ledger for on-chain
// anchoring via SkillbaseAnchor.anchorSnapshot(timestamp, hash).
//
// Invariant: same SP state → same hash, every time, anywhere. This is the
// load-bearing primitive for AI lab verification. If an external caller
// fetches the canonical JSON from /api/public/data/sp-snapshot (future) and
// hashes it themselves, they MUST get the same hash that's anchored on-chain.
//
// Ported from ceos.run apps/agent-runtime/src/services/reputation-anchor.ts
// canonicalize() pattern:
//   - deep-sort all object keys recursively
//   - JSON.stringify with no whitespace
//   - SHA-256 the UTF-8 bytes
//
// Adapted for SP ledger semantics (one global ledger, snapshotted by timestamp)
// instead of ceos.run per-agent decision logs.
// ───────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

// ─── Source row from Supabase v2_user_stats ────────────────────────────────

/**
 * One wallet's row in the SP ledger source table. Mirrors the column shape
 * documented in supabase/migrations/v2_20260424_user_stats.sql. Keep this in
 * sync if v2_user_stats columns change — and bump the canonical schema
 * version below.
 */
export interface UserStatsRow {
  user_address: string;
  total_sp: number;
  current_level: number;
  duels_won: number;
  duels_lost: number;
  tournaments_participated: number;
  tournaments_won: number;
  last_active_at: string | null; // ISO-8601 or null if never active
  created_at: string;            // ISO-8601
}

// ─── Canonical envelope (what gets hashed) ─────────────────────────────────

/**
 * The canonical per-wallet entry. Shape is determined by
 * `selectCanonicalWalletFields()` below. Kept loosely typed here because the
 * selector is the source of truth for which fields are committed on-chain;
 * tightening this signature would force a coordinated edit at every change.
 *
 * Convention enforced by `buildSnapshot`: every entry MUST have an `address`
 * field (string), used for deterministic sort. Other fields are at the
 * selector author's discretion.
 */
export interface CanonicalWalletEntry {
  address: string;
  [key: string]: string | number | boolean | null;
}

/**
 * The full canonical snapshot envelope — what JSON.stringify(deepSortKeys(...))
 * digests with SHA-256.
 */
export interface CanonicalSnapshot {
  /** Schema version. Bump when selectCanonicalWalletFields output shape changes. */
  version: 1;
  /** Unix seconds. Doubles as the on-chain mapping key in SkillbaseAnchor. */
  timestampUnix: number;
  /** Number of entries in `wallets`. */
  walletCount: number;
  /** Sum of total_sp across all wallets. Sanity check for verifiers. */
  totalSpAtSnapshot: number;
  /** Sorted by lowercase(address) ascending. */
  wallets: CanonicalWalletEntry[];
}

// ─── Determinism primitives ────────────────────────────────────────────────

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
 * Canonical JSON of a snapshot — sorted keys, no whitespace.
 * Public so AI labs can call it client-side after fetching the snapshot from
 * the public endpoint, then independently SHA-256 it and compare to the
 * on-chain anchor.
 */
export function canonicalize(snapshot: CanonicalSnapshot): string {
  return JSON.stringify(deepSortKeys(snapshot));
}

/**
 * SHA-256 of canonical JSON, as 0x-prefixed 32-byte hex.
 * Suitable for direct passing as `bytes32` to SkillbaseAnchor.anchorSnapshot.
 */
export function hashSnapshot(snapshot: CanonicalSnapshot): `0x${string}` {
  const canonical = canonicalize(snapshot);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `0x${digest}` as `0x${string}`;
}

// ─── Canonical wallet projection ──────────────────────────────────────────
//
// `selectCanonicalWalletFields` decides which fields of a UserStatsRow get
// committed to the on-chain hash. v1 commits balances-only:
//
//   • address (lowercased — EIP-55 checksums vary by tooling, lowercase is
//     deterministic across Postgres exports, viem, ethers, web3.py)
//   • total_sp (the canonical "what does this wallet hold" balance)
//   • current_level (derived from total_sp via levelForSP, but committed
//     directly so verifiers don't have to re-run the level table to check)
//
// Activity counters (duels_won, tournaments_won, etc.) are intentionally
// NOT committed: they're re-derivable from public on-chain duel/tournament
// events. Anchoring them would add weight without adding verification power.
//
// Timestamps are NOT committed: the snapshot is purely about SP balances at
// a given moment. The snapshot's own timestampUnix is in the envelope.
//
// Bumping past v1: add fields here AND increment `version` in CanonicalSnapshot
// so verifiers can disambiguate hash schema versions.
// ───────────────────────────────────────────────────────────────────────────

export function selectCanonicalWalletFields(row: UserStatsRow): CanonicalWalletEntry {
  return {
    address: row.user_address.toLowerCase(),
    total_sp: row.total_sp,
    current_level: row.current_level,
  };
}

/**
 * Build a full canonical snapshot from a list of UserStatsRows.
 * Filters non-positive SP, sorts by lowercase(address), aggregates totals.
 */
export function buildSnapshot(
  timestampUnix: number,
  rows: UserStatsRow[],
): CanonicalSnapshot {
  const wallets = rows
    .filter((r) => r.total_sp > 0)
    .map(selectCanonicalWalletFields);

  // Deterministic order: lowercase address ascending. localeCompare with
  // sensitivity:"base" would be more correct for unicode, but addresses are
  // ASCII-only hex — plain string compare on lowercase is sufficient + faster.
  wallets.sort((a, b) => {
    const aAddr = String(a.address).toLowerCase();
    const bAddr = String(b.address).toLowerCase();
    return aAddr < bAddr ? -1 : aAddr > bAddr ? 1 : 0;
  });

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
