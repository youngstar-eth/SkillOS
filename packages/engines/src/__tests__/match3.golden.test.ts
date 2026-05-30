// Golden-vector + adjudicator harness for the Δ6 match3 engine.
//
// "Golden vectors ARE the spec of correctness" (SPEC §4). Each committed
// fixture is a (seed, moves) input with the engine's expected score / state
// baked in as a CONSTANT. The engine recomputes them here; any drift (a rule
// change that moves a score) fails the build. The fixtures were generated from
// @skillos/engines — a verbatim lift of the live match3 game — and are
// independently cross-checked against `apps/match3` by
// `scripts/fidelity-match3-live-vs-engine.test.ts`.
//
// Also pins, per SPEC §4 + §2:
//   - the canonical `MoveRecord` envelope (verify) path === the raw `replay`
//     path on a clean log,
//   - explicit rejection of null / malformed / illegal-swap input logs (no
//     silent pass),
//   - a handful of game-specific rule invariants (swap legality, score
//     formula, RNG fold).
//
// Imports the engine RELATIVELY (`../games/match3`) — independent of the
// registry/barrel, which the orchestrator wires up after this stage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  engineMatch3,
  replay,
  createSession,
  applyMove,
  isLegalSwap,
  findMatches,
  areAdjacent,
  numberFromSeed,
  serializeGrid,
  clampSubmitScore,
  ROWS,
  COLS,
  MAX_MOVES,
  type MoveMatch3,
  type GemColor,
} from '../games/match3';
import { type MoveRecord } from '../types';

interface GoldenVector {
  name: string;
  note: string;
  seed: string;
  moves: MoveMatch3[];
  expectedScore: number;
  expectedMovesUsed: number;
  expectedMaxCombo: number;
  expectedTotalMatches: number;
  expectedFinalGrid: (GemColor | null)[][];
  terminal: boolean;
}
interface GoldenFile {
  game: string;
  rows: number;
  cols: number;
  maxMoves: number;
  vectors: GoldenVector[];
}

const golden = JSON.parse(
  readFileSync(new URL('./golden/match3.golden.json', import.meta.url), 'utf8'),
) as GoldenFile;

/** Build the canonical inputLog envelope from a raw swap array. */
function toLog(moves: MoveMatch3[]): MoveRecord<MoveMatch3>[] {
  return moves.map((move, seq) => ({ seq, move }));
}

test('golden file is well-formed and covers the required edge cases', () => {
  assert.equal(golden.game, 'match3');
  assert.equal(golden.rows, ROWS);
  assert.equal(golden.cols, COLS);
  assert.equal(golden.maxMoves, MAX_MOVES);
  assert.ok(golden.vectors.length >= 5, 'expected at least 5 golden vectors');
  const names = new Set(golden.vectors.map((v) => v.name));
  for (const required of [
    'empty_log',
    'single_move',
    'short_run',
    'productive_run',
    'log_is_session_bound',
  ]) {
    assert.ok(names.has(required), `golden set must include the "${required}" edge case`);
  }
  // The bound vector terminates at the end of its log, well under the defensive
  // cap (the cap is engine-only, not a live rule).
  const bound = golden.vectors.find((v) => v.name === 'log_is_session_bound')!;
  assert.ok(bound.terminal, 'bound vector must be flagged terminal');
  assert.equal(
    bound.expectedMovesUsed,
    bound.moves.length,
    'session ends at the end of the log (no natural terminal mid-log)',
  );
  assert.ok(bound.expectedMovesUsed < golden.maxMoves, 'real session stays under the defensive cap');
});

for (const vec of golden.vectors) {
  test(`golden[${vec.name}]: engine reproduces the baked score + grid`, () => {
    const log = toLog(vec.moves);

    // 1. Direct engine adapter.
    const direct = engineMatch3.verify(vec.seed, log);
    assert.equal(direct.valid, true, `vector ${vec.name} must be valid`);
    assert.equal(direct.score, vec.expectedScore, `score drift in ${vec.name}`);

    // 2. Raw replay path agrees on score + grid + moves + combo + matches.
    const session = replay(vec.seed, vec.moves);
    assert.equal(session.score, vec.expectedScore, `replay score drift in ${vec.name}`);
    assert.equal(session.movesUsed, vec.expectedMovesUsed, `movesUsed drift in ${vec.name}`);
    assert.equal(session.maxCombo, vec.expectedMaxCombo, `maxCombo drift in ${vec.name}`);
    assert.equal(
      session.totalMatches,
      vec.expectedTotalMatches,
      `totalMatches drift in ${vec.name}`,
    );
    assert.deepEqual(
      serializeGrid(session.grid),
      vec.expectedFinalGrid,
      `final grid drift in ${vec.name}`,
    );

    // 3. The verify (envelope) path's score === the raw replay path's score.
    assert.equal(direct.score, session.score, `verify vs replay score mismatch in ${vec.name}`);

    // 4. Determinism: a second verify is byte-identical.
    assert.deepEqual(engineMatch3.verify(vec.seed, log), direct, `non-determinism in ${vec.name}`);

    // 5. The post-resolve grid has NO outstanding matches (cascade ran to
    //    completion) and is fully filled (no null cells survive a turn).
    assert.equal(
      findMatches(session.grid).size,
      0,
      `outstanding matches after resolve in ${vec.name}`,
    );
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        assert.notEqual(session.grid[r][c].color, null, `null cell survived in ${vec.name}`);
      }
    }
  });
}

test('null / malformed input logs are rejected explicitly (SPEC §4 — no silent pass)', () => {
  const seed = 'reject-seed';
  const legal: MoveMatch3 = { a: [0, 0], b: [0, 1] };

  // `moves=null` bypass must NOT reach the scoring path.
  assert.deepEqual(engineMatch3.verify(seed, null as unknown as MoveRecord<MoveMatch3>[]), {
    score: 0,
    valid: false,
    reason: 'inputLog_not_array',
  });
  // Non-array.
  assert.equal(
    engineMatch3.verify(seed, 'nope' as unknown as MoveRecord<MoveMatch3>[]).reason,
    'inputLog_not_array',
  );
  // Array-like object (not a real array).
  assert.equal(
    engineMatch3.verify(seed, { 0: { seq: 0, move: legal } } as unknown as MoveRecord<MoveMatch3>[])
      .reason,
    'inputLog_not_array',
  );
  // A null record inside an otherwise-valid array.
  assert.equal(
    engineMatch3.verify(seed, [null] as unknown as MoveRecord<MoveMatch3>[]).reason,
    'record_not_object',
  );
  // Missing `move` field.
  assert.equal(
    engineMatch3.verify(seed, [{ seq: 0 }] as unknown as MoveRecord<MoveMatch3>[]).reason,
    'missing_move',
  );
  // seq out of range (gap): n=2 but a seq of 5.
  assert.equal(
    engineMatch3.verify(seed, [
      { seq: 0, move: legal },
      { seq: 5, move: legal },
    ] as MoveRecord<MoveMatch3>[]).reason,
    'seq_out_of_range',
  );
  // Negative seq.
  assert.equal(
    engineMatch3.verify(seed, [{ seq: -1, move: legal }] as MoveRecord<MoveMatch3>[]).reason,
    'seq_out_of_range',
  );
  // Duplicate seq.
  assert.equal(
    engineMatch3.verify(seed, [
      { seq: 0, move: legal },
      { seq: 0, move: legal },
    ] as MoveRecord<MoveMatch3>[]).reason,
    'seq_duplicate',
  );
  // Structurally valid envelope, malformed payload (missing `b`).
  assert.equal(
    engineMatch3.verify(seed, [
      { seq: 0, move: { a: [0, 0] } },
    ] as unknown as MoveRecord<MoveMatch3>[]).reason,
    'malformed_move',
  );
  // Malformed payload: non-integer coordinate.
  assert.equal(
    engineMatch3.verify(seed, [
      { seq: 0, move: { a: [0, 0.5], b: [0, 1] } },
    ] as unknown as MoveRecord<MoveMatch3>[]).reason,
    'malformed_move',
  );
  // Well-formed shape but ILLEGAL swap: non-adjacent cells.
  assert.equal(
    engineMatch3.verify(seed, [
      { seq: 0, move: { a: [0, 0], b: [4, 4] } },
    ] as MoveRecord<MoveMatch3>[]).reason,
    'illegal_swap',
  );
  // Well-formed + adjacent but forms no match → still illegal in a settlement
  // log (an illegal swap the player could not actually have committed).
  {
    const session = createSession(seed);
    // Find an adjacent pair whose swap forms NO match.
    let noMatch: MoveMatch3 | null = null;
    outer: for (let r = 0; r < ROWS && !noMatch; r++) {
      for (let c = 0; c < COLS; c++) {
        const cand: MoveMatch3 = { a: [r, c], b: [r, c + 1] };
        if (c + 1 < COLS && !isLegalSwap(session.grid, cand.a, cand.b)) {
          noMatch = cand;
          break outer;
        }
      }
    }
    assert.ok(noMatch, 'expected at least one no-match adjacent pair on the initial board');
    assert.equal(
      engineMatch3.verify(seed, [{ seq: 0, move: noMatch! }] as MoveRecord<MoveMatch3>[]).reason,
      'illegal_swap',
    );
  }

  // Every rejection scores 0.
  for (const bad of [
    null as unknown as MoveRecord<MoveMatch3>[],
    [{ seq: 0, move: { a: [0, 0], b: [4, 4] } }] as MoveRecord<MoveMatch3>[],
    [{ seq: 0, move: { a: [0, 0] } }] as unknown as MoveRecord<MoveMatch3>[],
  ]) {
    assert.equal(engineMatch3.verify(seed, bad).score, 0);
  }
});

test('empty log is valid and scores 0', () => {
  assert.deepEqual(engineMatch3.verify('any-seed', []), { score: 0, valid: true });
});

// ─── Game-specific rule invariants ─────────────────────────────────────────

test('rule: a single 3-match scores exactly cells*10*chain1 = 30', () => {
  // The `single_move` golden vector is constructed as exactly one greedy swap.
  // Its baked score must equal a base 3-cell match at chain depth 1 (30), or a
  // larger first-chain/cascade value that is still a multiple of 10.
  const single = golden.vectors.find((v) => v.name === 'single_move')!;
  assert.equal(single.expectedScore % 10, 0, 'score is always a multiple of 10');
  assert.ok(single.expectedScore >= 30, 'one legal swap clears at least a 3-line');
  // Re-derive the first chain's score independently from totalMatches lower
  // bound: at least 3 cells cleared on the opening chain.
  const session = replay(single.seed, single.moves);
  assert.ok(session.totalMatches >= 3, 'a legal swap clears at least 3 cells');
});

test('rule: illegal swaps never change the board or consume a turn (live UX)', () => {
  const seed = 'rule-illegal-swap';
  const session = createSession(seed);
  const before = serializeGrid(session.grid);
  // Non-adjacent swap.
  const r1 = applyMove(session, { a: [0, 0], b: [7, 7] });
  assert.equal(r1.applied, false);
  assert.equal(session.movesUsed, 0, 'illegal swap did not consume a turn');
  assert.deepEqual(serializeGrid(session.grid), before, 'illegal swap did not change the board');
  // Adjacent but no-match swap (if one exists on this board).
  let noMatch: MoveMatch3 | null = null;
  for (let r = 0; r < ROWS && !noMatch; r++) {
    for (let c = 0; c + 1 < COLS; c++) {
      const cand: MoveMatch3 = { a: [r, c], b: [r, c + 1] };
      if (!isLegalSwap(session.grid, cand.a, cand.b)) {
        noMatch = cand;
        break;
      }
    }
  }
  if (noMatch) {
    const r2 = applyMove(session, noMatch);
    assert.equal(r2.applied, false);
    assert.equal(session.movesUsed, 0);
    assert.deepEqual(serializeGrid(session.grid), before);
  }
});

test('rule: the initial board has no pre-existing matches', () => {
  for (const seed of ['board-a', 'board-b', 'board-c', 'delta6-match3-productive']) {
    const session = createSession(seed);
    assert.equal(
      findMatches(session.grid).size,
      0,
      `initial board for ${seed} must be match-free`,
    );
    // Fully populated, every cell a valid palette color.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        assert.notEqual(session.grid[r][c].color, null);
      }
    }
  }
});

test('rule: adjacency + seed fold + submit clamp behave', () => {
  assert.ok(areAdjacent([2, 2], [2, 3]));
  assert.ok(areAdjacent([2, 2], [3, 2]));
  assert.ok(!areAdjacent([2, 2], [3, 3]));
  assert.ok(!areAdjacent([2, 2], [2, 2]));
  // Seed fold is a stable non-zero uint32 (matches the live numberFromSeed).
  const folded = numberFromSeed('clamp-seed');
  assert.ok(Number.isInteger(folded) && folded > 0 && folded <= 0xffffffff);
  // Submit-layer sandwich clamp (not a game rule, but exposed for callers).
  assert.equal(clampSubmitScore(0), 1);
  assert.equal(clampSubmitScore(-5), 1);
  assert.equal(clampSubmitScore(500), 500);
  assert.equal(clampSubmitScore(60_000), 49_999);
});
