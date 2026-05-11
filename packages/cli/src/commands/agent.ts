// `skillos agent register` — mint an ERC-8004 agent identity NFT.
//
// Direct viem.writeContract — bypasses @buildersgarden/siwa's registerAgent
// helper which sits between two incompatible signer interfaces. See
// project_x4_siwa_library_signer_brittleness in user memory for the
// canonical pattern.

import { defineCommand } from 'citty';
import { parseEventLogs, type Address } from 'viem';
import { createSkillOSAgentClient } from '@skillos/sdk';
import { loadConfig, MissingWalletError } from '../config.js';
import { buildSiwaSigner, buildWallet } from '../wallet.js';
import { fail, info, printJSON } from '../output.js';

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

const BASENAME_RE = /^[a-z0-9-]+\.base\.eth$/;

const registerCommand = defineCommand({
  meta: {
    name: 'register',
    description: 'Mint an ERC-8004 agent identity for the configured wallet.',
  },
  args: {
    name: {
      type: 'string',
      description: 'Display name for the agent (≤64 chars).',
      required: true,
    },
    description: {
      type: 'string',
      description: 'Short description (≤280 chars).',
      required: true,
    },
    endpoint: {
      type: 'string',
      description: 'HTTPS endpoint URL (used for discovery).',
      required: true,
    },
    basename: {
      type: 'string',
      description: 'Optional Basename (e.g. myagent.base.eth).',
    },
    image: {
      type: 'string',
      description: 'Avatar URL.',
    },
    key: {
      type: 'string',
      description: 'Private key override.',
    },
    env: {
      type: 'enum',
      description: 'Environment override.',
      options: ['testnet', 'mainnet'],
    },
  },
  async run({ args }) {
    if (args.name.length > 64) fail(`--name too long (max 64 chars)`);
    if (args.description.length > 280) fail(`--description too long (max 280 chars)`);
    if (args.basename && !BASENAME_RE.test(args.basename)) {
      fail(`--basename must match <name>.base.eth`);
    }

    const config = loadConfig({ env: args.env, privateKey: args.key });
    if (!config.privateKey) throw new MissingWalletError();
    const wallet = buildWallet({ ...config, privateKey: config.privateKey });

    const metadata = {
      name: args.name,
      description: args.description,
      image: args.image ?? 'https://skillos.network/agent-default.png',
      services: [{ name: 'web', endpoint: args.endpoint }],
      active: true,
      supportedTrust: ['reputation'],
      ...(args.basename ? { basename: args.basename } : {}),
    };
    const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

    info(`Registering on ${config.registryAddress} (chainId ${config.chainId})…`);
    const txHash = await wallet.walletClient.writeContract({
      account: wallet.account,
      chain: null,
      address: config.registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentURI],
    });
    info(`  tx: ${txHash}`);
    const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') fail(`register reverted: ${txHash}`);

    const logs = parseEventLogs({
      abi: IDENTITY_REGISTRY_ABI,
      logs: receipt.logs,
      eventName: 'Registered',
    });
    if (logs.length === 0) fail(`register tx ${txHash} emitted no Registered event`);
    const { agentId: agentIdRaw, owner } = logs[0]!.args as {
      agentId: bigint;
      owner: Address;
    };
    const agentId = Number(agentIdRaw);

    // Best-effort: run SIWA sign-in to fetch the Builder Code.
    let builderCode: string | undefined;
    try {
      const client = createSkillOSAgentClient({
        env: config.env,
        agentId,
        signer: buildSiwaSigner(wallet.account) as never,
        domain: config.siwaDomain,
        baseUrl: config.baseUrl,
        agentRegistry: config.registryAddress,
      });
      const signin = await client.signIn();
      builderCode = signin.builderCode;
    } catch (err) {
      info(`(non-fatal) SIWA Builder-Code lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    printJSON({
      ok: true,
      agentId,
      owner,
      txHash,
      registry: config.registryAddress,
      agentRegistry: `eip155:${config.chainId}:${config.registryAddress}`,
      chainId: config.chainId,
      ...(builderCode ? { builderCode } : {}),
      hint: `Save agentId=${agentId}. Set SKILLOS_AGENT_ID=${agentId} or pass --agent-id ${agentId} to submit_score.`,
    });
  },
});

export const agentCommand = defineCommand({
  meta: {
    name: 'agent',
    description: 'Agent identity management (ERC-8004).',
  },
  subCommands: { register: registerCommand },
});
