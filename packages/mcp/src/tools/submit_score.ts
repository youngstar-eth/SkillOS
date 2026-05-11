// submit_score — agent submission via SIWA + ERC-8128.
//
// Uses the SDK's `createSkillOSAgentClient`: per-call SIWA sign-in cached
// for receipt lifetime, then signed POST /v1/agents/scores. The server
// signs the on-chain submitSoloScore attestation with the studio key and
// broadcasts (fire-and-forget); the returned txHash is unconfirmed.
//
// T0-only in v0.1 — higher tiers require AI plausibility infra (Phase 2
// mainnet blocker). T1+ inputs return 501 from the API.

import { z } from 'zod';
import { createSkillOSAgentClient } from '@skillos/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MissingAgentIdError, MissingWalletError } from '../config.js';
import { buildSiwaSigner, buildWallet } from '../wallet.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const Bytes32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'must be 0x-prefixed 32-byte hex');

export function registerSubmitScoreTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'submit_score',
    description:
      'Submit a score as a verified agent. Performs the SIWA handshake (cached per receipt lifetime), signs each request with ERC-8128, and POSTs to /v1/agents/scores. Returns the broadcast on-chain transaction hash and the server-generated soloRunId. T0 tier only in v0.1 (signature-only, no plausibility validation).',
    inputSchema: {
      tournamentId: Bytes32.describe('Tournament id (bytes32 hex).'),
      score: z.number().int().min(0).describe('Raw player score. Server-side signed as-is in T0.'),
      tier: z
        .enum(['T0', 'T1', 'T2', 'T3'])
        .optional()
        .describe('Quality tier. v0.1 only supports T0 (the default); T1+ returns 501.'),
      soloRunId: Bytes32.optional().describe('Optional client-supplied run id; server generates one if omitted.'),
      matchCountDelta: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Match count increment, capped at 10 on-chain. Defaults to 1.'),
    },
    handler: async ({ tournamentId, score, tier, soloRunId, matchCountDelta }) => {
      if (!ctx.config.privateKey) throw new MissingWalletError();
      if (ctx.config.agentId === null) throw new MissingAgentIdError();

      const wallet = buildWallet({ ...ctx.config, privateKey: ctx.config.privateKey });
      const signer = buildSiwaSigner(wallet.account);

      const agentClient = createSkillOSAgentClient({
        env: ctx.config.env,
        agentId: ctx.config.agentId,
        signer: signer as never,
        domain: ctx.config.siwaDomain,
        baseUrl: ctx.config.baseUrl,
        agentRegistry: ctx.config.registryAddress,
      });

      await agentClient.signIn();

      const result = await agentClient.scores.submit({
        tournamentId: tournamentId as `0x${string}`,
        score,
        ...(tier ? { tier } : {}),
        ...(soloRunId ? { soloRunId: soloRunId as `0x${string}` } : {}),
        ...(matchCountDelta !== undefined ? { matchCountDelta } : {}),
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
