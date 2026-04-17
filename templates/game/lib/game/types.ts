// TODO: Replace with real game state shape.
export type GameStatus = "playing" | "won" | "gameOver";

export interface GameState {
  score: number;
  status: GameStatus;
  startedAt: number;
  seed: number;
}
