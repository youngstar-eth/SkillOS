import { createRecapHandler } from "@skillbase/duel-backend";
import { GAME_SLUG } from "@/lib/game-slug";

export const runtime = "nodejs";
export const POST = createRecapHandler({
  gameSlug: GAME_SLUG,
  gameType: "sudoku",
});
