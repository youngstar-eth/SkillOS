/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateScore,
  evaluateGuess,
  isValidGuess,
  maxLetterHint,
  pickAnswer,
  updateKeyboardStates,
} from "./engine";
import type { Guess } from "./types";

// Small helper to build a Guess literal.
const gs = (word: string, states: Guess["states"]): Guess => ({ word, states });

describe("evaluateGuess", () => {
  it("all correct (win case)", () => {
    assert.deepEqual(
      evaluateGuess("world", "world"),
      ["correct", "correct", "correct", "correct", "correct"],
    );
  });

  it("all absent", () => {
    assert.deepEqual(
      evaluateGuess("zzzzz", "world"),
      ["absent", "absent", "absent", "absent", "absent"],
    );
  });

  it("mix of correct + present (wordl vs world)", () => {
    // d and l swap → both present, rest correct
    assert.deepEqual(
      evaluateGuess("wordl", "world"),
      ["correct", "correct", "correct", "present", "present"],
    );
  });

  it("duplicate letter in guess, single in answer → first present, rest absent", () => {
    // answer "ultra" has exactly one 'a' at pos 4, guess "aahed"
    //   pass 1: no positional matches; remaining[a]=1
    //   pass 2: a(0)→present (a→0), a(1)→absent (budget 0)
    assert.deepEqual(
      evaluateGuess("aahed", "ultra"),
      ["present", "absent", "absent", "absent", "absent"],
    );
  });

  it("duplicate in guess, one positional match → first absent (budget consumed by match)", () => {
    // answer "panic": p,a,n,i,c. guess "aahed"
    //   pass 1: g[1]=a vs a[1]=a → correct; NO remaining[a] tracked (only
    //     non-matching answer positions seed remaining). Remaining has no 'a'.
    //   pass 2: a(0) budget=0 → absent; a(1) skip (correct); rest absent.
    assert.deepEqual(
      evaluateGuess("aahed", "panic"),
      ["absent", "correct", "absent", "absent", "absent"],
    );
  });

  it("duplicate: one correct + one absent (ssssp vs spell)", () => {
    // answer s,p,e,l,l. guess s,s,s,s,p
    //   i=0 s matches → correct; remaining = {p:1,e:1,l:2}
    //   pass 2: s(1..3) no 's' budget → absent; p(4) budget[p]=1 → present
    assert.deepEqual(
      evaluateGuess("ssssp", "spell"),
      ["correct", "absent", "absent", "absent", "present"],
    );
  });

  it("duplicates on both sides (erase vs spear → four present, last absent)", () => {
    // Classic case — no positional matches, all unique letters present once.
    assert.deepEqual(
      evaluateGuess("erase", "spear"),
      ["present", "present", "present", "present", "absent"],
    );
  });
});

describe("isValidGuess", () => {
  it("wrong length → false", () => {
    assert.equal(isValidGuess("abcd"), false);
    assert.equal(isValidGuess("abcdef"), false);
    assert.equal(isValidGuess(""), false);
  });

  it("real dictionary word → true", () => {
    assert.equal(isValidGuess("hello"), true);
    assert.equal(isValidGuess("world"), true);
  });

  it("gibberish → false", () => {
    assert.equal(isValidGuess("xyqwz"), false);
    assert.equal(isValidGuess("zzzzz"), false);
  });
});

describe("updateKeyboardStates", () => {
  it("absent → present upgrade", () => {
    const next = updateKeyboardStates(
      { e: "absent" },
      gs("erase", ["present", "absent", "absent", "absent", "absent"]),
    );
    assert.equal(next.e, "present");
  });

  it("correct stays correct even when re-seen as present", () => {
    const next = updateKeyboardStates(
      { e: "correct" },
      gs("erase", ["present", "absent", "absent", "absent", "absent"]),
    );
    assert.equal(next.e, "correct");
  });

  it("present does not downgrade to absent", () => {
    const next = updateKeyboardStates(
      { a: "present" },
      gs("aahed", ["present", "absent", "absent", "absent", "absent"]),
    );
    // a's second occurrence in the guess is 'absent', but keyboard should
    // remain 'present' (the higher of the two).
    assert.equal(next.a, "present");
  });
});

describe("pickAnswer", () => {
  it("deterministic: same id → same word", () => {
    assert.equal(pickAnswer(0), pickAnswer(0));
    assert.equal(pickAnswer(1), pickAnswer(1));
    assert.equal(pickAnswer(9999), pickAnswer(9999));
  });

  it("different ids produce different words (statistical)", () => {
    const words = new Set([pickAnswer(0), pickAnswer(1), pickAnswer(2)]);
    assert.ok(words.size >= 2, "expected at least 2 unique answers");
  });

  it("returns a 5-letter word", () => {
    assert.equal(pickAnswer(42).length, 5);
    assert.equal(pickAnswer(1).length, 5);
  });
});

describe("calculateScore", () => {
  it("won on first guess at 5s → 6000 + 550 = 6550", () => {
    assert.equal(
      calculateScore([gs("hello", [])], true, 5000),
      6550,
    );
  });

  it("lost → 0 regardless of duration", () => {
    assert.equal(calculateScore([], false, 1000), 0);
    assert.equal(
      calculateScore(Array(6).fill(gs("hello", [])), false, 5000),
      0,
    );
  });

  it("won on 6th guess, slow (>60s) → 1000 minimum", () => {
    const six = Array(6).fill(gs("hello", []));
    assert.equal(calculateScore(six, true, 120_000), 1000);
  });
});

describe("maxLetterHint", () => {
  it("counts correct letters across guesses", () => {
    assert.equal(
      maxLetterHint([
        gs("world", ["correct", "correct", "absent", "absent", "absent"]),
        gs("hello", ["absent", "absent", "correct", "absent", "absent"]),
      ]),
      3,
    );
  });

  it("empty guesses → 0", () => {
    assert.equal(maxLetterHint([]), 0);
  });
});
