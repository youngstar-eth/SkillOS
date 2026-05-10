import { createTournamentDetailHandler } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createTournamentDetailHandler({ game: "wordle" });
