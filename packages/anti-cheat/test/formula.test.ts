// X20.0b — Plausibility formula tests.
//
// Run from package dir:  npx tsx --test test/formula.test.ts
// Or from monorepo root: npx tsx --test packages/anti-cheat/test/formula.test.ts
//
// Coverage map (per sprint X20.0b prompt):
//   - 6 per-game baselines (happy + axis failures across games)
//   - 3 axis-failure tests (duration / score-per-move / move bounds)
//   - 1 determinism test (same input → same verdict bytewise)
// = 10 cases total.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { plausibility, COEFFICIENTS } from "../src/index";
import type { FormulaInput, GameId } from "../src/index";

describe("plausibility — 2048", () => {
  it("normal game is plausible", () => {
    const input: FormulaInput = {
      game: "2048",
      moves: 300,
      durationMs: 180_000,
      score: 8_000,
    };
    const v = plausibility(input);
    assert.equal(v.plausible, true);
    assert.equal(v.reason, "ok");
    assert.equal(v.confidence, 1.0);
    assert.deepEqual(v.thresholds, COEFFICIENTS["2048"]);
  });

  it("too-fast-per-move is implausible (duration axis)", () => {
    const v = plausibility({
      game: "2048",
      moves: 1_000,
      durationMs: 1_000,
      score: 5_000,
    });
    assert.equal(v.plausible, false);
    assert.match(v.reason, /duration\/move/);
  });

  it("impossibly high score-per-move is implausible (score axis)", () => {
    const v = plausibility({
      game: "2048",
      moves: 50,
      durationMs: 60_000,
      score: 1_000_000,
    });
    assert.equal(v.plausible, false);
    assert.match(v.reason, /score\/move/);
  });
});

describe("plausibility — wordle", () => {
  it("standard win is plausible", () => {
    const v = plausibility({
      game: "wordle",
      moves: 4,
      durationMs: 30_000,
      score: 250,
    });
    assert.equal(v.plausible, true);
  });
});

describe("plausibility — sudoku", () => {
  it("too many moves is implausible (upper bound)", () => {
    const v = plausibility({
      game: "sudoku",
      moves: 300,
      durationMs: 300_000,
      score: 5_000,
    });
    assert.equal(v.plausible, false);
    assert.match(v.reason, /moves 300 outside/);
  });
});

describe("plausibility — minesweeper", () => {
  it("too few moves is implausible (lower bound)", () => {
    const v = plausibility({
      game: "minesweeper",
      moves: 0,
      durationMs: 10_000,
      score: 0,
    });
    assert.equal(v.plausible, false);
    assert.match(v.reason, /moves 0 outside/);
  });
});

describe("plausibility — clicker", () => {
  it("legitimately high score is plausible (high-throughput game)", () => {
    // Clicker score/move ceiling is 10 — sustained click-spam still
    // produces score linear in moves, so a 10k-click run with 90k score
    // is well-inside thresholds.
    const v = plausibility({
      game: "clicker",
      moves: 10_000,
      durationMs: 400_000,
      score: 90_000,
    });
    assert.equal(v.plausible, true);
  });
});

describe("plausibility — match3", () => {
  it("normal game is plausible", () => {
    const v = plausibility({
      game: "match3",
      moves: 50,
      durationMs: 45_000,
      score: 4_000,
    });
    assert.equal(v.plausible, true);
  });
});

describe("plausibility — verdict shape", () => {
  it("verdict carries the matching coefficient block", () => {
    const v = plausibility({
      game: "sudoku",
      moves: 40,
      durationMs: 60_000,
      score: 2_000,
    });
    assert.equal(v.thresholds.min_duration_per_move_ms, 500);
    assert.equal(v.thresholds.max_score_per_move, 200);
    assert.equal(v.thresholds.min_moves, 20);
    assert.equal(v.thresholds.max_moves, 200);
  });
});

describe("plausibility — determinism", () => {
  it("same input returns bytewise-identical verdict across calls", () => {
    const games: GameId[] = [
      "2048",
      "wordle",
      "sudoku",
      "minesweeper",
      "clicker",
      "match3",
    ];
    for (const game of games) {
      const input: FormulaInput = {
        game,
        moves: 50,
        durationMs: 60_000,
        score: 1_500,
      };
      const a = plausibility(input);
      const b = plausibility(input);
      const c = plausibility(input);
      assert.deepStrictEqual(a, b);
      assert.deepStrictEqual(b, c);
    }
  });
});
