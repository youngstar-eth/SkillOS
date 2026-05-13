import type { ScoringResult } from './index.js';

// 30-70 cells filled correctly, score = filled × 10 → 300-700.
export function generateScore(seed: bigint): ScoringResult {
  const filled = 30 + Number(seed % 41n);
  const score = filled * 10;
  return {
    score,
    metadata: {
      seed: seed.toString(),
      duration_ms: filled * 1_500,
      version: 'sudoku@0.3.0',
    },
  };
}
