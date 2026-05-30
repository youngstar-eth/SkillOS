// Golden-vector + registry harness for the Δ6 2048 engine.
//
// "Golden vectors ARE the spec of correctness" (SPEC §4). Each committed
// fixture is a (seed, moves) input with the engine's expected score / moves /
// final board baked in as a CONSTANT. The engine recomputes them here; any
// drift (a rule change that moves a score) fails the build. The fixtures were
// generated from @skillos/engines — a verbatim lift of the live game — and
// are independently cross-checked against `apps/2048` by
// `scripts/fidelity-2048-live-vs-engine.test.ts`.
//
// Also pins, per SPEC §4 + §2:
//   - the canonical `MoveRecord` envelope path === the raw `replay` path,
//   - the game-agnostic `registry`/`verifyMatch` entry point,
//   - explicit rejection of null / malformed input logs (no silent pass).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  engine2048,
  replay,
  serializeBoard,
  type Direction,
  type Move2048,
} from '../games/game2048';
import {
  GAME_IDS,
  getEngine,
  hasEngine,
  registeredGameIds,
  verifyMatch,
  type GameId,
  type MoveRecord,
} from '../index';

interface GoldenVector {
  name: string;
  note: string;
  seed: string;
  moves: Direction[];
  expectedScore: number;
  expectedMovesUsed: number;
  expectedFinalBoard: number[][];
  gameOver: boolean;
}
interface GoldenFile {
  game: string;
  maxMoves: number;
  vectors: GoldenVector[];
}

const golden = JSON.parse(
  readFileSync(new URL('./golden/2048.golden.json', import.meta.url), 'utf8'),
) as GoldenFile;

/** Build the canonical inputLog envelope from a raw direction array. */
function toLog(moves: Direction[]): MoveRecord<Move2048>[] {
  return moves.map((move, seq) => ({ seq, move }));
}

test('golden file is well-formed and covers the required edge cases', () => {
  assert.equal(golden.game, '2048');
  assert.ok(golden.vectors.length >= 5, 'expected at least 5 golden vectors');
  const names = new Set(golden.vectors.map((v) => v.name));
  for (const required of ['empty_log', 'single_move', 'early_loss', 'long_to_termination']) {
    assert.ok(names.has(required), `golden set must include the "${required}" edge case`);
  }
  // The long vector must terminate at or before the move cap; the early-loss
  // vector must deadlock strictly before it.
  const long = golden.vectors.find((v) => v.name === 'long_to_termination')!;
  assert.ok(long.expectedMovesUsed <= golden.maxMoves);
  const early = golden.vectors.find((v) => v.name === 'early_loss')!;
  assert.ok(early.gameOver && early.expectedMovesUsed < golden.maxMoves);
});

for (const vec of golden.vectors) {
  test(`golden[${vec.name}]: engine reproduces the baked score + board`, () => {
    const log = toLog(vec.moves);

    // 1. Direct engine adapter.
    const direct = engine2048.verify(vec.seed, log);
    assert.equal(direct.valid, true, `vector ${vec.name} must be valid`);
    assert.equal(direct.score, vec.expectedScore, `score drift in ${vec.name}`);

    // 2. Game-agnostic registry entry point — identical result.
    const viaRegistry = verifyMatch('2048', vec.seed, log);
    assert.deepEqual(viaRegistry, direct, `registry path diverged in ${vec.name}`);

    // 3. Raw replay path (the #175 contract) agrees on score + board + moves.
    const session = replay(vec.seed, vec.moves);
    assert.equal(session.score, vec.expectedScore);
    assert.equal(session.movesUsed, vec.expectedMovesUsed);
    assert.deepEqual(serializeBoard(session.board), vec.expectedFinalBoard);

    // 4. Determinism: a second verify is byte-identical.
    assert.deepEqual(engine2048.verify(vec.seed, log), direct);
  });
}

test('null / malformed input logs are rejected explicitly (SPEC §4 — no silent pass)', () => {
  // `moves=null` bypass must NOT reach the scoring path.
  assert.deepEqual(verifyMatch('2048', 's', null as unknown as MoveRecord[]), {
    score: 0,
    valid: false,
    reason: 'inputLog_not_array',
  });
  assert.equal(
    verifyMatch('2048', 's', 'not-an-array' as unknown as MoveRecord[]).reason,
    'inputLog_not_array',
  );
  assert.equal(
    verifyMatch('2048', 's', { 0: { seq: 0, move: 'left' } } as unknown as MoveRecord[]).reason,
    'inputLog_not_array',
  );
  // A null record inside an otherwise-valid array.
  assert.equal(
    verifyMatch('2048', 's', [null] as unknown as MoveRecord[]).reason,
    'record_not_object',
  );
  // Missing `move` field.
  assert.equal(
    verifyMatch('2048', 's', [{ seq: 0 }] as unknown as MoveRecord[]).reason,
    'missing_move',
  );
  // seq out of range (gap): n=2 but a seq of 5.
  assert.equal(
    verifyMatch('2048', 's', [
      { seq: 0, move: 'left' },
      { seq: 5, move: 'up' },
    ] as MoveRecord[]).reason,
    'seq_out_of_range',
  );
  // Negative seq.
  assert.equal(
    verifyMatch('2048', 's', [{ seq: -1, move: 'left' }] as MoveRecord[]).reason,
    'seq_out_of_range',
  );
  // Duplicate seq.
  assert.equal(
    verifyMatch('2048', 's', [
      { seq: 0, move: 'left' },
      { seq: 0, move: 'up' },
    ] as MoveRecord[]).reason,
    'seq_duplicate',
  );
  // Structurally valid envelope, illegal payload.
  assert.equal(
    verifyMatch('2048', 's', [{ seq: 0, move: 'diagonal' }] as unknown as MoveRecord[]).reason,
    'invalid_direction',
  );
  // Every rejection scores 0.
  for (const bad of [
    null as unknown as MoveRecord[],
    [{ seq: 0, move: 'diagonal' }] as unknown as MoveRecord[],
  ]) {
    assert.equal(verifyMatch('2048', 's', bad).score, 0);
  }
});

test('registry: 2048 is registered and game-agnostic lookups behave', () => {
  assert.ok(hasEngine('2048'));
  assert.equal(getEngine('2048')?.gameId, '2048');
  assert.ok(registeredGameIds().includes('2048'));
  // Canonical id tuple includes 2048 and all five Stage-2 games.
  assert.ok(GAME_IDS.includes('2048'));
  for (const g of ['wordle', 'sudoku', 'minesweeper', 'clicker', 'match3']) {
    assert.ok(GAME_IDS.includes(g as GameId), `${g} must be a canonical GameId`);
  }
  // An unregistered game id fails closed, not throws.
  const missing = verifyMatch('totally-fake' as unknown as GameId, 's', []);
  assert.deepEqual(missing, {
    score: 0,
    valid: false,
    reason: 'no_engine_for_totally-fake',
  });
});

test('empty log is valid and scores 0', () => {
  assert.deepEqual(verifyMatch('2048', 'any-seed', []), { score: 0, valid: true });
});
