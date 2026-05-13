import type { ScoringResult } from './index.js';

// Plausible 0-50th percentile range per plan B.1:
// Solved in 1-4 attempts → score 800/600/400/200 (fewer attempts = higher score).
export function generateScore(seed: bigint): ScoringResult {
  const attempts = Number(seed % 4n) + 1;
  const score = (5 - attempts) * 200;
  return {
    score,
    metadata: {
      seed: seed.toString(),
      duration_ms: 30_000 + attempts * 15_000,
      version: 'wordle@0.3.0',
    },
  };
}
