// ───────────────────────────────────────────────────────────────────────────
// Public types for the recap half of @skillos/ai-coach.
//
// Coach = tactical, private, "here's how you improve".
// Recap = dramatic, shareable, "here's the story of this match".
//
// Input shape deliberately mirrors CoachRequest so an app already wired for
// coach can call generateRecap() without gathering new data. Game-specific
// context flows through the same untyped `gameSpecificData` bag — each
// per-game recap prompt reads whatever keys it cares about.
// ───────────────────────────────────────────────────────────────────────────

import type { GameType } from "../types";

/**
 * Narrative archetype chosen by Haiku based on match shape (not by the user).
 * The per-game recap prompt gives the model examples for each style and
 * lets it pick. If the model emits anything else, generate.ts falls back
 * to "standard".
 *
 * - comeback   — loser was ahead mid-match, winner overtook
 * - blowout    — dominant win (score ratio or threshold gap)
 * - nailBiter  — very tight final margin
 * - speedRun   — finished well below typical duration
 * - grind      — finished well above typical duration
 * - standard   — nothing distinctive; tell the match as-is
 */
export type RecapStyle =
  | "comeback"
  | "blowout"
  | "nailBiter"
  | "speedRun"
  | "grind"
  | "standard";

export interface RecapRequest {
  gameType: GameType;
  myScore: number;
  opponentScore: number;
  won: boolean;
  durationSeconds: number;
  /** Same opaque bag as CoachRequest. Each per-game prompt decides what it uses. */
  gameSpecificData?: Record<string, unknown>;
}

export interface RecapResponse {
  /** Model-selected archetype. UI uses this to pick an accent/icon. */
  style: RecapStyle;
  /** ≤8 words, punchy, meme-able. Renders as the card's title. */
  headline: string;
  /** 2 sentences, dramatic but factual, uses real numbers from the match. */
  narrative: string;
  /**
   * ≤240 chars, Twitter-safe. Includes the literal token "{url}" where the
   * caller should substring-replace with the match's public URL. Includes
   * "@SkillOS" handle mention. Written so it reads well even before the
   * URL is substituted (in case the caller only wants copy-to-clipboard
   * with no URL).
   */
  shareText: string;
}
