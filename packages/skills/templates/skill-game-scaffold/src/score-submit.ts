// score-submit.ts — thin wrapper around useSkillOSScore's submit fn.
//
// In a real game, call this at game-over with the final score. The wrapper
// adds a small layer of input validation + error logging that's useful in
// most production wirings. Extend it with your own retry / queueing logic
// if you need it (see references/error-recovery.md in the @skillos/skills
// pack for patterns).

import type { ScoreSubmitInput, ScoreSubmitResult } from './sdk-types';

// Caller-facing input — all optional defaults are filled by the wrapper.
interface SubmitInput {
  score: number;
  tier?: 'T0';
  matchCountDelta?: number;
}

export async function submitScoreOnce(
  submit: (input: ScoreSubmitInput) => Promise<ScoreSubmitResult>,
  input: SubmitInput,
): Promise<void> {
  if (!Number.isFinite(input.score) || input.score < 0) {
    console.warn(`[score-submit] refusing to submit invalid score: ${input.score}`);
    return;
  }

  try {
    const result = await submit({
      score: Math.floor(input.score),
      tier: input.tier ?? 'T0',
      matchCountDelta: input.matchCountDelta ?? 1,
    });
    console.log(`[score-submit] tx=${result.txHash}`);
  } catch (err) {
    console.error('[score-submit] failed:', (err as Error).message);
  }
}
