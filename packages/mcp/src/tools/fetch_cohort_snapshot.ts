// fetch_cohort_snapshot — paywalled T3 endpoint, $0.10 USDC via x402.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MissingWalletError } from '../config.js';
import { buildPaidFetcher } from '../paid-fetch.js';
import { buildWallet } from '../wallet.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

export function registerFetchCohortSnapshotTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'fetch_cohort_snapshot',
    description:
      'Fetch the T3-tier aggregated cohort snapshot across all SkillOS tournaments. Paywalled at $0.10 USDC on Base Sepolia via x402. Returns totals (tournaments, participants, submissions, agent share), per-game breakdown with median + p90 scores. Phase 1 returns a fixed plausible sample; payload shape is the long-term contract.',
    inputSchema: {},
    handler: async () => {
      if (!ctx.config.privateKey) throw new MissingWalletError();
      const wallet = buildWallet({ ...ctx.config, privateKey: ctx.config.privateKey });
      const paid = buildPaidFetcher(wallet.account, ctx.config.baseUrl);

      const data = await paid.get('/v1/data/cohort-snapshot');
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  });
}
