export type GemColor =
  | "red"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink";

export interface Cell {
  color: GemColor | null;
  id: string;
}

export type GameStatus = "playing" | "resolving" | "gameOver";

export interface Match3State {
  grid: Cell[][];
  rows: number;
  cols: number;
  score: number;
  movesLeft: number;
  combo: number;
  maxCombo: number;
  totalMatches: number;
  gemsPopped: number;
  selected: [number, number] | null;
  status: GameStatus;
  seed: number;
  rng: number;
}
