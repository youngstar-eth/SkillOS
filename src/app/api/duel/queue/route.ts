import { NextResponse } from "next/server";

// POST /api/duel/queue
// Placeholder — joins (or creates) a queued duel. Agent 2 will wire matching.
export async function POST() {
  return NextResponse.json({ queued: true, matchId: null });
}
