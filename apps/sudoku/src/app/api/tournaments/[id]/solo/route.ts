import { createTournamentSoloHandler } from "@skillbase/duel-backend";

export const runtime = "nodejs";
export const POST = createTournamentSoloHandler({ game: "sudoku" });
