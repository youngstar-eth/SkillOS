// Vercel Cron entry — TournamentCreated event indexer.
// Schedule defined in apps/orchestrator/vercel.json. Daily (00:23 UTC, offset
// from the existing crons so they don't pile up). Vercel Hobby tier rejects
// sub-daily expressions; sub-daily cadence requires Pro upgrade or an
// external scheduler hitting this endpoint with the bearer token.
//
// The indexer DRAINS within a single invocation (sweeps successive batches up
// to a ~50s budget), so one daily run catches up to the safe tip even though
// the public RPC caps eth_getLogs at 2000 blocks. Lag is therefore bounded by
// the daily cadence, not unbounded. Set TOURNAMENT_INDEXER_MAX_BLOCK_SPAN=2000
// in prod (no premium RPC) — see the indexer module header.
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` automatically.
// Local/manual triggers must include the same header.

import { runIndexTournamentsCreated } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const maxDuration = 60; // drains successive getLogs batches under a ~50s budget
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Allow unauthenticated invocation in dev/test only — never in prod.
    return process.env.NODE_ENV !== "production";
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runIndexTournamentsCreated();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron index-tournaments-created] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
