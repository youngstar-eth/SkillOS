// ───────────────────────────────────────────────────────────────────────────
// Public read — SP snapshot anchor status. NO x402, NO auth.
//
// Used by the smoke matrix to assert "today's anchor landed". Exposes the
// same information that's already public on-chain (tx hash + anchored_at)
// plus a derived `anchored_today` boolean for cheap polling.
//
// Why this exists alongside the x402 /api/public/data/sp-snapshot endpoint:
//   /api/public/data/sp-snapshot       → $0.05, full canonical_json (data product)
//   /api/sp-snapshot-status (this)     → free, anchor health metadata only (ops)
//
// Response shape stays small + deterministic so smoke runners can curl + jq
// without authenticating.
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getSupabaseService } from "@skillos/lib-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StatusRow {
  snapshot_id: string;
  timestamp_unix: number;
  anchor_tx_hash: string | null;
  anchored_at: string | null;
  wallet_count: number;
}

export async function GET(): Promise<Response> {
  try {
    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("v2_sp_snapshots")
      .select("snapshot_id,timestamp_unix,anchor_tx_hash,anchored_at,wallet_count")
      .not("anchor_tx_hash", "is", null)
      .order("timestamp_unix", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[sp-snapshot-status] query failed", error);
      return NextResponse.json(
        { ok: false, error: "query_failed", detail: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({
        ok: true,
        anchored_today: false,
        latest: null,
        note: "no anchored snapshots yet (cron has not fired or first fire pending)",
      });
    }

    const row = data as StatusRow;
    const todayUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const anchoredDateUtc = row.anchored_at
      ? new Date(row.anchored_at).toISOString().slice(0, 10)
      : null;

    return NextResponse.json({
      ok: true,
      anchored_today: anchoredDateUtc === todayUtc,
      anchored_date_utc: anchoredDateUtc,
      today_utc: todayUtc,
      latest: {
        snapshot_id: row.snapshot_id,
        timestamp_unix: row.timestamp_unix,
        anchor_tx_hash: row.anchor_tx_hash,
        anchored_at: row.anchored_at,
        wallet_count: row.wallet_count,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[sp-snapshot-status] fatal", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
