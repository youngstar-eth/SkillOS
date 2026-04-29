// Vercel Cron entry — sponsor event indexer.
// Schedule defined in apps/sponsor/vercel.json. Daily (00:15 UTC, offset
// from the 2048 crons so they don't pile up). Vercel Hobby tier rejects
// sub-daily expressions; sub-daily cadence requires Pro upgrade or an
// external scheduler hitting this endpoint with the bearer token.
//
// Until upgraded: sponsor events accumulate up to 24h between indexer
// runs. Acceptable for sweepstakes posture (no funds at risk during
// the gap), worse UX (sponsor's dashboard reflects with up to 24h lag).
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` automatically.
// Local/manual triggers must include the same header.

import { runIndexSponsorEvents } from "@skillbase/duel-backend";

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
    const result = await runIndexSponsorEvents();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron index-sponsor-events] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
