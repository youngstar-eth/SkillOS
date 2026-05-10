import { createSoloRecapHandler } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const POST = createSoloRecapHandler({ gameType: "clicker" });
