// Vercel Cron entry — runs daily at 01:13 UTC. Schedule in
// apps/orchestrator/vercel.json. (The 13-minute offset on a non-zero
// minute keeps us off the platform-wide :00 / :30 thundering-herd ridge,
// per Vercel's own scheduler guidance.)
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` when hitting
// the endpoint. Local/manual triggers must include the same header to pass.
//
// Dry-run: append `?dryRun=1` to the URL OR set the `DRY_RUN=1` env var.
// Decisions are logged but no DB or on-chain mutations occur. Used on
// first deploy to validate sweep behavior before flipping to live action.

import { runReconcileDuels, withAlert } from "@skillos/duel-backend";

export const runtime = "nodejs";
// Reconcile may broadcast settle() txs for stuck Accepted-with-both-scores
// rows; each tx waits for receipt (≤60s). With limit=50 and concurrency=1,
// worst-case wall-time is bounded but generous.
export const maxDuration = 300;
// Force-dynamic so Supabase reads aren't fetch-cached, returning stale
// "no stale rows" results.
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
  // Query-param dry-run flag overrides the env-var. Treat any truthy
  // value (1 / true / yes) as dry-run; anything else falls through to
  // the env-var check inside runReconcileDuels.
  const url = new URL(req.url);
  const dryRunParam = url.searchParams.get("dryRun");
  const dryRun =
    dryRunParam === "1" ||
    dryRunParam === "true" ||
    dryRunParam === "yes" ||
    undefined; // undefined → fall through to DRY_RUN env-var inside runner
  try {
    const result = await withAlert("reconcile-duels", () =>
      runReconcileDuels(dryRun === true ? { dryRun: true } : {}),
    )();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron reconcile-duels] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
