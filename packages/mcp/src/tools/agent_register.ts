// agent_register — mint an ERC-8004 agent identity for the configured wallet.
//
// Direct viem.writeContract against the IdentityRegistry; ABI fragment is
// the canonical minimal set needed for register(agentURI) + Registered
// event parsing. We do NOT route through @buildersgarden/siwa's
// `registerAgent` helper — it sits between two incompatible signer shapes
// (ethers vs viem) and reveals a fresh mismatch on every attempted
// adapter. Direct contract write is the locked pattern (see X4
// brittleness note in memory).
//
// After register, we run SIWA sign-in once so the API fetches the agent
// Builder Code from api.base.dev and returns it. That value is stable for
// the receipt lifetime (24h) and useful for the caller to wire into
// downstream attribution.

import { z } from 'zod';
import {
  parseEventLogs,
  type Address,
} from 'viem';
import { createSkillOSAgentClient } from '@skillos/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MissingWalletError } from '../config.js';
import { buildSiwaSigner, buildWallet } from '../wallet.js';
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

export function registerAgentRegisterTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'agent_register',
    description:
      'Register the configured wallet as an ERC-8004 agent identity on Base. Encodes minimal metadata as a data: URI and mints an agent NFT. After mint, runs SIWA sign-in once so the API auto-registers a Builder Code with api.base.dev. Returns agentId, registry CAIP-10 string, and the optional builderCode.',
    inputSchema: {
      name: z
        .string()
        .min(1)
        .max(64)
        .describe('Display name for the agent (≤64 chars).'),
      description: z
        .string()
        .min(1)
        .max(280)
        .describe('Short description of what this agent does.'),
      endpoint: z
        .string()
        .url()
        .describe('HTTPS endpoint where this agent can be reached (used for discovery, not required to be live).'),
      basename: z
        .string()
        .regex(/^[a-z0-9-]+\.base\.eth$/)
        .optional()
        .describe('Optional Basename (e.g., myagent.base.eth). Persisted in the metadata only — does not auto-register on-chain.'),
      image: z
        .string()
        .url()
        .optional()
        .describe('Avatar URL. Defaults to the SkillOS placeholder.'),
    },
    handler: async ({ name, description, endpoint, basename, image }) => {
      if (!ctx.config.privateKey) throw new MissingWalletError();
      const wallet = buildWallet({ ...ctx.config, privateKey: ctx.config.privateKey });

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

      const txHash = await wallet.walletClient.writeContract({
        account: wallet.account,
        chain: null,
        address: ctx.config.registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [agentURI],
      });
      const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error(`register reverted: ${txHash}`);
      }

      const logs = parseEventLogs({
        abi: IDENTITY_REGISTRY_ABI,
        logs: receipt.logs,
        eventName: 'Registered',
      });
      if (logs.length === 0) {
        throw new Error(`register tx ${txHash} succeeded but emitted no Registered event`);
      }
      const { agentId: agentIdRaw, owner } = logs[0]!.args as {
        agentId: bigint;
        owner: Address;
      };
      const agentId = Number(agentIdRaw);

      // Best-effort: SIWA sign-in to fold in the Builder Code. Don't block
      // success of the register call on this — the on-chain mint is the
      // authoritative outcome the caller asked for.
      let builderCode: string | undefined;
      try {
        const agentClient = createSkillOSAgentClient({
          env: ctx.config.env,
          agentId,
          signer: buildSiwaSigner(wallet.account) as never,
          domain: ctx.config.siwaDomain,
          baseUrl: ctx.config.baseUrl,
          agentRegistry: ctx.config.registryAddress,
        });
        const signin = await agentClient.signIn();
        builderCode = signin.builderCode;
      } catch (err) {
        process.stderr.write(
          `[@skillos/mcp] agent_register: SIWA sign-in for Builder Code lookup failed (non-fatal): ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
      }

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
                ...(builderCode ? { builderCode } : {}),
                hint: 'Save agentId — set SKILLOS_AGENT_ID=<id> in your MCP env to enable submit_score.',
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
