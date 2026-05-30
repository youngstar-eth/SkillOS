// Golden + rejection harness for the minesweeper engine (Δ6 Stage 2).
// score = revealedCount (0..71); terminal = win (71) / loss (mine hit).
// Registry-agnostic (direct engine); cross-engine lookup is in registry.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  engineMinesweeper,
  replay,
  serializeStates,
  createInitialState,
  reveal,
  MAX_MOVES,
  BOARD_ROWS,
  BOARD_COLS,
  type MoveMinesweeper,
  type CellState,
} from '../games/minesweeper';
import type { MoveRecord } from '../types';

interface Vec {
  name: string; seed: string; moves: MoveMinesweeper[];
  expectedScore: number; expectedStatus: string; expectedStates: CellState[][]; terminal: boolean;
}
interface GoldenFile { game: string; vectors: Vec[] }

const golden = JSON.parse(
  readFileSync(new URL('./golden/minesweeper.golden.json', import.meta.url), 'utf8'),
) as GoldenFile;

const toLog = (moves: MoveMinesweeper[]): MoveRecord<MoveMinesweeper>[] => moves.map((move, seq) => ({ seq, move }));

test('minesweeper golden file is well-formed (covers win + loss + empty)', () => {
  assert.equal(golden.game, 'minesweeper');
  const names = new Set(golden.vectors.map((v) => v.name));
  for (const req of ['empty_log', 'loss_mine_hit', 'win_full_clear']) assert.ok(names.has(req), req);
  assert.equal(golden.vectors.find((v) => v.name === 'win_full_clear')!.expectedScore, 71);
  assert.equal(golden.vectors.find((v) => v.name === 'loss_mine_hit')!.expectedStatus, 'lost');
});

for (const vec of golden.vectors) {
  test(`golden[minesweeper:${vec.name}]: reproduces score + status + board`, () => {
    const log = toLog(vec.moves);
    const direct = engineMinesweeper.verify(vec.seed, log);
    assert.equal(direct.valid, true);
    assert.equal(direct.score, vec.expectedScore, `score drift in ${vec.name}`);
    // Raw replay agrees on count + status + cell states.
    const st = replay(vec.seed, vec.moves);
    assert.equal(st.revealedCount, vec.expectedScore);
    assert.equal(st.status, vec.expectedStatus);
    assert.deepEqual(serializeStates(st.board), vec.expectedStates);
    // Determinism.
    assert.deepEqual(engineMinesweeper.verify(vec.seed, log), direct);
  });
}

test('minesweeper rejects null / malformed logs + bad moves (no silent pass)', () => {
  const v = (log: unknown) => engineMinesweeper.verify('s', log as MoveRecord<MoveMinesweeper>[]);
  assert.equal(v(null).reason, 'inputLog_not_array');
  assert.equal(v('x').reason, 'inputLog_not_array');
  assert.equal(v([null]).reason, 'record_not_object');
  assert.equal(v([{ seq: 0 }]).reason, 'missing_move');
  assert.equal(v([{ seq: 9, move: { row: 0, col: 0, action: 'reveal' } }]).reason, 'seq_out_of_range');
  assert.equal(
    v([{ seq: 0, move: { row: 0, col: 0, action: 'reveal' } }, { seq: 0, move: { row: 1, col: 1, action: 'flag' } }]).reason,
    'seq_duplicate',
  );
  assert.equal(v([{ seq: 0, move: 'reveal' }]).reason, 'move_not_object');
  assert.equal(v([{ seq: 0, move: { row: 0, col: 0, action: 'nuke' } }]).reason, 'invalid_action');
  assert.equal(v([{ seq: 0, move: { row: 99, col: 0, action: 'reveal' } }]).reason, 'cell_out_of_bounds');
  assert.equal(v([{ seq: 0, move: { row: 0, col: 1.5, action: 'reveal' } }]).reason, 'cell_out_of_bounds');
  // Defensive over-long-log cap.
  const tooMany = Array.from({ length: MAX_MOVES + 1 }, (_, seq) => ({ seq, move: { row: 0, col: 0, action: 'flag' as const } }));
  assert.equal(v(tooMany).reason, 'too_many_moves');
  assert.equal(v(null).score, 0);
});

test('minesweeper: empty log valid (score 0, playing); flags are score-neutral', () => {
  assert.deepEqual(engineMinesweeper.verify('s', []), { score: 0, valid: true });
  // Flagging only does not change the score.
  const flagsOnly = toLog([
    { row: 0, col: 0, action: 'flag' },
    { row: 1, col: 1, action: 'flag' },
  ]);
  assert.equal(engineMinesweeper.verify('s-flags', flagsOnly).score, 0);
});

test('minesweeper: revealing a mine loses immediately (rule check)', () => {
  // Find a mine for a seed and reveal it first → status lost, score 0.
  const seed = 'ms-rule-mine';
  const st0 = createInitialState(seed);
  let mine: [number, number] | null = null;
  for (let r = 0; r < BOARD_ROWS && !mine; r++)
    for (let c = 0; c < BOARD_COLS && !mine; c++) if (st0.board[r][c].isMine) mine = [r, c];
  assert.ok(mine);
  const after = reveal(st0, mine![0], mine![1]);
  assert.equal(after.status, 'lost');
  assert.equal(after.revealedCount, 0);
});
