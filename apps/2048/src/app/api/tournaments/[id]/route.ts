import { createTournamentDetailHandler } from "@skillbase/duel-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createTournamentDetailHandler({ game: "2048" });
