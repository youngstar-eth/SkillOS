import { createSoloCoachHandler } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const POST = createSoloCoachHandler({ gameType: "minesweeper" });
