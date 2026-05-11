// fetch_match_replay — paywalled T2 endpoint, $0.01 USDC via x402.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MissingWalletError } from '../config.js';
import { buildPaidFetcher } from '../paid-fetch.js';
import { buildWallet } from '../wallet.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const Bytes32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'tournamentId must be 0x-prefixed 32-byte hex');

export function registerFetchMatchReplayTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'fetch_match_replay',
    description:
      'Fetch the T2-tier per-submission match replay for a tournament. Paywalled at $0.01 USDC on Base Sepolia via x402 (EIP-3009 transfer authorization signed by SKILLOS_PRIVATE_KEY). Returns score, seed, duration, on-chain anchor per submission. Phase 1 returns deterministic stubbed samples; payload shape is the long-term contract.',
    inputSchema: {
      tournamentId: Bytes32.describe('Tournament id (bytes32 hex).'),
    },
    handler: async ({ tournamentId }) => {
      if (!ctx.config.privateKey) throw new MissingWalletError();
      const wallet = buildWallet({ ...ctx.config, privateKey: ctx.config.privateKey });
      const paid = buildPaidFetcher(wallet.account, ctx.config.baseUrl);

      const data = await paid.get(`/v1/data/match-replay/${tournamentId}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  });
}
