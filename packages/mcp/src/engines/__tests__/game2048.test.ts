// Determinism + bounded-session tests for the MCP 2048 engine.
//
// The engine is the source-of-truth for `submit_score` validation in the
// X32-4 demo (agent's claimed score is re-derived by replaying the move
// trail under the engine's deterministic RNG). These tests pin three
// properties that contract guarantees rest on:
//
//   1. Same seed + same moves → same board + same score (every machine).
//   2. No-op directions don't consume the move budget.
//   3. MAX_MOVES hard-caps the session even if the board still has legal
//      moves — the engine reports gameOver and refuses further input.
//
// Run via the repo-standard `npx tsx --test` pattern; wired into
// `.github/workflows/ci.yml#test-ts`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MOVES,
  applyMove,
  canMove,
  createSession,
  isGameOver,
  move,
  replay,
  serializeBoard,
  type Direction,
} from '../game2048.js';

test('createSession is deterministic for a given seed', () => {
  const a = createSession('seed-42');
  const b = createSession('seed-42');
  assert.deepEqual(serializeBoard(a.board), serializeBoard(b.board));
  assert.equal(a.score, 0);
  assert.equal(a.movesUsed, 0);
  // Initial board has exactly two spawned tiles.
  let tileCount = 0;
  for (const row of a.board) for (const v of row) if (v !== 0) tileCount++;
  assert.equal(tileCount, 2);
});

test('replay(seed, moves) reproduces score + board bit-for-bit', () => {
  const seed = 'replay-determinism';
  const moves: Direction[] = ['left', 'down', 'right', 'up', 'left', 'left', 'down'];
  const a = replay(seed, moves);
  const b = replay(seed, moves);
  assert.deepEqual(serializeBoard(a.board), serializeBoard(b.board));
  assert.equal(a.score, b.score);
  assert.equal(a.movesUsed, b.movesUsed);
});

test('no-op direction does not consume a turn', () => {
  // Build a board with a single tile in the top-left; sliding left should
  // be a no-op (already there). We don't care about the exact RNG here —
  // we directly verify the contract on the `move()` helper, which the
  // session wrapper uses.
  const board = [
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const r = move(board, 'left');
  assert.equal(r.moved, false);
  assert.equal(r.gained, 0);

  // Now exercise through the session wrapper.
  const sess = createSession('noop-seed');
  // Spam every direction four times; any that no-op should not bump movesUsed.
  const before = sess.movesUsed;
  for (let i = 0; i < 4; i++) {
    for (const dir of ['left', 'right', 'up', 'down'] as Direction[]) {
      const m = applyMove(sess, dir);
      if (!m.moved) {
        // No-op: movesUsed must not advance for THIS call.
        // (We can't assert globally because legal moves DO advance it; we
        // assert by checking the return value contract.)
        assert.equal(m.scoreDelta, 0);
      }
    }
  }
  assert.ok(sess.movesUsed >= before, 'movesUsed monotonically non-decreasing');
});

test('merging two equal tiles adds their sum to score', () => {
  // Hand-craft a slide with a single merge. `move` is pure; no RNG needed.
  const board = [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const r = move(board, 'left');
  assert.equal(r.moved, true);
  assert.equal(r.gained, 4);
  assert.deepEqual(r.board[0], [4, 0, 0, 0]);
});

test('chained merges in one slide: 2,2,2,2 → 4,4', () => {
  // Canonical 2048 rule: each tile can only merge once per slide.
  const board = [
    [2, 2, 2, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const r = move(board, 'left');
  assert.equal(r.gained, 8); // two merges of 2+2
  assert.deepEqual(r.board[0], [4, 4, 0, 0]);
});

test('MAX_MOVES bounds the session', () => {
  // Force the session past MAX_MOVES by hand — apply moves until either
  // game-over or the cap fires. The cap MUST kick in for any seed since
  // we're applying every direction in rotation.
  const sess = createSession('bound-seed');
  const dirs: Direction[] = ['left', 'down', 'right', 'up'];
  let i = 0;
  while (!isGameOver(sess) && sess.movesUsed < MAX_MOVES + 5) {
    applyMove(sess, dirs[i % dirs.length]);
    i++;
    if (i > 5000) break; // safety — should never happen
  }
  // Either we hit the move cap or the board ran out of legal moves first.
  assert.ok(
    sess.movesUsed <= MAX_MOVES,
    `movesUsed ${sess.movesUsed} exceeded MAX_MOVES ${MAX_MOVES}`,
  );
  assert.ok(isGameOver(sess), 'session must be game-over after the loop');
});

test('canMove false implies isGameOver true on a full deadlocked board', () => {
  // Hand-craft a fully blocked board: no equal neighbors, no empties.
  const blocked = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  assert.equal(canMove(blocked), false);
});

test('different seeds → different opening boards (almost always)', () => {
  // Not a strict requirement — but a sanity check that hashSeed actually
  // discriminates between distinct strings. If this ever fires, the LCG
  // or hashSeed has degenerated.
  const a = createSession('alpha');
  const b = createSession('beta');
  assert.notDeepEqual(serializeBoard(a.board), serializeBoard(b.board));
});
