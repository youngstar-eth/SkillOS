// Golden + rejection harness for the clicker engine (Δ6 Stage 2).
//
// Clicker scores the raw tap count (seed is cosmetic-only). These vectors pin
// the count rule + the cosmetic seed-fold; the rejections pin the envelope +
// the optional-timestamp invariants. Registry-agnostic (uses the engine
// directly); cross-engine registry lookup is covered by registry.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  engineClicker,
  pickEmojiFromSeed,
  clampSubmitScore,
  replay,
  SESSION_MS,
  MAX_SUBMITTABLE_SCORE,
  type MoveClicker,
} from '../games/clicker';
import type { MoveRecord } from '../types';

interface Vec { name: string; seed: string; moves: MoveClicker[]; expectedScore: number; expectedEmoji: string }
interface GoldenFile { game: string; sessionMs: number; vectors: Vec[] }

const golden = JSON.parse(
  readFileSync(new URL('./golden/clicker.golden.json', import.meta.url), 'utf8'),
) as GoldenFile;

const toLog = (moves: MoveClicker[]): MoveRecord<MoveClicker>[] => moves.map((move, seq) => ({ seq, move }));

test('clicker golden file is well-formed', () => {
  assert.equal(golden.game, 'clicker');
  assert.equal(golden.sessionMs, SESSION_MS);
  assert.ok(golden.vectors.length >= 5);
  assert.ok(golden.vectors.some((v) => v.name === 'empty_log'));
  assert.ok(golden.vectors.some((v) => v.name === 'timestamped_window'));
});

for (const vec of golden.vectors) {
  test(`golden[clicker:${vec.name}]: score === tap count + cosmetic emoji`, () => {
    const log = toLog(vec.moves);
    const direct = engineClicker.verify(vec.seed, log);
    assert.deepEqual(direct, { score: vec.expectedScore, valid: true });
    assert.equal(direct.score, vec.moves.length, 'score must equal tap count');
    // Cosmetic seed-fold.
    assert.equal(pickEmojiFromSeed(vec.seed), vec.expectedEmoji);
    // Determinism.
    assert.deepEqual(engineClicker.verify(vec.seed, log), direct);
  });
}

test('clicker rejects null / malformed logs + bad timestamps (no silent pass)', () => {
  const v = (log: unknown) => engineClicker.verify('s', log as MoveRecord<MoveClicker>[]);
  assert.equal(v(null).reason, 'inputLog_not_array');
  assert.equal(v('x').reason, 'inputLog_not_array');
  assert.equal(v([null]).reason, 'record_not_object');
  assert.equal(v([{ seq: 0 }]).reason, 'missing_move');
  assert.equal(v([{ seq: 0, move: 'tap' }]).reason, 'tap_not_object');
  assert.equal(v([{ seq: 5, move: {} }]).reason, 'seq_out_of_range');
  assert.equal(v([{ seq: -1, move: {} }]).reason, 'seq_out_of_range');
  assert.equal(v([{ seq: 0, move: {} }, { seq: 0, move: {} }]).reason, 'seq_duplicate');
  // Timestamp out of the session window / not an integer.
  assert.equal(v([{ seq: 0, move: { t: -1 } }]).reason, 'tap_timestamp_invalid');
  assert.equal(v([{ seq: 0, move: { t: SESSION_MS + 1 } }]).reason, 'tap_timestamp_invalid');
  assert.equal(v([{ seq: 0, move: { t: 1.5 } }]).reason, 'tap_timestamp_invalid');
  // Non-monotonic timestamps.
  assert.equal(v([{ seq: 0, move: { t: 100 } }, { seq: 1, move: { t: 50 } }]).reason, 'taps_not_monotonic');
  // Every rejection scores 0.
  assert.equal(v(null).score, 0);
  assert.equal(v([{ seq: 0, move: 'tap' }]).score, 0);
});

test('clicker: empty log is valid (score 0)', () => {
  assert.deepEqual(engineClicker.verify('s', []), { score: 0, valid: true });
});

test('clicker: raw count is skill-pure; submit clamp is separate', () => {
  // 60000 taps → raw score 60000 (verify does NOT clamp).
  const log = toLog(Array.from({ length: 60_000 }, () => ({})));
  assert.equal(engineClicker.verify('s', log).score, 60_000);
  // The submit-layer clamp is exposed but distinct.
  assert.equal(clampSubmitScore(60_000), MAX_SUBMITTABLE_SCORE);
  assert.equal(clampSubmitScore(123), 123);
  // replay() agrees with verify on a valid log.
  assert.equal(replay([{}, {}, {}]).score, 3);
});
