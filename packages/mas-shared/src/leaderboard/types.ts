import type { CategoryKey } from "./config";

export interface GameLeaderboardEntry {
  user_address: string;
  game_slug: string;
  rank: number;
  best_score: number;
  rank_points: number;
}

export interface AggregateLeaderboardEntry {
  user_address: string;
  scope: "category" | "overall";
  category: CategoryKey | null;
  rank: number;
  total_points: number;
  games_played: number;
  multi_game_bonus_applied: boolean;
}

export interface UserDayStats {
  day: string;
  totalPoints: number;
  gamesPlayed: number;
  overallRank: number | null;
  categoryRanks: Partial<Record<CategoryKey, number>>;
  /** Per-game ranks the user holds today. */
  gameRanks: Record<
    string,
    { rank: number; bestScore: number; rankPoints: number }
  >;
}

export interface SubmitScoreInput {
  userAddress: string;
  gameSlug: string;
  score: number;
  tournamentId?: number | null;
  gameData?: Record<string, unknown>;
}
