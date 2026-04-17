import { seededRandom, shuffle } from "@mas/shared/game";
import type {
  Card,
  PileRef,
  Rank,
  SolitaireState,
  Suit,
} from "./types";

export { seededRandom };

export const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank: rank as Rank,
        faceUp: false,
      });
    }
  }
  return deck;
}

export function createInitialState(seed: number): SolitaireState {
  const rand = seededRandom(seed);
  const deck = shuffle(createDeck(), rand);
  const tableau: Card[][] = [[], [], [], [], [], [], []];
  let idx = 0;

  for (let col = 0; col < 7; col++) {
    for (let i = 0; i <= col; i++) {
      tableau[col].push({ ...deck[idx++], faceUp: i === col });
    }
  }

  const stock = deck.slice(idx).map((c) => ({ ...c, faceUp: false }));

  return {
    stock,
    waste: [],
    tableau,
    foundation: [[], [], [], []],
    moves: 0,
    score: 0,
    startedAt: Date.now(),
    elapsedMs: 0,
    status: "playing",
    seed,
    history: [],
  };
}

export function isRed(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

export function canPlaceOnTableau(
  card: Card,
  target: Card | undefined,
): boolean {
  if (!target) return card.rank === 13;
  if (!target.faceUp) return false;
  return card.rank === target.rank - 1 && isRed(card.suit) !== isRed(target.suit);
}

export function canPlaceOnFoundation(card: Card, foundation: Card[]): boolean {
  if (foundation.length === 0) return card.rank === 1;
  const top = foundation[foundation.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

function getPile(state: SolitaireState, ref: PileRef): Card[] {
  if (ref.type === "stock") return state.stock;
  if (ref.type === "waste") return state.waste;
  if (ref.type === "tableau") return state.tableau[ref.index];
  return state.foundation[ref.index];
}

function snapshotState(state: SolitaireState): SolitaireState[] {
  const snap = structuredClone(state);
  snap.history = [];
  return [...state.history, snap].slice(-10);
}

export function drawFromStock(state: SolitaireState): SolitaireState {
  if (state.status !== "playing") return state;
  const history = snapshotState(state);

  if (state.stock.length === 0) {
    if (state.waste.length === 0) return state;
    const newStock = [...state.waste]
      .reverse()
      .map((c) => ({ ...c, faceUp: false }));
    return {
      ...state,
      stock: newStock,
      waste: [],
      moves: state.moves + 1,
      score: Math.max(0, state.score - 100),
      history,
    };
  }

  const card = state.stock[state.stock.length - 1];
  return {
    ...state,
    stock: state.stock.slice(0, -1),
    waste: [...state.waste, { ...card, faceUp: true }],
    moves: state.moves + 1,
    history,
  };
}

export function moveCards(
  state: SolitaireState,
  from: PileRef,
  to: PileRef,
  count: number = 1,
): SolitaireState | null {
  if (state.status !== "playing") return null;
  if (from.type === to.type && from.index === to.index) return null;

  const sourcePile = getPile(state, from);
  if (sourcePile.length < count) return null;

  const cards = sourcePile.slice(-count);
  if (cards.some((c) => !c.faceUp)) return null;

  const targetPile = getPile(state, to);
  if (to.type === "tableau") {
    const targetTop = targetPile[targetPile.length - 1];
    if (!canPlaceOnTableau(cards[0], targetTop)) return null;
  } else if (to.type === "foundation") {
    if (cards.length !== 1) return null;
    if (!canPlaceOnFoundation(cards[0], targetPile)) return null;
  } else {
    return null;
  }

  const history = snapshotState(state);
  const newState = structuredClone(state);
  newState.history = [];

  const newSource = getPile(newState, from);
  newSource.splice(newSource.length - count, count);

  if (from.type === "tableau" && newSource.length > 0) {
    const newTop = newSource[newSource.length - 1];
    if (!newTop.faceUp) newTop.faceUp = true;
  }

  const newTarget = getPile(newState, to);
  newTarget.push(...cards);

  let scoreDelta = 0;
  if (to.type === "foundation") scoreDelta += 10;
  if (from.type === "waste" && to.type === "tableau") scoreDelta += 5;
  if (from.type === "foundation" && to.type === "tableau") scoreDelta -= 15;

  newState.moves += 1;
  newState.score = Math.max(0, newState.score + scoreDelta);
  newState.history = history;

  if (newState.foundation.every((f) => f.length === 13)) {
    newState.status = "won";
  }

  return newState;
}

export function undo(state: SolitaireState): SolitaireState {
  if (state.history.length === 0) return state;
  const prev = state.history[state.history.length - 1];
  return {
    ...prev,
    history: state.history.slice(0, -1),
    score: Math.max(0, prev.score - 15),
  };
}

export function autoMoveAces(state: SolitaireState): SolitaireState {
  let current = state;
  let changed = true;
  while (changed) {
    changed = false;

    if (current.waste.length > 0) {
      const top = current.waste[current.waste.length - 1];
      for (let i = 0; i < 4; i++) {
        if (canPlaceOnFoundation(top, current.foundation[i])) {
          const next = moveCards(
            current,
            { type: "waste", index: 0 },
            { type: "foundation", index: i },
          );
          if (next) {
            current = next;
            changed = true;
            break;
          }
        }
      }
    }

    for (let col = 0; col < 7; col++) {
      const pile = current.tableau[col];
      if (pile.length === 0) continue;
      const top = pile[pile.length - 1];
      if (!top.faceUp || top.rank !== 1) continue;
      for (let i = 0; i < 4; i++) {
        if (canPlaceOnFoundation(top, current.foundation[i])) {
          const next = moveCards(
            current,
            { type: "tableau", index: col },
            { type: "foundation", index: i },
          );
          if (next) {
            current = next;
            changed = true;
            break;
          }
        }
      }
    }
  }
  return current;
}

export function calculateScore(state: SolitaireState): number {
  if (state.status !== "won") return state.score;
  const timeBonus = Math.max(0, 600 - Math.floor(state.elapsedMs / 1000)) * 2;
  const moveBonus = Math.max(0, 200 - state.moves) * 5;
  return state.score + timeBonus + moveBonus + 1000;
}
