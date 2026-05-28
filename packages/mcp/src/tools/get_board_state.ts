// get_board_state — read the current state of a 2048 session.
//
// First call for a new sessionId auto-creates the session using sessionId
// as the seed string. This matches the X32-4 demo flow: the orchestrator
// hands the LLM a fresh sessionId in the system prompt, and the LLM's
// first action is `get_board_state({ sessionId })`, which initializes the
// board deterministically. Subsequent calls just return the live state.
//
// Determinism: sessionId is both the session key AND the engine seed, so
// two agents handed the same sessionId would observe the same opening
// board. In practice each agent gets a distinct sessionId (suffix per
// label) so each plays an independent game on its own seed.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSession, isGameOver, serializeBoard } from '../engines/game2048.js';
import { getSession, registerSession } from '../engines/session_store.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

export function registerGetBoardStateTool(server: McpServer, _ctx: ServerContext): void {
  registerTool(server, {
    name: 'get_board_state',
    description:
      "Read the current 4×4 2048 board for a tournament session. First call auto-creates the session seeded by `sessionId` (so the opening tiles are deterministic per id). Returns `{ board, score, movesUsed, gameOver }`. Call this before make_move to see what's on the board.",
    inputSchema: {
      sessionId: z
        .string()
        .min(1)
        .max(128)
        .describe(
          'Opaque session id assigned by the orchestrator (typically per agent per tournament). Doubles as the engine seed — same id → same opening board.',
        ),
    },
    handler: async ({ sessionId }) => {
      let session = getSession(sessionId);
      if (!session) {
        session = createSession(sessionId);
        registerSession(sessionId, session);
      }
      const payload = {
        sessionId,
        board: serializeBoard(session.board),
        score: session.score,
        movesUsed: session.movesUsed,
        gameOver: isGameOver(session),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    },
  });
}
