// ───────────────────────────────────────────────────────────────────────────
// Δ6 live-vs-engine fidelity gate for MINESWEEPER (SPEC §5).
//
// Reconstructs the bounded session using ONLY the live game's exports
// (createInitialState / reveal / toggleFlag from apps/minesweeper) and asserts
// the engine produces a byte-identical revealedCount + status + cell-state grid
// across a spread of seeds, including the win (full clear) and loss (mine hit)
// terminals. Drift on either side — mine-placement RNG draw order, flood-fill,
// scoring — fails CI.
// ───────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replay as engineReplay,
  serializeStates,
  createInitialState as engineInit,
  BOARD_ROWS,
  BOARD_COLS,
  type MoveMinesweeper,
} from '../packages/engines/src/games/minesweeper';
import {
  createInitialState as liveInit,
  reveal as liveReveal,
  toggleFlag as liveToggleFlag,
  type MinesweeperState as LiveState,
} from '../apps/minesweeper/src/lib/minesweeper/engine';

function liveReplay(seed: string, moves: MoveMinesweeper[]): LiveState {
  let st = liveInit(seed);
  for (const m of moves) {
    if (st.status !== 'playing') break;
    st = m.action === 'reveal' ? liveReveal(st, m.row, m.col) : liveToggleFlag(st, m.row, m.col);
  }
  return st;
}

// Build move lists from a seed's layout (engine + live layouts must agree —
// that agreement is itself part of what the test proves).
function cells(seed: string) {
  const st = engineInit(seed);
  const mines: Array<[number, number]> = [];
  const safe: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_ROWS; r++)
    for (let c = 0; c < BOARD_COLS; c++) (st.board[r][c].isMine ? mines : safe).push([r, c]);
  return { mines, safe };
}
const revealAll = (seed: string): MoveMinesweeper[] => cells(seed).safe.map(([row, col]) => ({ row, col, action: 'reveal' }));
const partial = (seed: string, n: number): MoveMinesweeper[] => cells(seed).safe.slice(0, n).map(([row, col]) => ({ row, col, action: 'reveal' }));
const loseFast = (seed: string): MoveMinesweeper[] => {
  const { mines, safe } = cells(seed);
  return [...safe.slice(0, 2).map(([row, col]) => ({ row, col, action: 'reveal' as const })), { row: mines[0][0], col: mines[0][1], action: 'reveal' }];
};

const CASES: Array<{ seed: string; moves: MoveMinesweeper[] }> = [
  { seed: 'delta6-ms-empty', moves: [] },
  { seed: 'delta6-ms-prod', moves: partial('delta6-ms-prod', 5) },
  { seed: 'delta6-ms-win', moves: revealAll('delta6-ms-win') },
  { seed: 'delta6-ms-loss', moves: loseFast('delta6-ms-loss') },
  { seed: 'ms-fid-alpha', moves: partial('ms-fid-alpha', 8) },
  { seed: 'ms-fid-beta', moves: revealAll('ms-fid-beta') },
  { seed: '0xc0ffee1234', moves: loseFast('0xc0ffee1234') },
];

for (const { seed, moves } of CASES) {
  test(`fidelity[minesweeper]: engine === live for seed=${seed} (${moves.length} moves)`, () => {
    const e = engineReplay(seed, moves);
    const l = liveReplay(seed, moves);
    assert.equal(e.revealedCount, l.revealedCount, 'revealedCount must match live');
    assert.equal(e.status, l.status, 'status must match live');
    assert.deepEqual(serializeStates(e.board), serializeStates(l.board), 'cell-state grid must match live');
  });
}
