// Process-local 2048 session registry.
//
// Lifetime: lives in the @skillos/mcp server process. Each (agent,
// tournament) pair gets its own sessionId — the demo orchestrator
// generates these and hands them to the LLM via the system prompt.
//
// Why process-local (not Postgres / Redis): the MCP server spawns one
// stdio subprocess per agent per tournament in the X32-* demo pattern
// (see `runAgentLegBroadcast` in scripts/create-hermes-vs-claude-demo.ts).
// Cross-process persistence is out of scope; if an agent's subprocess
// restarts mid-game the session is gone — by design, the engine is
// MCP-trusted in v0.1 (see backlog v1.11-24 for on-chain hardening).

import type { GameSession } from './game2048.js';

const SESSIONS = new Map<string, GameSession>();

export function registerSession(sessionId: string, session: GameSession): void {
  SESSIONS.set(sessionId, session);
}

export function getSession(sessionId: string): GameSession | undefined {
  return SESSIONS.get(sessionId);
}

export function hasSession(sessionId: string): boolean {
  return SESSIONS.has(sessionId);
}

export function deleteSession(sessionId: string): void {
  SESSIONS.delete(sessionId);
}

/** Test-only — clear all sessions. Not exported through the package surface. */
export function _clearAllForTests(): void {
  SESSIONS.clear();
}
