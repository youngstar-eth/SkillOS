// Public entry for the leaderboard subsystem.

export {
  CATEGORIES,
  RANK_POINTS,
  MULTI_GAME_THRESHOLD,
  MULTI_GAME_MULTIPLIER,
  ALL_GAME_SLUGS,
  type CategoryKey,
  getCategoryForGame,
  rankToPoints,
} from "./config";

export type {
  GameLeaderboardEntry,
  AggregateLeaderboardEntry,
  UserDayStats,
  SubmitScoreInput,
} from "./types";

export { submitScore } from "./submit-score";
export { computeDailyRanks } from "./compute-ranks";
export { computeDailyAggregates } from "./compute-aggregates";
export {
  getGameLeaderboard,
  getCategoryLeaderboard,
  getOverallLeaderboard,
  getUserStats,
  listCategories,
} from "./queries";
