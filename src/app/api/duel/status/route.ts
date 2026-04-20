import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/duel/status?matchId=X
// Placeholder — polled by the waiting page until a match is found.
export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get("matchId");
  return NextResponse.json({ matchId, status: "waiting" });
}
