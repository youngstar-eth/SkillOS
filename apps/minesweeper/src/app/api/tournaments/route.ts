import { createTournamentActiveHandler } from "@skillbase/duel-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createTournamentActiveHandler({ game: "minesweeper" });
