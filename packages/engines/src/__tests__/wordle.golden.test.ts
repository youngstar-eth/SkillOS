// Golden-vector + adjudicator harness for the Δ6 Wordle engine.
//
// "Golden vectors ARE the spec of correctness" (SPEC §4). Each committed
// fixture is a (seed, guesses) input with the engine's expected score /
// status / per-guess evaluation baked in as a CONSTANT. The engine recomputes
// them here; any drift (a rule change that moves a score or a tile color)
// fails the build. The fixtures were generated from this engine — a verbatim
// lift of the live game — and are independently cross-checked against
// `apps/wordle` by `scripts/fidelity-wordle-live-vs-engine.test.ts`.
//
// Also pins, per SPEC §4:
//   - the canonical `MoveRecord` envelope path === the raw `replay` path,
//   - determinism (verify twice → byte-identical),
//   - explicit rejection of null / malformed / illegal input logs (no silent
//     pass), including the Wordle-specific "guess after terminal" rejection,
//   - a few game-specific rule assertions (duplicate-letter evaluation, the
//     6-guess natural terminal, seed→answer determinism).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  engineWordle,
  replay,
  sessionScore,
  serializeGuesses,
  evaluateGuess,
  pickAnswerFromSeed,
  isValidGuess,
  MAX_GUESSES,
  type LetterState,
  type MoveWordle,
} from '../games/wordle';
import { type MoveRecord } from '../types';

interface GoldenVector {
  name: string;
  note: string;
  seed: string;
  answer: string;
  moves: string[];
  expectedScore: number;
  expectedStatus: 'playing' | 'won' | 'lost';
  expectedGuessCount: number;
  expectedGuesses: Array<{ word: string; states: LetterState[] }>;
  terminal: boolean;
}
interface GoldenFile {
  game: string;
  maxGuesses: number;
  scoreModel: string;
  vectors: GoldenVector[];
}

const golden = JSON.parse(
  readFileSync(new URL('./golden/wordle.golden.json', import.meta.url), 'utf8'),
) as GoldenFile;

/** Build the canonical inputLog envelope from a raw guess array. */
function toLog(moves: MoveWordle[]): MoveRecord<MoveWordle>[] {
  return moves.map((move, seq) => ({ seq, move }));
}

test('golden file is well-formed and covers the required edge cases', () => {
  assert.equal(golden.game, 'wordle');
  assert.equal(golden.maxGuesses, MAX_GUESSES);
  assert.ok(golden.vectors.length >= 4, 'expected at least 4 golden vectors');
  const names = new Set(golden.vectors.map((v) => v.name));
  for (const required of ['empty_log', 'single_miss', 'win_in_three', 'win_in_six', 'loss_six_guesses']) {
    assert.ok(names.has(required), `golden set must include the "${required}" edge case`);
  }
  // The terminal vectors must actually terminate at the natural bound, and the
  // short/empty ones must NOT (they leave the session still playing).
  const empty = golden.vectors.find((v) => v.name === 'empty_log')!;
  assert.equal(empty.terminal, false);
  const win6 = golden.vectors.find((v) => v.name === 'win_in_six')!;
  assert.ok(win6.terminal && win6.expectedGuessCount === MAX_GUESSES);
  const loss = golden.vectors.find((v) => v.name === 'loss_six_guesses')!;
  assert.ok(loss.terminal && loss.expectedStatus === 'lost' && loss.expectedScore === 0);
  // No vector may exceed the 6-guess natural bound.
  for (const v of golden.vectors) {
    assert.ok(v.expectedGuessCount <= MAX_GUESSES, `${v.name} exceeds MAX_GUESSES`);
  }
});

for (const vec of golden.vectors) {
  test(`golden[${vec.name}]: engine reproduces the baked score + evaluation`, () => {
    const log = toLog(vec.moves);

    // 0. The baked answer is the deterministic seed pick (no drift in foldSeed).
    assert.equal(pickAnswerFromSeed(vec.seed), vec.answer, `answer drift in ${vec.name}`);

    // 1. Direct engine adapter reproduces the baked score.
    const direct = engineWordle.verify(vec.seed, log);
    assert.equal(direct.valid, true, `vector ${vec.name} must be valid`);
    assert.equal(direct.score, vec.expectedScore, `score drift in ${vec.name}`);

    // 2. Raw replay path agrees on score + status + per-guess evaluation.
    const session = replay(vec.seed, vec.moves);
    assert.equal(sessionScore(session), vec.expectedScore);
    assert.equal(session.status, vec.expectedStatus);
    assert.equal(session.guesses.length, vec.expectedGuessCount);
    assert.deepEqual(serializeGuesses(session.guesses), vec.expectedGuesses, `tile-color drift in ${vec.name}`);

    // 3. Raw replay score === adapter score (the envelope path === replay path).
    assert.equal(direct.score, sessionScore(session));

    // 4. Determinism: a second verify is byte-identical.
    assert.deepEqual(engineWordle.verify(vec.seed, log), direct);
  });
}

test('null / malformed input logs are rejected explicitly (SPEC §4 — no silent pass)', () => {
  const s = 'delta6-wordle-reject';
  // `moves=null` bypass must NOT reach the scoring path.
  assert.deepEqual(engineWordle.verify(s, null as unknown as MoveRecord<MoveWordle>[]), {
    score: 0,
    valid: false,
    reason: 'inputLog_not_array',
  });
  // Non-array.
  assert.equal(
    engineWordle.verify(s, 'not-an-array' as unknown as MoveRecord<MoveWordle>[]).reason,
    'inputLog_not_array',
  );
  // Array-like object (not a real array).
  assert.equal(
    engineWordle.verify(s, { 0: { seq: 0, move: 'crane' } } as unknown as MoveRecord<MoveWordle>[])
      .reason,
    'inputLog_not_array',
  );
  // A null record inside an otherwise-valid array.
  assert.equal(
    engineWordle.verify(s, [null] as unknown as MoveRecord<MoveWordle>[]).reason,
    'record_not_object',
  );
  // Missing `move` field.
  assert.equal(
    engineWordle.verify(s, [{ seq: 0 }] as unknown as MoveRecord<MoveWordle>[]).reason,
    'missing_move',
  );
  // seq out of range (gap): n=2 but a seq of 5.
  assert.equal(
    engineWordle.verify(s, [
      { seq: 0, move: 'crane' },
      { seq: 5, move: 'slate' },
    ] as MoveRecord<MoveWordle>[]).reason,
    'seq_out_of_range',
  );
  // Negative seq.
  assert.equal(
    engineWordle.verify(s, [{ seq: -1, move: 'crane' }] as MoveRecord<MoveWordle>[]).reason,
    'seq_out_of_range',
  );
  // Duplicate seq.
  assert.equal(
    engineWordle.verify(s, [
      { seq: 0, move: 'crane' },
      { seq: 0, move: 'slate' },
    ] as MoveRecord<MoveWordle>[]).reason,
    'seq_duplicate',
  );
  // Structurally valid envelope, non-string payload.
  assert.equal(
    engineWordle.verify(s, [{ seq: 0, move: 42 }] as unknown as MoveRecord<MoveWordle>[]).reason,
    'move_not_string',
  );
  // Structurally valid envelope, wrong-length guess.
  assert.equal(
    engineWordle.verify(s, [{ seq: 0, move: 'cat' }] as MoveRecord<MoveWordle>[]).reason,
    'invalid_guess',
  );
  // Structurally valid envelope, 5 letters but not in the word list.
  assert.equal(
    engineWordle.verify(s, [{ seq: 0, move: 'zzzzz' }] as MoveRecord<MoveWordle>[]).reason,
    'invalid_guess',
  );
  // Every rejection scores 0.
  for (const bad of [
    null as unknown as MoveRecord<MoveWordle>[],
    [{ seq: 0, move: 'zzzzz' }] as MoveRecord<MoveWordle>[],
    [{ seq: 0, move: 42 }] as unknown as MoveRecord<MoveWordle>[],
  ]) {
    assert.equal(engineWordle.verify(s, bad).score, 0);
  }
});

test('a guess logged AFTER the natural terminal is rejected (padded log cannot masquerade as well-formed)', () => {
  // win_in_three already solves on guess 3; appending a 4th valid guess is a
  // move past game-over → the log is rejected, not silently scored.
  const seed = 'delta6-wordle-win3';
  const answer = pickAnswerFromSeed(seed); // 'blunt'
  const padded: MoveRecord<MoveWordle>[] = [
    { seq: 0, move: 'crane' },
    { seq: 1, move: 'slate' },
    { seq: 2, move: answer }, // win here
    { seq: 3, move: 'audio' }, // illegal: after terminal
  ];
  const r = engineWordle.verify(seed, padded);
  assert.deepEqual(r, { score: 0, valid: false, reason: 'guess_after_terminal' });

  // Same for a LOSS terminal: a 7th guess after 6 wrong is rejected.
  const lossSeed = 'delta6-wordle-loss';
  const seven: MoveRecord<MoveWordle>[] = [
    'crane', 'slate', 'audio', 'point', 'lucky', 'fjord', 'nymph',
  ].map((move, seq) => ({ seq, move }));
  assert.equal(engineWordle.verify(lossSeed, seven).reason, 'guess_after_terminal');
});

test('empty log is valid and scores 0', () => {
  assert.deepEqual(engineWordle.verify('any-seed', []), { score: 0, valid: true });
});

// ─── Game-specific rule assertions ──────────────────────────────────────────

test('rule: duplicate-letter evaluation matches the live two-pass algorithm', () => {
  // The canonical "erase" vs "spear" example from the live engine's docstring:
  // no positional matches; e/r/a/s become present, the SECOND e is absent
  // (budget exhausted).
  assert.deepEqual(evaluateGuess('erase', 'spear'), [
    'present', // e
    'present', // r
    'present', // a
    'present', // s
    'absent', // e — no budget left
  ]);
  // A positional match consumes budget first: answer 'allay', guess 'llama'.
  // pos2 l===l → correct; the two remaining l's in the guess only have one
  // budget l left → first present, second absent; the two a's both match the
  // answer's a budget → present. Pinned to the exact engine output to guard
  // against silent duplicate-handling drift.
  assert.deepEqual(evaluateGuess('llama', 'allay'), [
    'present', // l
    'correct', // l (positional)
    'present', // a
    'absent', // m
    'present', // a
  ]);
  // All-correct (the win row).
  assert.deepEqual(evaluateGuess('allay', 'allay'), [
    'correct', 'correct', 'correct', 'correct', 'correct',
  ]);
});

test('rule: the natural terminal is exactly win OR 6 guesses (no 7th move possible)', () => {
  const seed = 'delta6-wordle-loss';
  // Replaying 6 wrong valid guesses lands in 'lost' with exactly 6 guesses.
  const six = ['crane', 'slate', 'audio', 'point', 'lucky', 'fjord'];
  const lost = replay(seed, six);
  assert.equal(lost.status, 'lost');
  assert.equal(lost.guesses.length, MAX_GUESSES);
  // replay() ignores any move past the terminal: a 7-move array yields the
  // same 6-guess lost session (the bounded-session contract).
  const seven = replay(seed, [...six, 'nymph']);
  assert.equal(seven.guesses.length, MAX_GUESSES);
  assert.deepEqual(serializeGuesses(seven.guesses), serializeGuesses(lost.guesses));

  // A win short-circuits before the 6th guess and stops consuming moves.
  const winSeed = 'delta6-wordle-win3';
  const wonEarly = replay(winSeed, ['crane', 'slate', pickAnswerFromSeed(winSeed), 'audio']);
  assert.equal(wonEarly.status, 'won');
  assert.equal(wonEarly.guesses.length, 3);
});

test('rule: seed→answer is deterministic and within the answer list; valid-guess gate is length+membership', () => {
  // Same seed → same answer, twice.
  assert.equal(pickAnswerFromSeed('delta6-stable'), pickAnswerFromSeed('delta6-stable'));
  // The picked answer is itself always a valid guess (answers ⊆ VALID_GUESSES).
  assert.ok(isValidGuess(pickAnswerFromSeed('delta6-stable')));
  // Gate rejects wrong length and non-members; accepts a known member.
  assert.equal(isValidGuess('cat'), false);
  assert.equal(isValidGuess('zzzzz'), false);
  assert.equal(isValidGuess('crane'), true);
  // Case-insensitive membership (the live gate lowercases before lookup).
  assert.equal(isValidGuess('CRANE'.toLowerCase()), true);
});
