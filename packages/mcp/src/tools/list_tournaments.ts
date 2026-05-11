// list_tournaments — paginated SkillOS tournament listing.
//
// Wraps GET /v1/tournaments via the SDK vanilla client. The current API
// surface supports `cursor` and `limit` server-side; `gameId` and `status`
// filters are applied client-side over the returned page (cheap because
// page size is ≤50 per spec). When the server learns those filter params,
// this tool degrades gracefully.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const TIME_NOW = (): number => Math.floor(Date.now() / 1000);

export function registerListTournamentsTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'list_tournaments',
    description:
      'List public SkillOS tournaments (paginated, newest first). Optionally filter by game slug or live/settled status. Returns id, sponsor, game, prize pool, participant count, settled flag, and start/end timestamps for each tournament.',
    inputSchema: {
      gameId: z
        .string()
        .min(1)
        .max(32)
        .optional()
        .describe('Game slug filter (e.g. "2048", "wordle"). Case-sensitive. Applied client-side.'),
      status: z
        .enum(['live', 'upcoming', 'settled'])
        .optional()
        .describe('Lifecycle filter. "live" = startsAt ≤ now < endsAt; "upcoming" = now < startsAt; "settled" = on-chain settled flag.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Items per page (1–50). Defaults to 20.'),
      cursor: z
        .string()
        .optional()
        .describe('Opaque cursor from a previous response. Pass verbatim to fetch the next page.'),
    },
    handler: async ({ gameId, status, limit, cursor }) => {
      const page = await ctx.sdk.tournaments.list({
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      });

      const now = TIME_NOW();
      const filtered = page.items.filter((t) => {
        if (gameId && t.game !== gameId) return false;
        if (!status) return true;
        if (status === 'settled') return t.settled;
        if (status === 'upcoming') return now < t.startsAt;
        return t.startsAt <= now && now < t.endsAt && !t.settled;
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                items: filtered,
                pagination: page.pagination,
                ...(gameId || status
                  ? { filter: { gameId, status }, prefilterCount: page.items.length }
                  : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });
}
