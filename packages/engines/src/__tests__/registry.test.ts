// Adjudicator-registry integration test (Δ6 Stage 2 lock criterion):
// all six games registered, and the game-agnostic `verifyMatch(gameId, …)`
// routes to the correct engine. Importing the barrel triggers registration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_IDS,
  getEngine,
  hasEngine,
  registeredGameIds,
  verifyMatch,
  type GameId,
  type MoveRecord,
} from '../index';

const ALL: GameId[] = ['2048', 'wordle', 'sudoku', 'minesweeper', 'clicker', 'match3'];

test('all six canonical games are registered', () => {
  assert.deepEqual([...GAME_IDS].sort(), [...ALL].sort());
  const registered = registeredGameIds();
  for (const g of ALL) {
    assert.ok(hasEngine(g), `${g} must be registered`);
    assert.ok(registered.includes(g), `${g} must appear in registeredGameIds()`);
    assert.equal(getEngine(g)?.gameId, g, `getEngine(${g}) must return the ${g} engine`);
  }
  assert.equal(registered.length, 6);
});

test('verifyMatch routes to each engine (empty log is valid for every game)', () => {
  for (const g of ALL) {
    const r = verifyMatch(g, 'registry-smoke-seed', []);
    assert.equal(r.valid, true, `${g}: empty log must verify valid`);
    assert.ok(typeof r.score === 'number' && r.score >= 0, `${g}: score must be a non-negative number`);
  }
  // sudoku's empty-board baseline is its 41 givens — proves routing hit the
  // sudoku engine specifically, not a generic stub.
  assert.equal(verifyMatch('sudoku', 's', []).score, 41);
});

test('verifyMatch rejects a null log on every engine (no silent pass)', () => {
  for (const g of ALL) {
    const r = verifyMatch(g, 's', null as unknown as MoveRecord[]);
    assert.equal(r.valid, false, `${g}: null log must be rejected`);
    assert.equal(r.score, 0);
    assert.equal(r.reason, 'inputLog_not_array', `${g}: null log reason`);
  }
});

test('unregistered game id fails closed (no throw)', () => {
  const r = verifyMatch('not-a-real-game' as unknown as GameId, 's', []);
  assert.deepEqual(r, { score: 0, valid: false, reason: 'no_engine_for_not-a-real-game' });
});
