// Vercel Cron entry — ScoreSubmitted event indexer.
// Schedule defined in apps/orchestrator/vercel.json. Daily (00:27 UTC, offset
// from the existing crons so they don't pile up). Vercel Hobby tier rejects
// sub-daily expressions; sub-daily cadence requires Pro upgrade or an external
// scheduler hitting this endpoint with the bearer token.
//
// Unlike the TournamentCreated indexer, this one backs the LEADERBOARD (a hot
// read), so runIndexScoresSubmitted DRAINS multiple block batches per
// invocation (bounded by a wall-clock budget under maxDuration) to keep pace
// with Base's ~43k blocks/day. See packages/duel-backend/src/cron/
// index-scores-submitted.ts header for the drain-loop rationale.
//
// Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` automatically.
// Local/manual triggers (incl. break-glass backfill loops) must include the
// same header.

import { runIndexScoresSubmitted } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const maxDuration = 60; // drain loop self-bounds at RUN_BUDGET_MS=50s
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
    const result = await runIndexScoresSubmitted();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron index-scores-submitted] fatal", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
