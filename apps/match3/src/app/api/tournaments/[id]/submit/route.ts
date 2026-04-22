import { createTournamentSubmitHandler } from "@skillbase/duel-backend";

export const runtime = "nodejs";
export const POST = createTournamentSubmitHandler({ game: "match3" });
