// fetch_cohort_snapshot — paywalled T3 endpoint, $0.10 USDC via x402.
//
// B2-A: the agent buys verified cohort data by paying x402 with a funded EOA
// (SKILLOS_X402_PAYER_KEY). The x402 "exact" EVM rail verifies ECDSA only, so
// the payer is a held EOA — NOT the keyless base-mcp Base Account (a smart
// wallet cannot settle EIP-3009 on this rail). Identity / score writes remain
// delegated to base-mcp; this key pays data tiers only.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server.js';
import { buildPaidFetcherFromConfig, type PaidFetcher } from '../paid-fetch.js';
import { registerTool, type ToolTextResult } from './_register.js';

const COHORT_SNAPSHOT_PATH = '/v1/data/cohort-snapshot';

/**
 * Core, dependency-injected for tests: GET the T3 endpoint through a paid
 * fetcher and wrap the JSON as an MCP text result. The real handler supplies a
 * fetcher built from the configured payer key.
 */
export async function fetchCohortSnapshot(fetcher: PaidFetcher): Promise<ToolTextResult> {
  const data = await fetcher.get(COHORT_SNAPSHOT_PATH);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function registerFetchCohortSnapshotTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'fetch_cohort_snapshot',
    description:
      'Fetch the T3-tier aggregated cohort snapshot across all SkillOS tournaments ($0.10 USDC via x402). Pays automatically from SKILLOS_X402_PAYER_KEY (a funded Base-Sepolia EOA); gasless for the payer — the facilitator broadcasts the EIP-3009 settlement. Errors clearly if no payer key is set.',
    inputSchema: {},
    handler: async () => fetchCohortSnapshot(buildPaidFetcherFromConfig(ctx.config)),
  });
}
