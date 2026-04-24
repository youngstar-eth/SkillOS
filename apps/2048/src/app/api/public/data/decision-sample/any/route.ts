// x402-paid endpoint — $0.01 USDC per call.
// Tier filter: any (no level filter applied).

import { NextResponse, type NextRequest } from "next/server";
import { parseGame, sampleDecision } from "@/lib/decision-sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const game = parseGame(request.nextUrl.searchParams.get("game"));
  const body = await sampleDecision({ tier: "any", game });
  return NextResponse.json(body);
}
