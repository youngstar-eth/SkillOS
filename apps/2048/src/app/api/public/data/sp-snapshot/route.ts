// ───────────────────────────────────────────────────────────────────────────
// x402-paid endpoint — $0.05 USDC per call (premium tier).
// Returns the LATEST anchored SP ledger snapshot + on-chain anchor proof.
//
// AI labs use this to verify SP balances cryptographically:
//   1. Fetch this endpoint, get canonical_json + hash + anchor_tx_hash
//   2. SHA-256 the canonical_json (sorted keys, no whitespace) themselves
//   3. Compare to the on-chain hash via SkillbaseAnchor.verifySnapshot()
//   4. Confirm match → balances are authentic
//
// Pre-first-cron-fire state: returns 503 with awaiting_first_anchor body
// when v2_sp_snapshots is empty. Payment still settles (matches existing
// endpoint pattern: settlement is unconditional once x402 verifies).
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getSupabaseService } from "@skillos/lib-shared";
import { SKILLBASE_ANCHOR_ADDRESS } from "@skillos/contracts";
import { withX402 } from "@/lib/x402-handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SnapshotRow {
  snapshot_id: string;
  timestamp_unix: number;
  hash: string;
  wallet_count: number;
  total_sp_at_snapshot: number;
  canonical_json: unknown;
  anchor_tx_hash: string | null;
  anchored_at: string | null;
}

function buildVerification(snapshotHash: string, anchorAddress: string) {
  return {
    contract_address: anchorAddress,
    contract_url: `https://sepolia.basescan.org/address/${anchorAddress.toLowerCase()}`,
    network: "Base Sepolia (chain id 84532)",
    method:
      "verifySnapshot(uint256 timestamp_unix, bytes32 expectedHash) returns (bool)",
    instructions:
      "SHA-256 the canonical_json (sorted keys, no whitespace), prefix with 0x, and call verifySnapshot(timestamp_unix, hash) on the contract. Or read snapshots(timestamp_unix) directly and compare bytes32. Reference hash for cross-check: " +
      snapshotHash,
  };
}

export const GET = withX402(async () => {
  if (!SKILLBASE_ANCHOR_ADDRESS) {
    // Configuration error — surface clearly. Charge applies (matches pattern).
    return NextResponse.json(
      {
        error: "anchor_not_configured",
        detail:
          "SKILLBASE_ANCHOR_ADDRESS env not set on this deployment. Cannot return verification metadata.",
      },
      { status: 503 },
    );
  }

  const supabase = getSupabaseService();

  // Most recent anchored row. We surface unanchored rows separately (NULL
  // anchor_tx_hash means anchor tx is in flight or failed; that's operator
  // territory, not consumer-facing).
  const { data, error } = await supabase
    .from("v2_sp_snapshots")
    .select(
      "snapshot_id,timestamp_unix,hash,wallet_count,total_sp_at_snapshot,canonical_json,anchor_tx_hash,anchored_at",
    )
    .not("anchor_tx_hash", "is", null)
    .order("timestamp_unix", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[sp-snapshot] query failed", error);
    return NextResponse.json(
      { error: "query_failed", detail: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        status: "awaiting_first_anchor",
        detail:
          "No anchored SP snapshots yet. Daily cron fires at 02:07 UTC; first row lands shortly after.",
        retry_after_seconds: 600,
        contract_address: SKILLBASE_ANCHOR_ADDRESS,
      },
      { status: 503 },
    );
  }

  const row = data as SnapshotRow;

  return NextResponse.json({
    snapshot_id: row.snapshot_id,
    timestamp_unix: row.timestamp_unix,
    anchored_at: row.anchored_at,
    hash: row.hash,
    wallet_count: row.wallet_count,
    total_sp_at_snapshot: row.total_sp_at_snapshot,
    anchor_tx_hash: row.anchor_tx_hash,
    anchor_tx_url: row.anchor_tx_hash
      ? `https://sepolia.basescan.org/tx/${row.anchor_tx_hash}`
      : null,
    canonical_json: row.canonical_json,
    verification: buildVerification(row.hash, SKILLBASE_ANCHOR_ADDRESS),
    related_endpoints: [
      "/api/public/data/sp-snapshot/[snapshotId]",
      "/api/public/data/sp-tier-distribution",
    ],
  });
});
