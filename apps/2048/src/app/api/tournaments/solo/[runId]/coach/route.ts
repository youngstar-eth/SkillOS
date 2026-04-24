import { createSoloCoachHandler } from "@skillbase/duel-backend";

export const runtime = "nodejs";
export const POST = createSoloCoachHandler({ gameType: "game2048" });
