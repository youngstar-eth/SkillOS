// ───────────────────────────────────────────────────────────────────────────
// Public types for @skillos/ai-coach.
//
// Kept minimal and stable: the route handler (duel-backend) and the client
// component (AICoach.tsx in each app) both consume these.
// ───────────────────────────────────────────────────────────────────────────

/** The 6 Phase-1 game slugs. Extend as new games are ported into v3. */
export type GameType =
  | "game2048"
  | "wordle"
  | "sudoku"
  | "minesweeper"
  | "clicker"
  | "match3";

/**
 * Tone label returned alongside feedback. Widened past the initial 3-enum
 * in the spec to faithfully represent each game's per-game voice
 * (see GAME_TONE_MAP in prompts/base.ts). Frontend can use this to tint
 * the coach card or pick an icon.
 */
export type CoachTone =
  | "encouraging" // fallback / unmapped
  | "tactical" // 2048 — move analysis
  | "analytical" // wordle — deduction, letter frequency
  | "technique" // sudoku — naked pair, hidden single
  | "risk" // minesweeper — probability framing
  | "pacing" // clicker — rhythm, fatigue
  | "strategic"; // match3 — cascade planning

export interface CoachRequest {
  gameType: GameType;
  myScore: number;
  opponentScore: number;
  won: boolean;
  durationSeconds: number;
  /**
   * Optional per-game context. Shape is intentionally untyped at the
   * package boundary — each app decides what to send (e.g. wordle
   * sends `{ attemptsUsed, solutionLength }`, 2048 sends
   * `{ maxTile, moveCount }`). The per-game prompt module reads
   * whatever keys it needs; missing keys degrade gracefully to a
   * more generic coach message.
   */
  gameSpecificData?: Record<string, unknown>;
}

export interface CoachResponse {
  /** 2–4 sentences, second-person ("you"), actionable. */
  feedback: string;
  tone: CoachTone;
}
