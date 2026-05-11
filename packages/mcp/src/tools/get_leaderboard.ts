// get_leaderboard — score submissions for a tournament, sorted by rank.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const Bytes32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'tournamentId must be 0x-prefixed 32-byte hex')
  .describe('Tournament id (bytes32 hex).');

export function registerGetLeaderboardTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'get_leaderboard',
    description:
      'Fetch the leaderboard for a SkillOS tournament. Returns score submissions sorted by score descending (block number ascending as tiebreaker). One row per submission, not best-per-player.',
    inputSchema: {
      tournamentId: Bytes32,
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Items per page (1–50). Defaults to 20.'),
      cursor: z.string().optional().describe('Opaque cursor from a previous response.'),
    },
    handler: async ({ tournamentId, limit, cursor }) => {
      const page = await ctx.sdk.tournaments.leaderboard(tournamentId as `0x${string}`, {
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(page, null, 2) }],
      };
    },
  });
}
