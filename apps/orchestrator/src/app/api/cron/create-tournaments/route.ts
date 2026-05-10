// Vercel Cron entry — runs daily at 00:00 UTC. Schedule in apps/orchestrator/vercel.json.
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` when hitting
// the endpoint. Local/manual triggers must include the same header to pass.

import { runCreateTournaments } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const maxDuration = 120; // up to 6 games × daily + 6 × weekly = 12 txs worst case
// Must be dynamic — handler issues Supabase reads through fetch, which
// Next.js would otherwise cache and return stale data for the dedupe SELECT.
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured → refuse in prod to avoid open endpoint, but
    // accept in dev so local curl works without extra env setup.
    return process.env.NODE_ENV !== "production";
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runCreateTournaments();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron create-tournaments] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
