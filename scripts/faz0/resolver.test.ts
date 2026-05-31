// Faz 0 Pitch-MVP — Stage 2 off-chain resolver integration test (node:test via tsx).
//
// Locks the Stage 2 criteria from the dispatch:
//   - resolver re-runs a golden vector → matches the engine output;
//   - an honest claim resolves valid; a tampered score / tampered inputLog
//     resolves invalid (fraud).
// Plus commit-reveal parity with Solidity (seam #2) and the key-free
// on-chain-args bridge consumed by Stage 3 (no deploy, no broadcast here).
//
// Reuses the EXISTING @skillos/engines 2048 engine (seam #5) — no game logic is
// reimplemented in the resolver or this test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { engine2048, type MoveRecord, type Move2048 } from '@skillos/engines';
import { commitSeed, verifyReveal, resolveClaim, buildResolveArgs } from './resolver';

// ── canonical golden vector (the same seed the Stage-1 contract commits to) ──

const GOLDEN_PATH = fileURLToPath(
  new URL('../../packages/engines/src/__tests__/golden/2048.golden.json', import.meta.url),
);
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as {
  vectors: Array<{ name: string; seed: string; moves: string[]; expectedScore: number }>;
};
const shortSeven = golden.vectors.find((v) => v.name === 'short_seven');
assert.ok(shortSeven, 'short_seven golden vector present');

const SEED = shortSeven.seed; // 'replay-determinism'
const EXPECTED = shortSeven.expectedScore; // 20

function toLog(moves: string[]): MoveRecord<Move2048>[] {
  return moves.map((m, i) => ({ seq: i, move: m as Move2048 }));
}
const HONEST_LOG = toLog(shortSeven.moves);

// Solidity-parity anchor: `cast keccak "replay-determinism"`.
const SOLIDITY_COMMIT = '0x3d73a8824f5363670690e631fd24e631cf7bca266a6eb0871afc58b7ed16420d' as const;

// ── commit-reveal (seam #2) ────────────────────────────────────────────────

test('commitSeed matches Solidity keccak256(bytes(seed))', () => {
  assert.equal(commitSeed(SEED).toLowerCase(), SOLIDITY_COMMIT);
});

test('verifyReveal accepts the committed seed and rejects others', () => {
  assert.equal(verifyReveal(SEED, SOLIDITY_COMMIT), true);
  assert.equal(verifyReveal('not-the-committed-seed', SOLIDITY_COMMIT), false);
});

// ── resolver re-runs the engine on the golden vector ────────────────────────

test('resolver replays the golden vector to the engine + golden score', () => {
  const v = resolveClaim({ seed: SEED, inputLog: HONEST_LOG, claimedScore: EXPECTED });
  assert.equal(v.replayedScore, EXPECTED, 'matches golden expectedScore');
  assert.equal(v.replayedScore, engine2048.verify(SEED, HONEST_LOG).score, 'matches engine output');
  assert.equal(v.engineValid, true);
});

// ── honest claim resolves valid ─────────────────────────────────────────────

test('honest claim resolves valid (not fraud)', () => {
  const v = resolveClaim({ seed: SEED, inputLog: HONEST_LOG, claimedScore: EXPECTED });
  assert.equal(v.fraud, false);
});

// ── tampered score resolves invalid (fraud) ─────────────────────────────────

test('tampered score resolves as fraud', () => {
  const v = resolveClaim({ seed: SEED, inputLog: HONEST_LOG, claimedScore: 9999 });
  assert.equal(v.fraud, true, 'lying score is fraud');
  assert.equal(v.replayedScore, EXPECTED, 'replay still yields the honest score');
});

// ── tampered inputLog resolves invalid (fraud) ──────────────────────────────

test('tampered (malformed) inputLog resolves as fraud', () => {
  // duplicate seq → the engine rejects the envelope → score 0, valid false.
  const tampered: MoveRecord<Move2048>[] = [
    { seq: 0, move: 'left' },
    { seq: 0, move: 'down' },
  ];
  const v = resolveClaim({ seed: SEED, inputLog: tampered, claimedScore: EXPECTED });
  assert.equal(v.engineValid, false, 'malformed log is engine-invalid');
  assert.equal(v.replayedScore, 0);
  assert.equal(v.fraud, true);
});

// ── key-free Stage 3 bridge (no broadcast) ──────────────────────────────────

test('buildResolveArgs produces the on-chain resolve() args without broadcasting', () => {
  const v = resolveClaim({ seed: SEED, inputLog: HONEST_LOG, claimedScore: EXPECTED });
  const args = buildResolveArgs('0xc1a1m', SEED, v);
  assert.equal(args.claimId, '0xc1a1m');
  assert.equal(args.replaySeed, SEED);
  assert.equal(args.replayedScore, BigInt(EXPECTED));
});
