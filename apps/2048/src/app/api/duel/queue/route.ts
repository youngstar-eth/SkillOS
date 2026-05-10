import { createQueueHandler } from "@skillos/duel-backend";
import { GAME_SLUG } from "@/lib/game-slug";

export const runtime = "nodejs";
export const POST = createQueueHandler({ gameSlug: GAME_SLUG });
