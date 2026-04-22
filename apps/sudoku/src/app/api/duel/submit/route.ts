import { createSubmitHandler } from "@skillbase/duel-backend";
import { GAME_SLUG } from "@/lib/game-slug";

export const runtime = "nodejs";
export const POST = createSubmitHandler({
  gameSlug: GAME_SLUG,
  gameType: "sudoku",
});
