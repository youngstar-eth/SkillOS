// Vercel Cron entry — runs daily at 02:07 UTC (post settle-tournaments at 00:05).
// Schedule lives in apps/orchestrator/vercel.json.
//
// Off-minute :07 chosen to avoid the :00 fleet pile-up across Vercel's tenants.
// 02:00 UTC chosen because settle-tournaments at 00:05 needs to land first
// (rank bonuses change SP totals → snapshot should reflect post-settle state).
//
// Pipeline:
//   1. Auth check (CRON_SECRET — same pattern as other crons in this dir)
//   2. Read non-zero-SP wallets from v2_user_stats via getSupabaseService
//   3. Build canonical snapshot + SHA-256 hash via @skillbase/sp-engine
//   4. Insert v2_sp_snapshots row WITHOUT anchor_tx_hash (durability: if the
//      on-chain anchor reverts, the canonical JSON is still preserved for
//      operator inspection / manual re-anchor)
//   5. Call SkillbaseAnchor.anchorSnapshot(timestamp, hash)
//   6. Update the row with anchor_tx_hash + anchored_at
//
// Race-safety: SkillbaseAnchor.anchorSnapshot reverts with AlreadyAnchored
// when snapshots[timestamp] != bytes32(0). During the migration cutover, if
// the legacy host (apps/2048) and orchestrator both fire in the same second,
// the second tx reverts cleanly and its DB row is left with anchor_tx_hash
// NULL (operator cleanup is a single SQL DELETE). See README.md > Race-window
// safety.
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`. Local/manual
// triggers must include the same header.

import {
  SKILLBASE_ANCHOR_ABI,
  SKILLBASE_ANCHOR_ADDRESS,
} from "@skillbase/contracts";
import {
  buildSnapshot,
  canonicalize,
  hashSnapshot,
  type UserStatsRow,
} from "@skillbase/sp-engine";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
} from "@skillbase/lib-shared";

export const runtime = "nodejs";
export const maxDuration = 60; // single ledger read + one tx + one update — generous budget
// Must be dynamic — Supabase reads via fetch are otherwise cached by Next, returning
// stale "no wallets" results. Same reason as the other crons in this directory.
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
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
    // ── 1. Read SP ledger ──────────────────────────────────────────────
    const supabase = getSupabaseService();
    const { data: rows, error: readErr } = await supabase
      .from("v2_user_stats")
      .select(
        "user_address,total_sp,current_level,duels_won,duels_lost,tournaments_participated,tournaments_won,last_active_at,created_at",
      )
      .gt("total_sp", 0);

    if (readErr) throw new Error(`Supabase read failed: ${readErr.message}`);
    const ledger = (rows ?? []) as UserStatsRow[];

    // ── 2. Canonicalize + hash ─────────────────────────────────────────
    const timestampUnix = Math.floor(Date.now() / 1000);
    const snapshot = buildSnapshot(timestampUnix, ledger);
    const hash = hashSnapshot(snapshot);

    // ── 3. Persist canonical JSON (anchor_tx_hash NULL until on-chain confirm) ─
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

    // ── 4. Anchor on-chain ─────────────────────────────────────────────
    const wallet = getWalletClient();
    const pub = getPublicClient();

    const account = wallet.account;
    if (!account) throw new Error("Wallet client missing account (STUDIO_PRIVATE_KEY?)");

    const txHash = await wallet.writeContract({
      account,
      chain: wallet.chain,
      address: SKILLBASE_ANCHOR_ADDRESS,
      abi: SKILLBASE_ANCHOR_ABI,
      functionName: "anchorSnapshot",
      args: [BigInt(timestampUnix), hash],
    });

    const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      // Snapshot row stays with NULL anchor_tx_hash — operator inspects, may
      // re-anchor manually with a new timestamp. Don't fail the row.
      throw new Error(`Anchor tx reverted: ${txHash}`);
    }

    // ── 5. Update Supabase row with confirmed tx hash ──────────────────
    const { error: updateErr } = await supabase
      .from("v2_sp_snapshots")
      .update({ anchor_tx_hash: txHash, anchored_at: new Date().toISOString() })
      .eq("snapshot_id", snapshotId);

    if (updateErr) {
      // Tx confirmed on-chain but DB update failed — log loudly. The snapshot
      // is anchored (verifiable via cast call) but the DB row will look
      // "unanchored" until reconciled. Operator can run a manual UPDATE.
      console.error("[cron anchor-sp-snapshot] DB update post-anchor failed", updateErr);
    }

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
