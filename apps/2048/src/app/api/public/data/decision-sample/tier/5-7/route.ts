// x402-paid endpoint — $0.05 USDC per call.
// Tier filter: L5-L7 (mid-tier skilled players).

import { NextResponse, type NextRequest } from "next/server";
import { parseGame, sampleDecision } from "@/lib/decision-sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const game = parseGame(request.nextUrl.searchParams.get("game"));
  const body = await sampleDecision({ tier: "5-7", game });
  return NextResponse.json(body);
}
