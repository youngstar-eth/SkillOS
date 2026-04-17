/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  autoMoveAces,
  calculateScore,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  createDeck,
  createInitialState,
  drawFromStock,
  isRed,
  moveCards,
  undo,
} from "./engine";
import type { Card, SolitaireState } from "./types";

describe("createDeck", () => {
  it("produces 52 unique cards", () => {
    const deck = createDeck();
    assert.equal(deck.length, 52);
    const ids = new Set(deck.map((c) => c.id));
    assert.equal(ids.size, 52);
  });
});

describe("createInitialState", () => {
  it("deterministic shuffle: same seed = same deck", () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    assert.deepEqual(
      a.tableau.flat().map((c) => c.id),
      b.tableau.flat().map((c) => c.id),
    );
  });

  it("28 tableau cards + 24 stock cards", () => {
    const s = createInitialState(1);
    const tableauCount = s.tableau.reduce((sum, col) => sum + col.length, 0);
    assert.equal(tableauCount, 28);
    assert.equal(s.stock.length, 24);
  });

  it("only top tableau card is face-up", () => {
    const s = createInitialState(1);
    for (const col of s.tableau) {
      for (let i = 0; i < col.length; i++) {
        const shouldBeUp = i === col.length - 1;
        assert.equal(col[i].faceUp, shouldBeUp);
      }
    }
  });

  it("stock cards all face-down", () => {
    const s = createInitialState(1);
    assert.ok(s.stock.every((c) => !c.faceUp));
  });

  it("foundation starts empty x4", () => {
    const s = createInitialState(1);
    assert.equal(s.foundation.length, 4);
    assert.ok(s.foundation.every((f) => f.length === 0));
  });
});

describe("drawFromStock", () => {
  it("moves top stock card face-up to waste", () => {
    const s = createInitialState(1);
    const beforeTop = s.stock[s.stock.length - 1];
    const after = drawFromStock(s);
    assert.equal(after.stock.length, s.stock.length - 1);
    assert.equal(after.waste.length, 1);
    assert.equal(after.waste[0].id, beforeTop.id);
    assert.equal(after.waste[0].faceUp, true);
  });

  it("empty stock + waste → recycles waste to stock (face-down)", () => {
    let s = createInitialState(1);
    while (s.stock.length > 0) s = drawFromStock(s);
    assert.equal(s.stock.length, 0);
    assert.ok(s.waste.length > 0);
    const recycled = drawFromStock(s);
    assert.equal(recycled.waste.length, 0);
    assert.equal(recycled.stock.length, s.waste.length);
    assert.ok(recycled.stock.every((c) => !c.faceUp));
  });

  it("empty stock + empty waste → no-op", () => {
    const s: SolitaireState = {
      ...createInitialState(1),
      stock: [],
      waste: [],
    };
    const after = drawFromStock(s);
    assert.equal(after, s);
  });
});

describe("canPlaceOnTableau", () => {
  const redQ: Card = { id: "x", suit: "hearts", rank: 12, faceUp: true };
  const redJ: Card = { id: "x", suit: "diamonds", rank: 11, faceUp: true };
  const blackJ: Card = { id: "x", suit: "spades", rank: 11, faceUp: true };
  const king: Card = { id: "x", suit: "clubs", rank: 13, faceUp: true };

  it("empty pile + King → true", () => {
    assert.equal(canPlaceOnTableau(king, undefined), true);
  });

  it("empty pile + Queen → false", () => {
    assert.equal(canPlaceOnTableau(redQ, undefined), false);
  });

  it("red Q on black J → true (no, Q goes ON J)", () => {
    // Placing black J on red Q (alt-color, descending)
    assert.equal(canPlaceOnTableau(blackJ, redQ), true);
  });

  it("red J on red Q → false (same color)", () => {
    assert.equal(canPlaceOnTableau(redJ, redQ), false);
  });
});

describe("canPlaceOnFoundation", () => {
  const heartsA: Card = { id: "x", suit: "hearts", rank: 1, faceUp: true };
  const hearts2: Card = { id: "x", suit: "hearts", rank: 2, faceUp: true };
  const spades2: Card = { id: "x", suit: "spades", rank: 2, faceUp: true };

  it("empty + Ace → true", () => {
    assert.equal(canPlaceOnFoundation(heartsA, []), true);
  });

  it("Hearts A + Hearts 2 → true", () => {
    assert.equal(canPlaceOnFoundation(hearts2, [heartsA]), true);
  });

  it("Hearts A + Spades 2 → false (wrong suit)", () => {
    assert.equal(canPlaceOnFoundation(spades2, [heartsA]), false);
  });

  it("Hearts 2 top + Hearts A → false (wrong rank order)", () => {
    assert.equal(canPlaceOnFoundation(heartsA, [heartsA, hearts2]), false);
  });
});

describe("isRed", () => {
  it("hearts and diamonds are red", () => {
    assert.equal(isRed("hearts"), true);
    assert.equal(isRed("diamonds"), true);
    assert.equal(isRed("clubs"), false);
    assert.equal(isRed("spades"), false);
  });
});

describe("moveCards", () => {
  it("invalid move returns null", () => {
    const s = createInitialState(1);
    // Try moving stock -> tableau (not allowed)
    const result = moveCards(
      s,
      { type: "stock", index: 0 },
      { type: "tableau", index: 0 },
    );
    assert.equal(result, null);
  });

  it("ace to empty foundation works", () => {
    // Craft a state: waste top is Hearts A
    const base = createInitialState(1);
    const aceH: Card = {
      id: "hearts-1",
      suit: "hearts",
      rank: 1,
      faceUp: true,
    };
    const state: SolitaireState = { ...base, waste: [aceH] };
    const after = moveCards(
      state,
      { type: "waste", index: 0 },
      { type: "foundation", index: 0 },
    );
    assert.ok(after);
    assert.equal(after.waste.length, 0);
    assert.equal(after.foundation[0].length, 1);
    assert.equal(after.foundation[0][0].id, "hearts-1");
    assert.equal(after.score, 10);
  });

  it("tableau move auto-flips newly exposed card", () => {
    const base = createInitialState(1);
    // Craft col 0: [face-down X, face-up Hearts 13 (King)], col 1: []
    const hidden: Card = {
      id: "x-hidden",
      suit: "clubs",
      rank: 5,
      faceUp: false,
    };
    const kingH: Card = {
      id: "hearts-13",
      suit: "hearts",
      rank: 13,
      faceUp: true,
    };
    const tableau: Card[][] = [[hidden, kingH], [], [], [], [], [], []];
    const state: SolitaireState = { ...base, tableau };

    const after = moveCards(
      state,
      { type: "tableau", index: 0 },
      { type: "tableau", index: 1 },
    );
    assert.ok(after);
    assert.equal(after.tableau[0].length, 1);
    assert.equal(after.tableau[0][0].faceUp, true);
    assert.equal(after.tableau[1].length, 1);
    assert.equal(after.tableau[1][0].id, "hearts-13");
  });

  it("stack move (multiple alt-color descending cards)", () => {
    const base = createInitialState(1);
    const redQ: Card = {
      id: "hearts-12",
      suit: "hearts",
      rank: 12,
      faceUp: true,
    };
    const blackJ: Card = {
      id: "spades-11",
      suit: "spades",
      rank: 11,
      faceUp: true,
    };
    const blackK: Card = {
      id: "clubs-13",
      suit: "clubs",
      rank: 13,
      faceUp: true,
    };
    const tableau: Card[][] = [[redQ, blackJ], [blackK], [], [], [], [], []];
    const state: SolitaireState = { ...base, tableau };

    const after = moveCards(
      state,
      { type: "tableau", index: 0 },
      { type: "tableau", index: 1 },
      2,
    );
    assert.ok(after);
    assert.equal(after.tableau[0].length, 0);
    assert.equal(after.tableau[1].length, 3);
    assert.equal(after.tableau[1][2].id, "spades-11");
  });

  it("multi-card move to foundation fails (foundation takes 1 only)", () => {
    const base = createInitialState(1);
    const a: Card = { id: "hearts-1", suit: "hearts", rank: 1, faceUp: true };
    const b: Card = { id: "hearts-2", suit: "hearts", rank: 2, faceUp: true };
    const tableau: Card[][] = [[a, b], [], [], [], [], [], []];
    const state: SolitaireState = { ...base, tableau };

    const after = moveCards(
      state,
      { type: "tableau", index: 0 },
      { type: "foundation", index: 0 },
      2,
    );
    assert.equal(after, null);
  });
});

describe("undo", () => {
  it("restores previous state with penalty", () => {
    const s0 = createInitialState(1);
    const s1 = drawFromStock(s0);
    assert.equal(s1.waste.length, 1);
    const undone = undo(s1);
    assert.equal(undone.waste.length, 0);
    assert.equal(undone.stock.length, s0.stock.length);
  });

  it("no history → no-op", () => {
    const s0 = createInitialState(1);
    const u = undo(s0);
    assert.equal(u, s0);
  });
});

describe("autoMoveAces", () => {
  it("moves accessible Aces to foundation", () => {
    const base = createInitialState(1);
    const aceH: Card = {
      id: "hearts-1",
      suit: "hearts",
      rank: 1,
      faceUp: true,
    };
    const aceS: Card = {
      id: "spades-1",
      suit: "spades",
      rank: 1,
      faceUp: true,
    };
    const tableau: Card[][] = [[aceH], [aceS], [], [], [], [], []];
    const state: SolitaireState = { ...base, tableau };

    const after = autoMoveAces(state);
    assert.equal(after.tableau[0].length, 0);
    assert.equal(after.tableau[1].length, 0);
    // Aces should be on some foundations
    const foundationCount = after.foundation.reduce(
      (sum, f) => sum + f.length,
      0,
    );
    assert.equal(foundationCount, 2);
  });
});

describe("win condition", () => {
  it("status flips to 'won' when all foundations have 13 cards", () => {
    const base = createInitialState(1);
    // Fully fill 3 foundations; prime 4th at rank 12
    const fullFoundation = (suit: "hearts" | "diamonds" | "clubs" | "spades") =>
      Array.from({ length: 13 }, (_, i) => ({
        id: `${suit}-${i + 1}`,
        suit,
        rank: (i + 1) as 1,
        faceUp: true,
      }));
    const queen: Card = {
      id: "spades-12",
      suit: "spades",
      rank: 12,
      faceUp: true,
    };
    const king: Card = {
      id: "spades-13",
      suit: "spades",
      rank: 13,
      faceUp: true,
    };

    const state: SolitaireState = {
      ...base,
      foundation: [
        fullFoundation("hearts"),
        fullFoundation("diamonds"),
        fullFoundation("clubs"),
        [...fullFoundation("spades").slice(0, 12)],
      ],
      tableau: [[king], [], [], [], [], [], []],
    };

    const after = moveCards(
      state,
      { type: "tableau", index: 0 },
      { type: "foundation", index: 3 },
    );
    assert.ok(after);
    assert.equal(after.status, "won");
  });
});

describe("calculateScore", () => {
  it("returns raw score while playing", () => {
    const s = { ...createInitialState(1), score: 42 };
    assert.equal(calculateScore(s), 42);
  });

  it("adds win bonus when status=won", () => {
    const s: SolitaireState = {
      ...createInitialState(1),
      status: "won",
      score: 100,
      moves: 150,
      elapsedMs: 300 * 1000,
    };
    const total = calculateScore(s);
    // 100 + (600-300)*2 + (200-150)*5 + 1000 = 100 + 600 + 250 + 1000 = 1950
    assert.equal(total, 1950);
  });
});
