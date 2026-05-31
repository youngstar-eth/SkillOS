// Faz-0 — pure Δ6 verdict recompute for the public challenge-evidence page.
//
// Mirrors scripts/faz0/resolver.ts (faz0-challenge-demo branch) so the page can
// re-run the SAME public, deterministic 2048 engine the on-chain resolver used,
// WITHOUT merging PR #179. No key, no network, no broadcast — pure compute.
//
// The resolver is a convenience, not a trust root: anyone can re-run
// engine2048.verify(seed, inputLog) on the on-chain-revealed seed + anchored
// inputLog and reproduce the verdict ("deterministic-auditable").

import { keccak256, toBytes, type Hex } from "viem";
import { engine2048, type Move2048, type MoveRecord } from "@skillos/engines";

/** Mirrors the contract's keccak256(bytes(seed)) — off-chain commit == on-chain seedCommit. */
export function commitSeed(seed: string): Hex {
  return keccak256(toBytes(seed));
}

/** Wrap a flat move list into the canonical Δ6 inputLog envelope. */
export function toInputLog(moves: Move2048[]): MoveRecord<Move2048>[] {
  return moves.map((move, seq) => ({ seq, move }));
}

export interface ClaimToResolve {
  seed: string;
  inputLog: MoveRecord<Move2048>[];
  claimedScore: number;
}

export interface ResolverVerdict {
  /** Engine-authoritative replay score. */
  replayedScore: number;
  /** Whether the inputLog was well-formed under the engine. */
  engineValid: boolean;
  /** replayedScore !== claimedScore ⇒ fraud (matches the on-chain resolver). */
  fraud: boolean;
}

export function resolveClaim(claim: ClaimToResolve): ResolverVerdict {
  const { score, valid } = engine2048.verify(claim.seed, claim.inputLog);
  return {
    replayedScore: score,
    engineValid: valid,
    fraud: score !== claim.claimedScore,
  };
}
