import { createCoachHandler } from "@skillos/duel-backend";
import { GAME_SLUG } from "@/lib/game-slug";

export const runtime = "nodejs";
export const POST = createCoachHandler({
  gameSlug: GAME_SLUG,
  gameType: "game2048",
});
