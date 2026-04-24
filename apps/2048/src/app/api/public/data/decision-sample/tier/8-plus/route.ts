// x402-paid endpoint — $0.10 USDC per call.
// Tier filter: L8+ (top-tier verified humans).

import { NextResponse, type NextRequest } from "next/server";
import { parseGame, sampleDecision } from "@/lib/decision-sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const game = parseGame(request.nextUrl.searchParams.get("game"));
  const body = await sampleDecision({ tier: "8-plus", game });
  return NextResponse.json(body);
}
