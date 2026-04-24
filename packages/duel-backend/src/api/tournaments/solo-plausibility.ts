// ───────────────────────────────────────────────────────────────────────────
// Public plausibility endpoint for solo runs — the trust-signal side of
// anti-cheat, identical response contract to duel's plausibility handler.
//
//   GET /api/tournaments/solo/[runId]/plausibility
//
// Returns:
//   { status: "pending" }                           when plausibility_check IS NULL
//   { status: "reviewed", reviewedAt: ISO string }  when it's populated
//
// Never exposes verdict / confidence / reasoning / flags — that's
// admin-gated. This endpoint exists solely to drive the AI-Reviewed
// badge on the solo result panel.
//
// All failure modes collapse to { status: "pending" } — preserves the
// "never reveal internal audit state" contract of the duel counterpart.
//
// Usage (apps/<game>/src/app/api/tournaments/solo/[runId]/plausibility/route.ts):
//   export { soloPlausibilityHandler as GET } from "@skillbase/duel-backend";
//   export const runtime = "nodejs";
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { getSupabaseService, isUuid } from "@skillbase/lib-shared";

type PublicPlausibilityResponse =
  | { status: "pending" }
  | { status: "reviewed"; reviewedAt: string };

function pending(): Response {
  return Response.json({
    status: "pending",
  } satisfies PublicPlausibilityResponse);
}

export async function soloPlausibilityHandler(
  _req: NextRequest,
  ctx: { params: { runId: string } },
): Promise<Response> {
  const runId = ctx.params.runId;
  if (!isUuid(runId)) return pending();

  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from("v2_tournament_solo_runs")
    .select("plausibility_check")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    console.error("[solo-plausibility] db read failed", runId, error);
    return pending();
  }
  if (!data) return pending();

  const pc = (data as { plausibility_check: unknown }).plausibility_check;
  if (pc === null || pc === undefined) return pending();
  if (typeof pc !== "object") return pending();

  const reviewedAt = (pc as { reviewedAt?: unknown }).reviewedAt;
  if (typeof reviewedAt !== "string" || reviewedAt.length === 0) {
    return pending();
  }

  return Response.json({
    status: "reviewed",
    reviewedAt,
  } satisfies PublicPlausibilityResponse);
}
