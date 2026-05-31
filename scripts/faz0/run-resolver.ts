// Faz 0 Pitch-MVP — Stage 3 resolver CLI (key-free).
//
// Re-runs the EXISTING Δ6 2048 engine on a challenged claim and prints the
// engine-authoritative replayedScore + a ready-to-broadcast `resolve()` line.
// Pure compute — no key, no network, no broadcast. The founder/Hermes runs this,
// then broadcasts the printed `cast send` with the RESOLVER account locally.
//
// Defaults reproduce the canonical golden vector (seed "replay-determinism",
// 7 moves → score 20). Override via env: SEED, MOVES (csv), CLAIMED_SCORE,
// CLAIM_ID.
//
//   npx tsx scripts/faz0/run-resolver.ts
//   CLAIMED_SCORE=9999 CLAIM_ID=0x... npx tsx scripts/faz0/run-resolver.ts

import type { MoveRecord, Move2048 } from '@skillos/engines';
import { commitSeed, resolveClaim, buildResolveArgs } from './resolver';

const seed = process.env.SEED ?? 'replay-determinism';
const moves = (process.env.MOVES ?? 'left,down,right,up,left,left,down')
  .split(',')
  .map((m) => m.trim()) as Move2048[];
const claimedScore = Number(process.env.CLAIMED_SCORE ?? '20');
const claimId = (process.env.CLAIM_ID ?? '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`;

const inputLog: MoveRecord<Move2048>[] = moves.map((move, seq) => ({ seq, move }));
const verdict = resolveClaim({ seed, inputLog, claimedScore });
const args = buildResolveArgs(claimId, seed, verdict);

console.log(
  JSON.stringify(
    {
      seed,
      seedCommit: commitSeed(seed),
      moves,
      claimedScore,
      verdict, // { replayedScore, engineValid, fraud }
    },
    null,
    2,
  ),
);

console.log('\nresolve() args (key-free):');
console.log(`  claimId       = ${args.claimId}`);
console.log(`  replaySeed    = "${args.replaySeed}"`);
console.log(`  replayedScore = ${args.replayedScore.toString()}`);

console.log('\nfounder broadcasts (RESOLVER account):');
console.log(
  `  cast send "$DEMO" "resolve(bytes32,string,uint256)" \\\n` +
    `    ${args.claimId} "${args.replaySeed}" ${args.replayedScore.toString()} \\\n` +
    `    --rpc-url base_sepolia --account "$RESOLVER_ACCOUNT"`,
);
