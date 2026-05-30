// ───────────────────────────────────────────────────────────────────────────
// Δ6 live-vs-engine fidelity gate (SPEC §5: "2048 scaffold is unproven →
// validate it against live 2048").
//
// `@skillos/engines`' 2048 engine is a verbatim lift of the LIVE game's pure
// rules in `apps/2048/src/lib/game2048.ts`. This test reconstructs the
// engine's bounded-session replay using ONLY the live game's exported
// primitives (createInitialBoard / move / spawnTile / canMove) and asserts it
// produces a byte-identical board + score + move count for a spread of
// (seed, moves) inputs.
//
// If EITHER side's rules drift — the engine OR the live game (RNG constants,
// spawn order, slide/merge, no-op handling) — the two diverge and CI fails.
// This is the cross-validation that golden vectors alone cannot give (golden
// vectors only pin the engine against its own past output).
//
// Run via `tsx --test`; wired into `.github/workflows/ci.yml#test-ts`.
// ───────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replay as engineReplay,
  serializeBoard,
  MAX_MOVES,
  type Direction,
} from '@skillos/engines';
import {
  createInitialBoard,
  move as liveMove,
  spawnTile as liveSpawn,
  canMove as liveCanMove,
} from '../apps/2048/src/lib/game2048';

/**
 * Re-derives a bounded 2048 session using ONLY the live game's primitives,
 * mirroring the engine's `replay`/`applyMove` semantics: no-op directions are
 * skipped (turn not consumed), and play stops at MAX_MOVES or board deadlock.
 */
function liveReplay(seed: string, moves: Direction[]): { board: number[][]; score: number; used: number } {
  // `createInitialBoard` spawns the two opening tiles and hands back the SAME
  // rng instance, already advanced past them — exactly what the engine's
  // `createSession` does, so subsequent spawns continue one shared stream.
  const { board: opening, rng } = createInitialBoard(seed);
  let board = opening;
  let score = 0;
  let used = 0;
  for (const dir of moves) {
    if (used >= MAX_MOVES || !liveCanMove(board)) break;
    const { board: slid, gained, moved } = liveMove(board, dir);
    if (!moved) continue;
    board = liveSpawn(slid, rng);
    score += gained;
    used += 1;
  }
  return { board: board.map((r) => r.slice()), score, used };
}

const CYCLE: Direction[] = ['left', 'down', 'right', 'up'];
const cycle = (n: number): Direction[] => Array.from({ length: n }, (_, i) => CYCLE[i % 4]);

const CASES: Array<{ seed: string; moves: Direction[] }> = [
  { seed: 'replay-determinism', moves: ['left', 'down', 'right', 'up', 'left', 'left', 'down'] },
  { seed: 'delta6-golden-productive', moves: cycle(24) },
  { seed: 'delta6-golden-long', moves: cycle(200) }, // hits MAX_MOVES cap
  { seed: 'delta6-earlyloss-0', moves: cycle(160) },
  { seed: 'fidelity-alpha', moves: cycle(64) },
  { seed: 'fidelity-beta', moves: ['up', 'up', 'left', 'down', 'right', 'right', 'down', 'left'] },
  { seed: '0xdeadbeefcafe', moves: cycle(100) },
];

for (const { seed, moves } of CASES) {
  test(`fidelity: engine === live 2048 for seed=${seed} (${moves.length} attempts)`, () => {
    const engine = engineReplay(seed, moves);
    const live = liveReplay(seed, moves);
    assert.equal(engine.score, live.score, 'score must match the live game');
    assert.equal(engine.movesUsed, live.used, 'moves-used must match the live game');
    assert.deepEqual(
      serializeBoard(engine.board),
      live.board,
      'final board must match the live game bit-for-bit',
    );
  });
}
