// 2048 prompts.

export const GAME2048_CHALLENGE_PROMPT = (date: string) => `Today is ${date}. Generate a 2048 daily challenge — a pre-seeded 4×4 board that creates an interesting strategic puzzle.

Return STRICT JSON matching exactly this schema — no prose, no markdown fences:

{
  "theme": "<1–3 word title, Title Case>",
  "data": {
    "startingTiles": [
      { "row": <0-3>, "col": <0-3>, "value": <2|4|8|16|32|64|128> }
    ],
    "targetScore": <integer, realistic reach score>
  },
  "description": "<2 sentences of flavour, ≤ 220 chars>"
}

Rules:
- Between 3 and 6 starting tiles. Coordinates: row 0 = top, col 0 = left.
- Values must be powers of two (2, 4, 8, 16, 32, 64, or 128).
- No two tiles on the same cell. No adjacent tiles of the same value at
  setup (that'd auto-merge on first move and ruin the puzzle).
- Theme should describe the setup's strategic flavour: "Corner Stack",
  "Scattered Powers", "Staircase Left", "Diagonal Chain".
- Target score should be ambitious but reachable from the setup (typically
  4000-12000 range).
- Description is flavour + strategic hint. Never mention "2048" or give
  explicit move directions.
`;

export const GAME2048_ANALYSIS_PROMPT = (stats: {
  score: number;
  moves: number;
  maxTile: number;
  durationMs: number;
  won: boolean;
  percentile?: number;
}) => `You are a tight, data-driven 2048 coach analysing one run.

Run data:
- Outcome: ${stats.won ? "HIT 2048" : "GAME OVER"}
- Final score: ${stats.score}
- Moves: ${stats.moves}
- Max tile: ${stats.maxTile}
- Duration: ${(stats.durationMs / 1000).toFixed(1)}s
- Moves/minute: ${((stats.moves * 60000) / Math.max(stats.durationMs, 1)).toFixed(1)}
${stats.percentile != null ? `- Tournament standing: top ${stats.percentile}%` : ""}

Analyse the run in ≤ 110 words. Plain text — no markdown, no bullets.
Cover at least two of:
1. Merge efficiency — score ÷ moves indicates wasted motion.
2. Peak tile vs. final score — did they chain high-value merges or grind small ones?
3. Tempo — fast rushing vs. considered play.
4. What pattern typically breaks a run at this tile (e.g. corner strategy
   collapsing when column 0 gets blocked).

Voice: laconic, chess-coach tone. No hype. End with one concrete takeaway.`;
