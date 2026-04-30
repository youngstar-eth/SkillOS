import {
  gameOgImage,
  gameOgAlt,
  OG_SIZE,
  OG_CONTENT_TYPE,
} from "@skillbase/ui/og/game-card";

const TITLE = "Match 3";
const TAGLINE = "Chain combos. Stack points. Earn SP.";

export const runtime = "nodejs";
export const alt = gameOgAlt(TITLE, TAGLINE);
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function og() {
  return gameOgImage({ game: "match3", title: TITLE, tagline: TAGLINE });
}
