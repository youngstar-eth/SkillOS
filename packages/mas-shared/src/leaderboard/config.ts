// Leaderboard configuration — categories, rank-point table, multi-game bonus.
// Single source of truth. Cron, API handlers, UI all import from here.

export const CATEGORIES = {
  card_puzzle: {
    label: "Card & Puzzle",
    games: ["solitaire", "sudoku", "minesweeper", "2048", "wordle", "match3"],
  },
  arcade: {
    label: "Arcade",
    games: ["snake", "pong", "breakout", "bubble", "crossy", "flappy"],
  },
  action: {
    label: "Action",
    games: ["jetpack", "stickman", "geometry", "hillclimb"],
  },
  skill_sports: {
    label: "Skill & Sports",
    games: ["pool", "helix"],
  },
  economy: {
    label: "Economy",
    games: ["clicker", "tower"],
  },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

/** Rank → points table. Index 0 = rank 1 (100), index 9 = rank 10 (10), 11+ = 0. */
export const RANK_POINTS: readonly number[] = [
  100, 90, 80, 70, 60, 50, 40, 30, 20, 10,
];

/** Played 5+ distinct games on a day → overall total × 1.5. */
export const MULTI_GAME_THRESHOLD = 5;
export const MULTI_GAME_MULTIPLIER = 1.5;

export function getCategoryForGame(gameSlug: string): CategoryKey | null {
  for (const [cat, { games }] of Object.entries(CATEGORIES) as [
    CategoryKey,
    { games: readonly string[] },
  ][]) {
    if ((games as readonly string[]).includes(gameSlug)) return cat;
  }
  return null;
}

export function rankToPoints(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > RANK_POINTS.length) return 0;
  return RANK_POINTS[rank - 1] ?? 0;
}

/** All 20 game slugs flattened from the category map. */
export const ALL_GAME_SLUGS: readonly string[] = Object.values(CATEGORIES)
  .flatMap((c) => c.games as readonly string[])
  .filter((s, i, arr) => arr.indexOf(s) === i);
