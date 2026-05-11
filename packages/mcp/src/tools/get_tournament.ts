// get_tournament — fresh on-chain state for a single tournament.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const Bytes32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'tournamentId must be 0x-prefixed 32-byte hex')
  .describe('Tournament id (bytes32 hex, 0x + 64 chars).');

export function registerGetTournamentTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'get_tournament',
    description:
      'Fetch a single SkillOS tournament by its bytes32 id. Returns sponsor, game, cycleType, start/end timestamps, prize pool, participation bonus, settled flag, and current participant count.',
    inputSchema: { tournamentId: Bytes32 },
    handler: async ({ tournamentId }) => {
      const tournament = await ctx.sdk.tournaments.get(tournamentId as `0x${string}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(tournament, null, 2) }],
      };
    },
  });
}
