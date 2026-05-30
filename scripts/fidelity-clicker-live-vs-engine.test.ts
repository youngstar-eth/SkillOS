// ───────────────────────────────────────────────────────────────────────────
// Δ6 live-vs-engine fidelity gate for CLICKER (SPEC §5).
//
// SCOPE NOTE (deliberate): clicker has NO seeded gameplay state — the seed
// drives only a cosmetic tap-button emoji, and score is the raw client-
// reported tap count (live V1 is trust-client by design). So a deep replay
// cross-check (like 2048/sudoku/minesweeper) is not possible; the only
// deterministic, seed-derived live logic is `numberFromSeed` + `pickEmojiFromSeed`.
// This gate therefore asserts (a) the engine's seed-fold + emoji pick are
// byte-identical to the live engine, and (b) the engine's count rule (score ===
// tap count) holds. If the live cosmetic-fold or the count rule ever drifts,
// CI fails.
//
// Run via tsx --test; wired into ci.yml#test-ts.
// ───────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  engineClicker,
  numberFromSeed as engineNumberFromSeed,
  pickEmojiFromSeed as enginePickEmoji,
  type MoveClicker,
} from '../packages/engines/src/games/clicker';
import {
  numberFromSeed as liveNumberFromSeed,
  pickEmojiFromSeed as livePickEmoji,
} from '../apps/clicker/src/lib/clicker/engine';
import type { MoveRecord } from '../packages/engines/src/types';

const SEEDS = [
  'clicker-fid-alpha',
  'clicker-fid-beta',
  '0xdeadbeefcafe',
  'delta6-clicker-prod',
  '0x0000000000000000000000000000000000000000000000000000000000000001',
  'tournament-seed-xyz',
];

for (const seed of SEEDS) {
  test(`fidelity[clicker]: seed-fold + emoji === live for seed=${seed}`, () => {
    assert.equal(engineNumberFromSeed(seed), liveNumberFromSeed(seed), 'numberFromSeed must match live');
    assert.equal(enginePickEmoji(seed), livePickEmoji(seed), 'pickEmojiFromSeed must match live');
  });
}

test('fidelity[clicker]: score === tap count (the live trust-client count rule)', () => {
  for (const n of [0, 1, 7, 42, 250, 1000]) {
    const log: MoveRecord<MoveClicker>[] = Array.from({ length: n }, (_, seq) => ({ seq, move: {} }));
    const r = engineClicker.verify('clicker-fid-count', log);
    assert.equal(r.valid, true);
    assert.equal(r.score, n, `engine score must equal the ${n} reported taps`);
  }
});
