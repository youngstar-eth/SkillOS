// Generic adjudicator registry (Δ6 SPEC §2).
//
// The settlement layer never knows a game's internals — it calls
// `verifyMatch(gameId, seed, log)` (or `getEngine(gameId).verify(...)`) and
// gets back `{ score, valid }`. Adding a game = registering one more engine
// here; settlement code stays unchanged.
//
// NOTE: this module registers engines but is NOT itself the verification
// CALL SITE. Wiring `verify` into `settle()` is the separate HIGH-safety
// Δ5+Δ6 settlement rework and intentionally lives nowhere in this package.

import type { GameEngine, GameId, MoveRecord, VerifyResult } from './types';
import { engine2048 } from './games/game2048';

const REGISTRY = new Map<GameId, GameEngine>();

/** Registers (or replaces) the engine for a game id. */
export function registerEngine<M>(engine: GameEngine<M>): void {
  // Engines are stored payload-erased (`GameEngine<unknown>`); each engine
  // re-validates and narrows its own payload inside `verify`, so the erasure
  // is safe — the runtime gate, not the static type, is the contract.
  REGISTRY.set(engine.gameId, engine as GameEngine);
}

export function getEngine(gameId: GameId): GameEngine | undefined {
  return REGISTRY.get(gameId);
}

export function hasEngine(gameId: GameId): boolean {
  return REGISTRY.has(gameId);
}

/** Game ids with a registered engine, in registration order. */
export function registeredGameIds(): GameId[] {
  return [...REGISTRY.keys()];
}

/**
 * Game-agnostic adjudication entry point. Drives the committed tournament
 * seed + off-chain inputLog through the registered engine for `gameId`.
 * An unregistered game id yields `{ valid: false, reason: 'no_engine_for_…' }`
 * rather than throwing.
 */
export function verifyMatch(
  gameId: GameId,
  seed: string,
  log: MoveRecord[],
): VerifyResult {
  const engine = getEngine(gameId);
  if (!engine) return { score: 0, valid: false, reason: `no_engine_for_${gameId}` };
  return engine.verify(seed, log);
}

// ─── Built-in engines ─────────────────────────────────────────────────────
// Stage 2 appends wordle / sudoku / minesweeper / clicker / match3 here as
// each lands. One line per game; nothing else in the registry changes.
registerEngine(engine2048);
