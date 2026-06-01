// SPEC-B1 delegation — agent registration split into prepare/complete.
//
//   prepare_register → builds IdentityRegistry.register(agentURI) calldata
//                      { to, data, value }. The host sends it via base-mcp
//                      send_calls from wallet W; @skillos/mcp signs nothing.
//   complete_register → reads the mint receipt (read-only) and parses the
//                      Registered event to resolve the agentId owned by W.
//
// We encode minimal metadata as a data: URI and target register(agentURI).
// No SIWA / Builder Code lookup here (that needed a held key; it now lives in
// the prepare_siwa/complete_siwa pair).

import { z } from 'zod';
import { encodeFunctionData, parseEventLogs, type Address } from 'viem';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildPublicClient } from '../wallet.js';
import { writeFileCache } from '../identity/resolve.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

// ERC-8004 IdentityRegistry: minimum surface for register + Registered.
const IDENTITY_REGISTRY_ABI = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    name: 'Registered',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
] as const;

interface AgentMetadata {
  name: string;
  description: string;
  image: string;
  services: { name: string; endpoint: string }[];
  active: boolean;
  supportedTrust: string[];
  basename?: string;
}

export function registerPrepareRegisterTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'prepare_register',
    description:
      'Build the calldata to register wallet W as an ERC-8004 agent identity on Base. Encodes minimal metadata as a data: URI and returns { to, data, value } for IdentityRegistry.register(agentURI). The host SENDS this via base-mcp send_calls(chain=base-sepolia) from W — @skillos/mcp signs nothing. After the tx lands, call complete_register(txHash) to resolve the agentId.',
    inputSchema: {
      name: z.string().min(1).max(64).describe('Display name for the agent (≤64 chars).'),
      description: z.string().min(1).max(280).describe('Short description of what this agent does.'),
      endpoint: z
        .string()
        .url()
        .describe('HTTPS endpoint where this agent can be reached (used for discovery, not required to be live).'),
      basename: z
        .string()
        .regex(/^[a-z0-9-]+\.base\.eth$/)
        .optional()
        .describe('Optional Basename (e.g., myagent.base.eth). Persisted in metadata only — does not auto-register on-chain.'),
      image: z.string().url().optional().describe('Avatar URL. Defaults to the SkillOS placeholder.'),
    },
    handler: async ({ name, description, endpoint, basename, image }) => {
      const metadata: AgentMetadata = {
        name,
        description,
        image: image ?? 'https://skillos.network/agent-default.png',
        services: [{ name: 'web', endpoint }],
        active: true,
        supportedTrust: ['reputation'],
        ...(basename ? { basename } : {}),
      };
      const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
      const data = encodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [agentURI],
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                to: ctx.config.registryAddress,
                data,
                value: '0x0',
                chainId: ctx.config.chainId,
                agentURI,
                hint: 'Send via base-mcp send_calls(chain=base-sepolia, calls=[{to,data,value}]) from W, then call complete_register(txHash).',
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

export function registerCompleteRegisterTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'complete_register',
    description:
      'Resolve the agentId from a register transaction hash. Reads the receipt (read-only) and parses the Registered event. Returns { agentId, owner } and caches it locally so prepare_siwa/prepare_submit auto-resolve it from your wallet — no SKILLOS_AGENT_ID needed (still honored as an override).',
    inputSchema: {
      txHash: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be 0x-prefixed 32-byte hex')
        .describe('Transaction hash of the register() call broadcast via base-mcp.'),
    },
    handler: async ({ txHash }) => {
      const publicClient = buildPublicClient(ctx.config);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status !== 'success') {
        throw new Error(`register tx reverted: ${txHash}`);
      }
      const logs = parseEventLogs({
        abi: IDENTITY_REGISTRY_ABI,
        logs: receipt.logs,
        eventName: 'Registered',
      });
      if (logs.length === 0) {
        throw new Error(`register tx ${txHash} succeeded but emitted no Registered event`);
      }
      const { agentId: agentIdRaw, owner } = logs[0]!.args as { agentId: bigint; owner: Address };
      const agentId = Number(agentIdRaw);

      // Seed the local cache so subsequent boots auto-resolve W → agentId
      // (zero-config, and works offline) without needing SKILLOS_AGENT_ID.
      writeFileCache(ctx.config, owner, agentId, 'complete_register');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                agentId,
                owner,
                txHash,
                registry: ctx.config.registryAddress,
                agentRegistry: `eip155:${ctx.config.chainId}:${ctx.config.registryAddress}`,
                chainId: ctx.config.chainId,
                hint:
                  'agentId cached — prepare_siwa/prepare_submit now resolve it automatically from your wallet. ' +
                  'Set SKILLOS_AGENT_ID=' + agentId + ' only to pin it or run offline.',
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
