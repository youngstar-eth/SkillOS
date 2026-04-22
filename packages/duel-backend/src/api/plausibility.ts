// ───────────────────────────────────────────────────────────────────────────
// Public plausibility endpoint — the "trust signal" side of anti-cheat.
//
//   GET /api/duel/[id]/plausibility
//
// Returns a user-safe shape that ALWAYS obscures the internal verdict:
//   - { status: "pending"  }                           when plausibility_check IS NULL
//   - { status: "reviewed", reviewedAt: ISO string }   when it's populated
//
// We never return verdict, confidence, reasoning, or flags. That's
// /api/admin/flags territory (auth-gated). This endpoint exists solely
// to drive the AI-Reviewed badge on the result page.
//
// Error / malformed states also collapse to { status: "pending" } — the
// user never sees a failure state; the badge simply shows the subdued
// "Reviewing…" variant instead of the green check until the backend
// catches up or (on pathological failure) forever. Graceful degradation.
//
// Usage (apps/<game>/src/app/api/duel/[id]/plausibility/route.ts):
//   export { plausibilityHandler as GET } from "@skillbase/duel-backend";
//   export const runtime = "nodejs";
// ───────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { getSupabaseService, isUuid } from "@skillbase/lib-shared";

type PublicPlausibilityResponse =
  | { status: "pending" }
  | { status: "reviewed"; reviewedAt: string };

/** Soft-pending on any failure; preserves the "never expose verdict" contract. */
function pending(): Response {
  return Response.json({
    status: "pending",
  } satisfies PublicPlausibilityResponse);
}

export async function plausibilityHandler(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const matchId = ctx.params.id;
  if (!isUuid(matchId)) return pending();

  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from("v2_duels")
    .select("plausibility_check")
    .eq("id", matchId)
    .maybeSingle();
  if (error) {
    console.error("[plausibility] db read failed", matchId, error);
    return pending();
  }
  if (!data) return pending();

  const pc = (data as { plausibility_check: unknown }).plausibility_check;
  if (pc === null || pc === undefined) return pending();
  if (typeof pc !== "object") return pending();

  // Only reviewedAt escapes. If it's missing/malformed we treat the whole
  // row as pending — the admin endpoint will still see the row.
  const reviewedAt = (pc as { reviewedAt?: unknown }).reviewedAt;
  if (typeof reviewedAt !== "string" || reviewedAt.length === 0) {
    return pending();
  }

  return Response.json({
    status: "reviewed",
    reviewedAt,
  } satisfies PublicPlausibilityResponse);
}
