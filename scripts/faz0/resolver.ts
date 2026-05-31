// Faz 0 Pitch-MVP — Stage 2 off-chain resolver for the SettlementDemo
// optimistic-challenge loop.
//
// On a `challenge`, the resolver re-runs the EXISTING Δ6 2048 engine
// `verify(seed, inputLog)` (seam #5 — no game logic is reimplemented here) and
// supplies the engine-authoritative `replayedScore` to the on-chain
// `resolve(claimId, replaySeed, replayedScore)`. The contract re-derives fraud
// from that score and slashes the wrong side.
//
// Determinism is the whole point: anyone can re-run this same public engine on
// the on-chain-revealed seed + the anchored inputLog and reproduce the verdict
// ("deterministic-auditable"). The resolver is a convenience, not a trust root.
//
// Stage 2 is off-chain only (no deploy, no broadcast). `buildResolveArgs`
// produces the exact on-chain call args without a wallet; Stage 3 wraps it.

import { keccak256, toBytes, type Hex } from 'viem';
import { engine2048, type MoveRecord, type Move2048 } from '@skillos/engines';

/**
 * Commit-reveal (Settlement SPEC seam #2). Mirrors the contract's
 * `keccak256(bytes(seed))` exactly, so the off-chain commit equals the on-chain
 * `seedCommit`.
 */
export function commitSeed(seed: string): Hex {
  return keccak256(toBytes(seed));
}

/** True iff `seed` reveals to `commit` (the on-chain seedCommit), case-insensitive. */
export function verifyReveal(seed: string, commit: Hex): boolean {
  return commitSeed(seed).toLowerCase() === commit.toLowerCase();
}

export interface ClaimToResolve {
  /** The on-chain-revealed seed (must match the arena's seedCommit). */
  seed: string;
  /** The off-chain inputLog anchored by the claim (T2 evidence). */
  inputLog: MoveRecord<Move2048>[];
  /** The score the claimer asserted on-chain. */
  claimedScore: number;
}

export interface ResolverVerdict {
  /** Engine-authoritative replay score — exactly what `resolve()` posts. */
  replayedScore: number;
  /** Whether the inputLog was well-formed under the engine. */
  engineValid: boolean;
  /** replayedScore !== claimedScore ⇒ the claim is fraudulent. */
  fraud: boolean;
}

/**
 * Re-runs `verify(seed, inputLog)` on the existing Δ6 2048 engine and decides
 * the claim. A malformed inputLog yields `{ replayedScore: 0, engineValid: false }`
 * (never a throw), which is itself fraud against any non-zero claim.
 */
export function resolveClaim(claim: ClaimToResolve): ResolverVerdict {
  const { score, valid } = engine2048.verify(claim.seed, claim.inputLog);
  return {
    replayedScore: score,
    engineValid: valid,
    fraud: score !== claim.claimedScore,
  };
}

/**
 * Key-free bridge to Stage 3: assembles the exact arguments for the on-chain
 * `resolve(claimId, replaySeed, replayedScore)` WITHOUT broadcasting. The
 * founder's Stage 3 wrapper supplies the wallet/signer.
 */
export function buildResolveArgs(claimId: Hex, seed: string, verdict: ResolverVerdict) {
  return {
    claimId,
    replaySeed: seed,
    replayedScore: BigInt(verdict.replayedScore),
  } as const;
}
