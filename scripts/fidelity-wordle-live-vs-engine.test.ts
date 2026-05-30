// ───────────────────────────────────────────────────────────────────────────
// Δ6 live-vs-engine fidelity gate for Wordle (SPEC §5: "validate the engine
// scaffold against the live game").
//
// `@skillos/engines`' Wordle engine is a verbatim lift of the LIVE game's pure
// rules in `apps/wordle/src/lib/wordle/engine.ts` (+ its word-list data). This
// test reconstructs the engine's bounded-session replay using ONLY the live
// game's exported primitives — `pickAnswerFromSeed`, `evaluateGuess`,
// `isValidGuess`, `calculateScore` — and asserts it produces a byte-identical
// answer + per-guess evaluation + win/loss outcome + score for a spread of
// (seed, guesses) inputs, INCLUDING the terminal (win-in-6 / loss-in-6) cases.
//
// SCORE NOTE (the speed-bonus exclusion): the live `calculateScore` adds a
// wall-clock-derived speed bonus that the canonical move-log envelope cannot
// carry and that the engine deliberately omits (see wordle.ts header). To
// compare the DETERMINISTIC half byte-for-byte we evaluate the live formula at
// durationMs = 60000, where speedBonus = floor((60000-60000)/100) = 0, leaving
// exactly the guess bonus — which is what the engine scores. If EITHER side's
// rules drift (the FNV-1a fold, the answer list/order, the two-pass evaluation,
// the valid-guess gate, the guess-bonus formula, or the 6-guess terminal) the
// two diverge and CI fails. This is the cross-validation golden vectors alone
// cannot give.
//
// Run via `tsx --test`; wired into `.github/workflows/ci.yml#test-ts`.
// ───────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replay as engineReplay,
  sessionScore as engineSessionScore,
  serializeGuesses as engineSerialize,
  pickAnswerFromSeed as enginePickAnswer,
  MAX_GUESSES as ENGINE_MAX_GUESSES,
  type MoveWordle,
} from '../packages/engines/src/games/wordle';
import {
  pickAnswerFromSeed as livePickAnswer,
  evaluateGuess as liveEvaluate,
  isValidGuess as liveIsValid,
  calculateScore as liveCalculateScore,
} from '../apps/wordle/src/lib/wordle/engine';
import { MAX_GUESSES as LIVE_MAX_GUESSES } from '../apps/wordle/src/lib/wordle/types';
import type { Guess } from '../apps/wordle/src/lib/wordle/types';

// Duration at which the live speed bonus is exactly 0 — isolates the
// deterministic guess-bonus component for a byte-for-byte comparison.
const ZERO_SPEED_DURATION_MS = 60_000;

/**
 * Re-derives a bounded Wordle session using ONLY the live game's primitives,
 * mirroring the engine's `replay`/`applyGuess` semantics: a guess is recorded
 * and evaluated while still playing; the game ends on a solve (win) or at
 * MAX_GUESSES (loss); moves past the terminal are ignored. Returns the same
 * shape the engine exposes via `serializeGuesses` + `sessionScore`.
 */
function liveReplay(
  seed: string,
  moves: MoveWordle[],
): {
  answer: string;
  guesses: Array<{ word: string; states: string[] }>;
  status: 'playing' | 'won' | 'lost';
  score: number;
} {
  const answer = livePickAnswer(seed);
  const guesses: Guess[] = [];
  let status: 'playing' | 'won' | 'lost' = 'playing';
  for (const word of moves) {
    if (status !== 'playing') break;
    // The live UI only accepts a guess that passes `isValidGuess`; mirror that
    // gate so an invalid filler would surface as a divergence rather than be
    // silently scored. (All fidelity cases below use valid guesses.)
    assert.ok(liveIsValid(word), `fidelity case used an invalid live guess: ${word}`);
    const states = liveEvaluate(word, answer);
    guesses.push({ word, states });
    if (word === answer) status = 'won';
    else if (guesses.length >= LIVE_MAX_GUESSES) status = 'lost';
  }
  const won = status === 'won';
  const score = liveCalculateScore(guesses, won, ZERO_SPEED_DURATION_MS);
  return {
    answer,
    guesses: guesses.map((g) => ({ word: g.word, states: g.states.slice() })),
    status,
    score,
  };
}

// ≥5 seeds × move sequences, including the terminal win-in-6 + loss-in-6 cases.
// All guesses are common 5-letter words present in the shared word list.
const A = (seed: string) => enginePickAnswer(seed); // answer for a seed (engine == live, asserted below)
const FILLERS = ['crane', 'slate', 'audio', 'point', 'lucky', 'fjord', 'nymph', 'vexed'];
const missesExcept = (answer: string, n: number): string[] =>
  FILLERS.filter((f) => f !== answer).slice(0, n);

const CASES: Array<{ label: string; seed: string; moves: MoveWordle[] }> = [
  { label: 'empty', seed: 'delta6-wordle-empty', moves: [] },
  {
    label: 'single-miss',
    seed: 'delta6-wordle-single',
    moves: missesExcept(A('delta6-wordle-single'), 1),
  },
  {
    label: 'win-in-three',
    seed: 'delta6-wordle-win3',
    moves: [...missesExcept(A('delta6-wordle-win3'), 2), A('delta6-wordle-win3')],
  },
  {
    label: 'win-in-six (terminal)',
    seed: 'delta6-wordle-win6',
    moves: [...missesExcept(A('delta6-wordle-win6'), 5), A('delta6-wordle-win6')],
  },
  {
    label: 'loss-in-six (terminal)',
    seed: 'delta6-wordle-loss',
    moves: missesExcept(A('delta6-wordle-loss'), 6),
  },
  {
    label: 'win-in-one',
    seed: 'fidelity-wordle-alpha',
    moves: [A('fidelity-wordle-alpha')],
  },
  {
    label: 'past-terminal moves ignored identically',
    seed: 'fidelity-wordle-beta',
    // win on guess 2, then two extra valid guesses both sides must ignore.
    moves: [
      missesExcept(A('fidelity-wordle-beta'), 1)[0],
      A('fidelity-wordle-beta'),
      'audio',
      'point',
    ],
  },
  { label: 'hex-seed', seed: '0xdeadbeefcafef00dba5e', moves: missesExcept(A('0xdeadbeefcafef00dba5e'), 3) },
];

test('fidelity: engine and live agree on MAX_GUESSES + seed→answer', () => {
  assert.equal(ENGINE_MAX_GUESSES, LIVE_MAX_GUESSES, 'MAX_GUESSES must match');
  for (const { seed } of CASES) {
    assert.equal(
      enginePickAnswer(seed),
      livePickAnswer(seed),
      `seed→answer drift for ${seed}`,
    );
  }
});

for (const { label, seed, moves } of CASES) {
  test(`fidelity: engine === live wordle for ${label} (seed=${seed}, ${moves.length} guesses)`, () => {
    const engineSession = engineReplay(seed, moves);
    const live = liveReplay(seed, moves);

    // Answer pick.
    assert.equal(engineSession.answer, live.answer, 'answer must match the live game');
    // Win/loss outcome.
    assert.equal(engineSession.status, live.status, 'status must match the live game');
    // Per-guess evaluation (tile colors), byte-for-byte.
    assert.deepEqual(
      engineSerialize(engineSession.guesses),
      live.guesses,
      'per-guess evaluation must match the live game bit-for-bit',
    );
    // Deterministic (guess-bonus) score.
    assert.equal(
      engineSessionScore(engineSession),
      live.score,
      'guess-bonus score must match the live calculateScore at zero speed bonus',
    );
  });
}
