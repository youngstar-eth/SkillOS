// x402-paid endpoint — $0.02 USDC per call.
// Tier filter: L1-L4 (novice to early improvers).

import { NextResponse, type NextRequest } from "next/server";
import { parseGame, sampleDecision } from "@/lib/decision-sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const game = parseGame(request.nextUrl.searchParams.get("game"));
  const body = await sampleDecision({ tier: "1-4", game });
  return NextResponse.json(body);
}
