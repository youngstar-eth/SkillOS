// Shared types for the AI layer. Each game has its own shape inside
// `Challenge.data` and `AnalyzeRequest.stats`, enumerated below.

// ─── Challenge (daily) ──────────────────────────────────────────────────────
export interface WordleChallengeData {
  /** Exactly 5 uppercase letters. */
  word: string;
  /** One clever hint; never reveals letters. */
  hint: string;
}

export interface Game2048ChallengeData {
  /** Pre-seeded tiles on a 4×4 grid. Row/col are 0-indexed. */
  startingTiles: Array<{ row: number; col: number; value: number }>;
  /** Suggested target to reach for a bonus. */
  targetScore?: number;
}

export interface HillclimbChallengeData {
  /** PRNG seed that drives terrain generation. */
  seed: number;
  /** Distance (m) the player should reach for today's badge. */
  targetDistance?: number;
  /** Flavour text for weather/vehicle conditions. */
  conditions?: string;
}

export type ChallengeData =
  | WordleChallengeData
  | Game2048ChallengeData
  | HillclimbChallengeData;

export interface Challenge<D extends ChallengeData = ChallengeData> {
  /** Short headline: "Coffee Culture", "Corner Start", "Desert Run". */
  theme: string;
  /** Game-specific payload. */
  data: D;
  /** 2-sentence flavour paragraph shown on the banner. */
  description: string;
}

// ─── Analysis (coach) ───────────────────────────────────────────────────────
export interface WordleStats {
  word: string;
  guesses: number;
  timeSeconds: number;
  startWord: string;
  guessHistory: Array<{ word: string; states: string[] }>;
  percentile?: number;
  won: boolean;
}

export interface Game2048Stats {
  score: number;
  moves: number;
  maxTile: number;
  durationMs: number;
  won: boolean;
  percentile?: number;
}

export interface HillclimbStats {
  distance: number;
  score: number;
  fuelConsumed: number;
  elapsedMs: number;
  percentile?: number;
}

export type GameStats = WordleStats | Game2048Stats | HillclimbStats;

export interface Analysis {
  narration: string;
}
