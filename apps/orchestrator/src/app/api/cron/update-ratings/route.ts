// Vercel Cron entry — daily slot. Schedule in apps/orchestrator/vercel.json.
//
// SPEC §D.1 called for every-10-min cadence, but Vercel Hobby tier
// rejects sub-daily crons (same constraint settle-tournaments hit). We
// run daily at 00:35 UTC — well after settle starts at 00:05 and after
// the index-tournaments-created sweep at 00:23 — so settled tournaments
// are picked up within ~24h. Cadence can tighten if/when we move off
// Hobby tier.
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` when
// hitting the endpoint. Local/manual triggers must include the same
// header to pass.

import { runUpdateRatings, withAlert } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const maxDuration = 300;
// Force dynamic — Supabase reads via fetch would otherwise be cached.
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
    const result = await withAlert("update-ratings", runUpdateRatings)();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron update-ratings] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
