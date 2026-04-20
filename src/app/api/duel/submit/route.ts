import { NextResponse } from "next/server";

// POST /api/duel/submit
// Placeholder — submits a final score for a match.
export async function POST() {
  return NextResponse.json({ submitted: true });
}
