// Vercel Cron entry — runs daily at 00:05 UTC. Schedule in apps/orchestrator/vercel.json.
// (Vercel Hobby tier rejects sub-daily crons, so this is daily, not minute-grain
// as originally designed; pending settles accumulate up to 24h before sweep.)
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` when hitting
// the endpoint. Local/manual triggers must include the same header to pass.

import { runSettleTournaments } from "@skillbase/duel-backend";

export const runtime = "nodejs";
export const maxDuration = 300; // batch settles can stack up after a deploy
// Must be dynamic — Supabase reads via fetch would otherwise be cached,
// returning stale "no unsettled tournaments" results.
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
  try {
    const result = await runSettleTournaments();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron settle-tournaments] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
