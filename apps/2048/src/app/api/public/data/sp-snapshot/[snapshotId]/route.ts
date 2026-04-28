// ───────────────────────────────────────────────────────────────────────────
// x402-paid endpoint — $0.05 USDC per call (premium tier).
// Returns a SPECIFIC historical SP ledger snapshot by snapshot_id.
//
// Mirrors /api/public/data/sp-snapshot (latest) but takes a snapshotId
// path param. Used by AI labs that have a specific historical anchor they
// want to re-verify.
//
// 404 if snapshot_id not found (payment still settles — matches pattern).
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseService } from "@skillbase/lib-shared";
import { SKILLBASE_ANCHOR_ADDRESS } from "@skillbase/contracts";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildVerification(snapshotHash: string, anchorAddress: string) {
  return {
    contract_address: anchorAddress,
    contract_url: `https://sepolia.basescan.org/address/${anchorAddress.toLowerCase()}`,
    network: "Base Sepolia (chain id 84532)",
    method:
      "verifySnapshot(uint256 timestamp_unix, bytes32 expectedHash) returns (bool)",
    instructions:
      "SHA-256 the canonical_json (sorted keys, no whitespace), prefix with 0x, and call verifySnapshot(timestamp_unix, hash) on the contract. Reference hash: " +
      snapshotHash,
  };
}

export const GET = withX402(async (request: NextRequest) => {
  if (!SKILLBASE_ANCHOR_ADDRESS) {
    return NextResponse.json(
      {
        error: "anchor_not_configured",
        detail:
          "SKILLBASE_ANCHOR_ADDRESS env not set on this deployment. Cannot return verification metadata.",
      },
      { status: 503 },
    );
  }

  // Pull snapshotId from URL path. Next 14 dynamic segment lives at
  // ../[snapshotId]/route.ts so the segment is the last non-empty path part
  // before any querystring.
  const pathname = new URL(request.url).pathname;
  const snapshotId = pathname.split("/").filter(Boolean).pop() ?? "";

  if (!UUID_RE.test(snapshotId)) {
    return NextResponse.json(
      {
        error: "invalid_snapshot_id",
        detail: "snapshot_id must be a UUID (e.g. v4 from gen_random_uuid())",
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from("v2_sp_snapshots")
    .select(
      "snapshot_id,timestamp_unix,hash,wallet_count,total_sp_at_snapshot,canonical_json,anchor_tx_hash,anchored_at",
    )
    .eq("snapshot_id", snapshotId)
    .maybeSingle();

  if (error) {
    console.error("[sp-snapshot/[id]] query failed", error);
    return NextResponse.json(
      { error: "query_failed", detail: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "snapshot_not_found", snapshot_id: snapshotId },
      { status: 404 },
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
  });
});
