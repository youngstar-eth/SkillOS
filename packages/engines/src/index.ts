// @skillos/engines — deterministic, game-agnostic replay/adjudication
// engines for SkillOS (Δ6). Pure functions over a seeded LCG; no MCP, Next,
// or network deps.
//
//   import { verifyMatch } from '@skillos/engines';
//   const { score, valid } = verifyMatch('2048', seed, inputLog);
//
// Importing this barrel registers every built-in engine (via ./registry).
// The 2048 engine's full surface is also published at the `@skillos/engines/2048`
// subpath for consumers (e.g. @skillos/mcp) that want only the 2048 helpers.

export * from './types'; // GameId, GAME_IDS, MoveRecord, VerifyResult, GameEngine, orderedMoves
export * from './rng'; // SeededRng, hashSeed
export * from './registry'; // registerEngine, getEngine, hasEngine, registeredGameIds, verifyMatch
export * from './games/game2048'; // Direction, Move2048, engine2048, createSession, replay, …
