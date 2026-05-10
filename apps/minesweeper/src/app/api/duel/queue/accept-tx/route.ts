import { createAcceptTxHandler } from "@skillos/duel-backend";
import { GAME_SLUG } from "@/lib/game-slug";

export const runtime = "nodejs";
export const POST = createAcceptTxHandler({ gameSlug: GAME_SLUG });
