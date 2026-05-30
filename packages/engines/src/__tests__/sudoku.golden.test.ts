// Golden + rejection harness for the sudoku engine (Δ6 Stage 2).
// score = countCorrect (41..81, includes givens); terminal = solved.
// Registry-agnostic (direct engine); cross-engine lookup is in registry.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  engineSudoku,
  replay,
  countCorrect,
  serializeValues,
  createInitialState,
  setCellValue,
  MAX_MOVES,
  BOARD_SIZE,
  type MoveSudoku,
  type CellValue,
} from '../games/sudoku';
import type { MoveRecord } from '../types';

interface Vec {
  name: string; seed: string; moves: MoveSudoku[];
  expectedScore: number; expectedStatus: string; expectedValues: CellValue[][]; terminal: boolean;
}
interface GoldenFile { game: string; vectors: Vec[] }

const golden = JSON.parse(
  readFileSync(new URL('./golden/sudoku.golden.json', import.meta.url), 'utf8'),
) as GoldenFile;

const toLog = (moves: MoveSudoku[]): MoveRecord<MoveSudoku>[] => moves.map((move, seq) => ({ seq, move }));

test('sudoku golden file is well-formed (covers givens-baseline + solved)', () => {
  assert.equal(golden.game, 'sudoku');
  const empty = golden.vectors.find((v) => v.name === 'empty_log')!;
  assert.equal(empty.expectedScore, 41, 'empty board scores the 41 givens');
  const solved = golden.vectors.find((v) => v.name === 'solved_full')!;
  assert.equal(solved.expectedScore, 81);
  assert.equal(solved.expectedStatus, 'solved');
});

for (const vec of golden.vectors) {
  test(`golden[sudoku:${vec.name}]: reproduces score + status + grid`, () => {
    const log = toLog(vec.moves);
    const direct = engineSudoku.verify(vec.seed, log);
    assert.equal(direct.valid, true);
    assert.equal(direct.score, vec.expectedScore, `score drift in ${vec.name}`);
    const st = replay(vec.seed, vec.moves);
    assert.equal(countCorrect(st), vec.expectedScore);
    assert.equal(st.status, vec.expectedStatus);
    assert.deepEqual(serializeValues(st.grid), vec.expectedValues);
    assert.deepEqual(engineSudoku.verify(vec.seed, log), direct); // determinism
  });
}

test('sudoku rejects null / malformed logs + bad moves (no silent pass)', () => {
  const v = (log: unknown) => engineSudoku.verify('s', log as MoveRecord<MoveSudoku>[]);
  assert.equal(v(null).reason, 'inputLog_not_array');
  assert.equal(v('x').reason, 'inputLog_not_array');
  assert.equal(v([null]).reason, 'record_not_object');
  assert.equal(v([{ seq: 0 }]).reason, 'missing_move');
  assert.equal(v([{ seq: 7, move: { row: 0, col: 0, value: 5 } }]).reason, 'seq_out_of_range');
  assert.equal(
    v([{ seq: 0, move: { row: 0, col: 0, value: 5 } }, { seq: 0, move: { row: 1, col: 1, value: 3 } }]).reason,
    'seq_duplicate',
  );
  assert.equal(v([{ seq: 0, move: 5 }]).reason, 'move_not_object');
  assert.equal(v([{ seq: 0, move: { row: 99, col: 0, value: 5 } }]).reason, 'cell_out_of_bounds');
  assert.equal(v([{ seq: 0, move: { row: 0, col: 0, value: 0 } }]).reason, 'invalid_value');
  assert.equal(v([{ seq: 0, move: { row: 0, col: 0, value: 10 } }]).reason, 'invalid_value');
  assert.equal(v([{ seq: 0, move: { row: 0, col: 0, value: 'x' } }]).reason, 'invalid_value');
  const tooMany = Array.from({ length: MAX_MOVES + 1 }, (_, seq) => ({ seq, move: { row: 0, col: 0, value: null } }));
  assert.equal(v(tooMany).reason, 'too_many_moves');
  assert.equal(v(null).score, 0);
});

test('sudoku: empty log valid (score 41); null value (clear) is allowed', () => {
  assert.deepEqual(engineSudoku.verify('s', []), { score: 41, valid: true });
  // A clear (null) on an empty cell is structurally valid.
  const r = engineSudoku.verify('s', [{ seq: 0, move: { row: 0, col: 0, value: null } }]);
  assert.equal(r.valid, true);
});

test('sudoku: given-cell edits no-op (score-neutral, live-faithful)', () => {
  const seed = 'sdk-rule-given';
  const st = createInitialState(seed);
  let given: [number, number] | null = null;
  for (let r = 0; r < BOARD_SIZE && !given; r++)
    for (let c = 0; c < BOARD_SIZE && !given; c++) if (st.grid[r][c].isGiven) given = [r, c];
  assert.ok(given);
  const base = countCorrect(st);
  // Trying to overwrite a given cell with a wrong value is a no-op.
  const after = setCellValue(st, given![0], given![1], ((st.solution[given![0]][given![1]] % 9) + 1) as CellValue);
  assert.equal(countCorrect(after), base, 'given cell must be immutable');
});
