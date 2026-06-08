// fetch_match_replay — paywalled T2 endpoint, $0.01 USDC via x402.
//
// B2-A: the agent buys a per-submission match replay by paying x402 with a
// funded EOA (SKILLOS_X402_PAYER_KEY). The x402 "exact" EVM rail verifies ECDSA
// only, so the payer is a held EOA — NOT the keyless base-mcp Base Account (a
// smart wallet cannot settle EIP-3009 on this rail). Identity / score writes
// remain delegated to base-mcp; this key pays data tiers only.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server.js';
import { buildPaidFetcherFromConfig, type PaidFetcher } from '../paid-fetch.js';
import { registerTool, type ToolTextResult } from './_register.js';

const Bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'tournamentId must be 0x-prefixed 32-byte hex');

/** Per-tournament T2 replay path. Exported for test coverage of path building. */
export function matchReplayPath(tournamentId: string): string {
  return `/v1/data/match-replay/${tournamentId}`;
}

/**
 * Core, dependency-injected for tests: GET the T2 endpoint through a paid
 * fetcher and wrap the JSON as an MCP text result.
 */
export async function fetchMatchReplay(
  fetcher: PaidFetcher,
  tournamentId: string,
): Promise<ToolTextResult> {
  const data = await fetcher.get(matchReplayPath(tournamentId));
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function registerFetchMatchReplayTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'fetch_match_replay',
    description:
      'Fetch the T2-tier per-submission match replay for a tournament ($0.01 USDC via x402). Pays automatically from SKILLOS_X402_PAYER_KEY (a funded Base-Sepolia EOA); gasless for the payer — the facilitator broadcasts the EIP-3009 settlement. Errors clearly if no payer key is set.',
    inputSchema: {
      tournamentId: Bytes32.describe('Tournament id (bytes32 hex).'),
    },
    handler: async ({ tournamentId }) =>
      fetchMatchReplay(buildPaidFetcherFromConfig(ctx.config), tournamentId),
  });
}
