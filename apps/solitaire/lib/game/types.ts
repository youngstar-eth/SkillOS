export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export type PileType = "stock" | "waste" | "tableau" | "foundation";

export interface PileRef {
  type: PileType;
  index: number;
}

export type GameStatus = "playing" | "won";

export interface SolitaireState {
  stock: Card[];
  waste: Card[];
  tableau: Card[][];
  foundation: Card[][];
  moves: number;
  score: number;
  startedAt: number;
  elapsedMs: number;
  status: GameStatus;
  seed: number;
  history: SolitaireState[];
}
