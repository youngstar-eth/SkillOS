import { seededRandom } from "@mas/shared/game";
import type { GameState } from "./types";

// Re-export seededRandom for convenience — most games need it.
export { seededRandom };

/**
 * Minimal "hello world" engine. Replace with real rules.
 *
 * The shared seeded-random helper gives you deterministic puzzles per
 * tournament ID. Call `createInitialState(Number(TOURNAMENT_ID))` and
 * every player sees the same starting position.
 */
export function createInitialState(seed: number): GameState {
  return {
    score: 0,
    status: "playing",
    startedAt: Date.now(),
    seed,
  };
}

export function addPoints(state: GameState, delta: number): GameState {
  if (state.status !== "playing") return state;
  return { ...state, score: state.score + delta };
}

/** Game ends — flip to `won` if score crossed a threshold, else `gameOver`. */
export function endGame(state: GameState): GameState {
  return {
    ...state,
    status: state.score > 0 ? "won" : "gameOver",
  };
}

/** Final submittable score — clamp negatives to 0. */
export function calculateScore(state: GameState): number {
  return Math.max(0, state.score);
}
