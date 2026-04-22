// ───────────────────────────────────────────────────────────────────────────
// Per-game coach prompt — Match-3. Tone: "strategic".
//
// Match-3 skill is about cascade planning, not reflexes. Every swap is
// a choice between an immediate small match and a deferred swap that
// sets up a chain reaction. Coach vocabulary:
//   - cascade / chain — one match triggering another
//   - special tile — 4-in-a-row, 5-in-a-row, L/T-shape yields a bonus
//   - board density / dead space — where combos are possible
//   - deferred swap — passing on a 3-match to enable a 4+ next move
//
// Useful gameSpecificData keys (populated by apps/match3 if available):
//   - swapsUsed: number
//   - maxCascadeLength: number — longest single-move chain
//   - specialsCreated: number  — 4+/L/T shapes made
//   - wastedSwaps: number      — undid or no-op
// ───────────────────────────────────────────────────────────────────────────

import type { CoachRequest } from "../types";
import { COACH_SYSTEM_BASE, summarizeMatch } from "./base";

export function buildMatch3Prompt(req: CoachRequest): {
  system: string;
  user: string;
} {
  const system = `${COACH_SYSTEM_BASE}

Game: Match-3. Tone: "strategic".
Talk about cascade planning and special-tile creation. If specialsCreated
is low relative to swapsUsed, the player is settling for 3-matches when
4+/L/T shapes were available. If maxCascadeLength is 1, they are not
setting up chain reactions. A large score gap against you almost always
means the opponent got a big cascade — name it. Crisp, not preachy.

When emitting the tone field, use exactly: "strategic".`;

  return { system, user: summarizeMatch(req) };
}
