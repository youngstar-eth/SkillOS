import {
  gameOgImage,
  gameOgAlt,
  OG_SIZE,
  OG_CONTENT_TYPE,
} from "@skillbase/ui/og/game-card";

const TITLE = "Wordle";
const TAGLINE = "Guess smarter. Score higher. Earn SP.";

export const runtime = "nodejs";
export const alt = gameOgAlt(TITLE, TAGLINE);
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function og() {
  return gameOgImage({ game: "wordle", title: TITLE, tagline: TAGLINE });
}
