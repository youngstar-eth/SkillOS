// ───────────────────────────────────────────────────────────────────────────
// Public types for the solo-recap variant.
//
// RecapResponse shape is intentionally the same as duel recap so the
// AIRecap component renders both without a mapping layer. The INPUT
// differs (no opponent field) and the set of RecapStyles the model is
// allowed to pick from is narrowed — opponent-relative styles
// ("comeback", "blowout", "nailBiter") don't apply to solo.
// ───────────────────────────────────────────────────────────────────────────

import type { GameType } from "../types";

export interface SoloRecapRequest {
  gameType: GameType;
  score: number;
  durationSeconds: number;
  isPaidRetry?: boolean;
  gameSpecificData?: Record<string, unknown>;
}
