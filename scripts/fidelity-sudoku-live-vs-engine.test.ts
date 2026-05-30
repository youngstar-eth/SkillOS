// ───────────────────────────────────────────────────────────────────────────
// Δ6 live-vs-engine fidelity gate for SUDOKU (SPEC §5).
//
// This is the determinism crux for the whole sprint: sudoku's solution is built
// by randomised backtracking and its puzzle by a separate clue-removal stream.
// This gate asserts the engine's GENERATED solution + givens are byte-identical
// to the live game's (proving the RNG draw order is replicated), and that
// replaying placements yields an identical countCorrect + status + value grid
// across seeds (including a full solve). Reconstructed using ONLY live exports
// (createInitialState / setCellValue / countCorrect from apps/sudoku).
// ───────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replay as engineReplay,
  createInitialState as engineInit,
  countCorrect as engineCountCorrect,
  serializeValues,
  BOARD_SIZE,
  type MoveSudoku,
} from '../packages/engines/src/games/sudoku';
import {
  createInitialState as liveInit,
  setCellValue as liveSetCellValue,
  countCorrect as liveCountCorrect,
  type SudokuState as LiveState,
} from '../apps/sudoku/src/lib/sudoku/engine';

function liveReplay(seed: string, moves: MoveSudoku[]): LiveState {
  let st = liveInit(seed);
  for (const m of moves) {
    if (st.status !== 'playing') break;
    st = liveSetCellValue(st, m.row, m.col, m.value);
  }
  return st;
}

function solveMoves(seed: string): MoveSudoku[] {
  const st = engineInit(seed);
  const moves: MoveSudoku[] = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (!st.grid[r][c].isGiven) moves.push({ row: r, col: c, value: st.solution[r][c] });
  return moves;
}
const liveValues = (st: LiveState) => st.grid.map((row) => row.map((c) => c.value));

const SEEDS = ['delta6-sdk-solved', 'sdk-fid-alpha', 'sdk-fid-beta', '0xabcdef0123456789', 'tournament-sudoku-7'];

for (const seed of SEEDS) {
  test(`fidelity[sudoku]: generated puzzle + solution === live for seed=${seed}`, () => {
    const e = engineInit(seed);
    const l = liveInit(seed);
    // The determinism crux: backtracking solution + clue-removal must byte-match.
    assert.deepEqual(e.solution, l.solution, 'generated solution must match live (RNG draw order)');
    assert.deepEqual(serializeValues(e.grid), liveValues(l), 'givens/puzzle must match live');
  });
}

for (const seed of SEEDS) {
  test(`fidelity[sudoku]: full-solve replay === live for seed=${seed}`, () => {
    const moves = solveMoves(seed);
    const e = engineReplay(seed, moves);
    const l = liveReplay(seed, moves);
    assert.equal(engineCountCorrect(e), liveCountCorrect(l), 'countCorrect must match live');
    assert.equal(e.status, l.status, 'status must match live');
    assert.deepEqual(serializeValues(e.grid), liveValues(l), 'final value grid must match live');
    assert.equal(engineCountCorrect(e), 81, 'a full solve scores 81');
  });
}

test('fidelity[sudoku]: partial replay === live', () => {
  const seed = 'sdk-fid-partial';
  const moves = solveMoves(seed).slice(0, 15);
  const e = engineReplay(seed, moves);
  const l = liveReplay(seed, moves);
  assert.equal(engineCountCorrect(e), liveCountCorrect(l));
  assert.deepEqual(serializeValues(e.grid), liveValues(l));
});
