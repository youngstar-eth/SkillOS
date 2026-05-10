import { createSubmitHandler } from "@skillos/duel-backend";
import { GAME_SLUG } from "@/lib/game-slug";

export const runtime = "nodejs";
export const POST = createSubmitHandler({
  gameSlug: GAME_SLUG,
  gameType: "minesweeper",
});
