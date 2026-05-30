// make_move — apply one direction to a live 2048 session.
//
// The session must already exist (created implicitly by `get_board_state`).
// Returns the new board, the score delta, whether the slide actually moved
// any tiles, and whether the game is over after the move.
//
// No-op directions (`moved: false`) do NOT consume the move budget — the
// agent is expected to try a different direction in that case. After
// MAX_MOVES legal moves OR no legal moves remaining, `gameOver: true` and
// further calls are rejected with a clear error so the agent's tool loop
// stops cleanly.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyMove, isGameOver, serializeBoard } from '../engines/game2048.js';
import { getSession } from '../engines/session_store.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

export function registerMakeMoveTool(server: McpServer, _ctx: ServerContext): void {
  registerTool(server, {
    name: 'make_move',
    description:
      'Apply one direction (up/down/left/right) to a 2048 session. Returns the new board, the score gained on this move, whether the slide moved any tiles, and the game-over flag. No-op directions do not consume the move budget. After game over, further calls error.',
    inputSchema: {
      sessionId: z
        .string()
        .min(1)
        .max(128)
        .describe(
          'Session id previously initialized via get_board_state. Tool errors if the session is unknown.',
        ),
      direction: z
        .enum(['up', 'down', 'left', 'right'])
        .describe('Direction to slide all tiles.'),
    },
    handler: async ({ sessionId, direction }) => {
      const session = getSession(sessionId);
      if (!session) {
        throw new Error(
          `Unknown sessionId "${sessionId}". Call get_board_state first to initialize the session.`,
        );
      }
      if (isGameOver(session)) {
        throw new Error(
          `Session "${sessionId}" is already game-over (movesUsed=${session.movesUsed}, score=${session.score}). Call submit_score to finalize.`,
        );
      }
      const result = applyMove(session, direction);
      const payload = {
        sessionId,
        direction,
        board: serializeBoard(session.board),
        score: session.score,
        scoreDelta: result.scoreDelta,
        moved: result.moved,
        gameOver: result.gameOver,
        movesUsed: session.movesUsed,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    },
  });
}
