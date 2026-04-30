import {
  gameOgImage,
  gameOgAlt,
  OG_SIZE,
  OG_CONTENT_TYPE,
} from "@skillbase/ui/og/game-card";

const TITLE = "Sudoku";
const TAGLINE = "Solve faster. Think deeper. Earn SP.";

export const runtime = "nodejs";
export const alt = gameOgAlt(TITLE, TAGLINE);
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function og() {
  return gameOgImage({ game: "sudoku", title: TITLE, tagline: TAGLINE });
}
