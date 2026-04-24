import { createSoloRecapHandler } from "@skillbase/duel-backend";

export const runtime = "nodejs";
export const POST = createSoloRecapHandler({ gameType: "game2048" });
