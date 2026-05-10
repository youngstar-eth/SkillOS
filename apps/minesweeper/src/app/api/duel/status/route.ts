import { createStatusHandler } from "@skillos/duel-backend";
import { GAME_SLUG } from "@/lib/game-slug";

export const runtime = "nodejs";
export const GET = createStatusHandler({
  gameSlug: GAME_SLUG,
  gameType: "minesweeper",
});
