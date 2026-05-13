import type { ScoringResult } from './index.js';

// 10-40 safe cells revealed, score = revealed × 25 → 250-1000.
export function generateScore(seed: bigint): ScoringResult {
  const revealed = 10 + Number(seed % 31n);
  const score = revealed * 25;
  return {
    score,
    metadata: {
      seed: seed.toString(),
      duration_ms: revealed * 5_000,
      version: 'minesweeper@0.3.0',
    },
  };
}
