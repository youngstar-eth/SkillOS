import { createTournamentSoloHandler } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const POST = createTournamentSoloHandler({ game: "2048" });
