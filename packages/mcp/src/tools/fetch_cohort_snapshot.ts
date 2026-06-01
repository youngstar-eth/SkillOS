// fetch_cohort_snapshot — paywalled T3 endpoint, $0.10 USDC via x402.
//
// SPEC-B1: x402 payment signing is delegated to base-mcp in Phase B2. With no
// held key in the wallet-delegation build, this tool is gated with a clear
// deferral (see fetch_match_replay.ts). Stays registered for discoverability.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

export function registerFetchCohortSnapshotTool(server: McpServer, _ctx: ServerContext): void {
  registerTool(server, {
    name: 'fetch_cohort_snapshot',
    description:
      'Fetch the T3-tier aggregated cohort snapshot across all SkillOS tournaments. Paywalled at $0.10 USDC via x402. NOTE: x402 payment delegation to base-mcp lands in Phase B2 — this tool is not callable in the wallet-delegation build (no held key to sign the EIP-3009 authorization).',
    inputSchema: {},
    handler: async () => {
      throw new Error(
        'fetch_cohort_snapshot is unavailable in the wallet-delegation build: x402 payment signing is delegated to base-mcp in Phase B2. @skillos/mcp holds no key to sign the EIP-3009 USDC authorization.',
      );
    },
  });
}
