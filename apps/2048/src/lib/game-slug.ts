// Per-app gameSlug: the bytes32 value this app passes to `createChallenge`.
// Derived once from the canonical helper so every consumer agrees.

import { gameSlug } from "@skillos/contracts";

export const GAME_SLUG = gameSlug("2048");
