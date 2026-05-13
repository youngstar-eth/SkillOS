import type { ScoringResult } from './index.js';

// 5-25 cascades simulated, score = cascades × 100 → 500-2500.
export function generateScore(seed: bigint): ScoringResult {
  const cascades = 5 + Number(seed % 21n);
  const score = cascades * 100;
  return {
    score,
    metadata: {
      seed: seed.toString(),
      duration_ms: cascades * 3_000,
      version: 'match3@0.3.0',
    },
  };
}
