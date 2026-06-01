// fetch_match_replay — paywalled T2 endpoint, $0.01 USDC via x402.
//
// SPEC-B1: x402 payment requires signing an EIP-3009 USDC transfer
// authorization, which under wallet delegation is base-mcp's job (x402 flow).
// That delegation is explicitly Phase B2 ("x402 pay-to-enter -> Phase B2").
// Since @skillos/mcp no longer holds a key, this tool cannot self-sign the
// payment in B1 — it is gated with a clear deferral. The tool stays registered
// so the data-tier surface remains discoverable.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const Bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'tournamentId must be 0x-prefixed 32-byte hex');

export function registerFetchMatchReplayTool(server: McpServer, _ctx: ServerContext): void {
  registerTool(server, {
    name: 'fetch_match_replay',
    description:
      'Fetch the T2-tier per-submission match replay for a tournament. Paywalled at $0.01 USDC via x402. NOTE: x402 payment delegation to base-mcp lands in Phase B2 — this tool is not callable in the wallet-delegation build (no held key to sign the EIP-3009 authorization).',
    inputSchema: {
      tournamentId: Bytes32.describe('Tournament id (bytes32 hex).'),
    },
    handler: async () => {
      throw new Error(
        'fetch_match_replay is unavailable in the wallet-delegation build: x402 payment signing is delegated to base-mcp in Phase B2. @skillos/mcp holds no key to sign the EIP-3009 USDC authorization.',
      );
    },
  });
}
