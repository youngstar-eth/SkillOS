import type { ScoringResult } from './index.js';

// 100-1000 tick count, score = ticks.
export function generateScore(seed: bigint): ScoringResult {
  const ticks = 100 + Number(seed % 901n);
  const score = ticks;
  return {
    score,
    metadata: {
      seed: seed.toString(),
      duration_ms: ticks * 100,
      version: 'clicker@0.3.0',
    },
  };
}
