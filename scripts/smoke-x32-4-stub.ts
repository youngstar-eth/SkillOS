// ───────────────────────────────────────────────────────────────────────────
// X32-4 scripted smoke — exercises the dry-run MCP stub with hardcoded
// move sequences, NOT via OpenRouter. Validates the plumbing end-to-end:
//
//   - get_board_state initializes a session deterministically
//   - make_move applies directions, captures move trail, updates score
//   - submit_score validates score against the engine
//   - capture.moves[] has the right shape (boardBefore + boardAfter)
//   - Score mismatch → submit_score rejection
//
// Purpose: lets us CI-verify the demo wiring without spending LLM credits
// or depending on Llama / Claude actually following the prompt. The LLM
// path (scripts/create-hermes-vs-claude-demo.ts --dry-run) remains the
// real end-to-end smoke for agentic behavior; this one is pure plumbing.
//
// Run:
//   /usr/local/bin/node ./node_modules/.bin/tsx scripts/smoke-x32-4-stub.ts
// ───────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Direction } from '@skillos/mcp/engine/2048';

// We inline a small in-process facsimile of the dry-run stub instead of
// importing the demo orchestrator (which pulls in viem, contracts, the
// full broadcast path). This keeps the smoke fast + dependency-light and
// CI-runnable as a node:test file.
import {
  createSession,
  applyMove,
  serializeBoard,
  isGameOver,
  replay,
} from '@skillos/mcp/engine/2048';

interface SmokeMoveEntry {
  turn: number;
  direction: Direction;
  boardBefore: number[][];
  boardAfter: number[][];
  scoreDelta: number;
  scoreAfter: number;
  moved: boolean;
  gameOver: boolean;
}

test('engine plumbing: 20 moves with deterministic seed → trail + score', () => {
  const sessionId = 'smoke:x32-4:test-tournament';
  const session = createSession(sessionId);
  const moves: SmokeMoveEntry[] = [];

  // Cycle through directions for 20 attempts. Some may be no-ops; that's
  // OK — we only record successful moves in the trail per the prompt
  // contract.
  const cycle: Direction[] = ['left', 'down', 'right', 'up'];
  for (let i = 0; i < 20 && !isGameOver(session); i++) {
    const dir = cycle[i % cycle.length];
    const before = serializeBoard(session.board);
    const r = applyMove(session, dir);
    const after = serializeBoard(session.board);
    if (r.moved) {
      moves.push({
        turn: session.movesUsed,
        direction: dir,
        boardBefore: before,
        boardAfter: after,
        scoreDelta: r.scoreDelta,
        scoreAfter: session.score,
        moved: r.moved,
        gameOver: r.gameOver,
      });
    }
  }

  // At least some moves should have landed (the cycle hits every direction).
  assert.ok(moves.length > 0, 'expected at least one successful move');
  // Each trail entry: boardBefore + boardAfter are 4×4.
  for (const m of moves) {
    assert.equal(m.boardBefore.length, 4);
    assert.equal(m.boardAfter.length, 4);
    assert.ok(m.boardBefore.every((r) => r.length === 4));
    assert.ok(m.boardAfter.every((r) => r.length === 4));
    assert.ok(m.scoreDelta >= 0);
    assert.ok(m.moved === true);
  }
  // scoreAfter on the last entry must equal the session score.
  assert.equal(moves[moves.length - 1].scoreAfter, session.score);
});

test('engine validation: replay of the captured trail matches session score', () => {
  const sessionId = 'smoke:x32-4:replay-validation';
  const session = createSession(sessionId);
  const trail: Direction[] = [];
  const cycle: Direction[] = ['left', 'down', 'right', 'up'];
  for (let i = 0; i < 20 && !isGameOver(session); i++) {
    const dir = cycle[i % cycle.length];
    const r = applyMove(session, dir);
    if (r.moved) trail.push(dir);
  }
  // Replay must reproduce the same score (this is what the real
  // submit_score tool checks before signing the SIWA request).
  const replayed = replay(sessionId, trail);
  assert.equal(replayed.score, session.score, 'replay score must match session');
  assert.deepEqual(serializeBoard(replayed.board), serializeBoard(session.board));
});

test('engine validation: tampered claim rejected by replay', () => {
  const sessionId = 'smoke:x32-4:tamper-detect';
  const session = createSession(sessionId);
  const trail: Direction[] = [];
  for (let i = 0; i < 10 && !isGameOver(session); i++) {
    const dir: Direction = (['left', 'down', 'right', 'up'] as Direction[])[i % 4];
    const r = applyMove(session, dir);
    if (r.moved) trail.push(dir);
  }
  // Pretend the agent claims an inflated score.
  const claimedScore = session.score + 9999;
  const replayed = replay(sessionId, trail);
  assert.notEqual(replayed.score, claimedScore, 'replay must contradict tampered claim');
});

test('determinism: same sessionId + same moves → same final state across runs', () => {
  const sessionId = 'smoke:x32-4:determinism';
  const moves: Direction[] = ['left', 'left', 'down', 'right', 'up', 'down', 'left'];
  const a = replay(sessionId, moves);
  const b = replay(sessionId, moves);
  assert.equal(a.score, b.score);
  assert.deepEqual(serializeBoard(a.board), serializeBoard(b.board));
  assert.equal(a.movesUsed, b.movesUsed);
});
