// Type re-exports for the score submit wrapper.
//
// The SDK exposes these through the useSkillOSScore hook's mutationFn shape.
// We re-export them locally so consumers can type their wrapper without
// reaching into the SDK's internal types.

// Mirrors useSkillOSScore's mutationFn parameter shape (after omitting
// tournamentId, which is closed over by the hook). The SDK requires all
// three fields at the wire level; the wrapper provides sensible defaults.
export interface ScoreSubmitInput {
  score: number;
  tier: 'T0';
  matchCountDelta: number;
}

export interface ScoreSubmitResult {
  txHash: string;
  soloRunId: string;
  submittedAt: string;
  tier: 'T0';
}
