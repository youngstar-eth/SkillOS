// Vercel Cron entry — TournamentCreated event indexer.
// Schedule defined in apps/orchestrator/vercel.json. Daily (00:23 UTC, offset
// from the existing crons so they don't pile up). Vercel Hobby tier rejects
// sub-daily expressions; sub-daily cadence requires Pro upgrade or an
// external scheduler hitting this endpoint with the bearer token.
//
// Until upgraded: TournamentCreated events accumulate up to 24h between
// indexer runs. Acceptable for reporting posture (creator metadata is read
// by dashboards/audit, never on the duel/settle hot paths).
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` automatically.
// Local/manual triggers must include the same header.

import { runIndexTournamentsCreated, withAlert } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const maxDuration = 60; // RPC getLogs over a small window is fast
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
    const result = await withAlert(
      "index-tournaments-created",
      runIndexTournamentsCreated,
    )();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron index-tournaments-created] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
