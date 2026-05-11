#!/usr/bin/env tsx
//
// scripts/register-agent.ts — register an agent on Base Sepolia ERC-8004.
//
// Wraps @buildersgarden/siwa/registry.registerAgent for the SkillOS flow.
// Reads a private key from REGISTER_AGENT_PRIVATE_KEY env, builds an inline
// data: URL AgentMetadata, and broadcasts the register(agentURI) transaction.
//
// Founder usage:
//   REGISTER_AGENT_PRIVATE_KEY=0xabc... tsx scripts/register-agent.ts \
//     --name "My SkillOS agent" \
//     --description "Plays 2048 on testnet via @skillos/sdk" \
//     --endpoint https://my-agent.example.com
//
// Output: the agentId (ERC-8004 NFT tokenId) — pass to createSkillOSAgentClient
// or useSkillOSAgent on subsequent SIWA sign-ins.
//
// Per Sprint X4 scope-addition note: this script formalizes "manual ERC-8004
// onboarding scripted" from the X4 lock criteria. Production agents may
// alternatively register via the 8004scan.io UI.

import { parseArgs } from 'node:util';
import { registerAgent, type AgentMetadata } from '@buildersgarden/siwa/registry';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const BASE_SEPOLIA_CHAIN_ID = 84532;
const DEFAULT_RPC = 'https://sepolia.base.org';

function usage(exitCode = 0): never {
  console.error(
    [
      'Usage: tsx scripts/register-agent.ts \\',
      '  --name "Agent name" \\',
      '  --description "What this agent does" \\',
      '  --endpoint https://agent.example.com [--image https://...] [--rpc https://...]',
      '',
      'Required env: REGISTER_AGENT_PRIVATE_KEY (0x-prefixed hex, the agent wallet).',
      '',
      'Network: Base Sepolia (chainId 84532).',
      'Registry: 0x8004A818BFB912233c491871b3d84c89A494BD9e.',
    ].join('\n'),
  );
  process.exit(exitCode);
}

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    description: { type: 'string' },
    endpoint: { type: 'string' },
    image: { type: 'string' },
    rpc: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: true,
});

if (values.help) usage(0);
if (!values.name || !values.description || !values.endpoint) {
  console.error('Error: --name, --description, --endpoint are all required.\n');
  usage(1);
}

const pk = process.env.REGISTER_AGENT_PRIVATE_KEY;
if (!pk || !/^0x[a-fA-F0-9]{64}$/.test(pk)) {
  console.error('Error: REGISTER_AGENT_PRIVATE_KEY env must be 0x-prefixed 32-byte hex.');
  process.exit(1);
}

const account = privateKeyToAccount(pk as `0x${string}`);
const rpcUrl = values.rpc ?? process.env.BASE_SEPOLIA_RPC_URL ?? DEFAULT_RPC;
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(rpcUrl),
});

// AgentMetadata per @buildersgarden/siwa/registry. Minimal viable set.
const metadata: AgentMetadata = {
  name: values.name!,
  description: values.description!,
  image: values.image ?? 'https://skillos.network/agent-default.png',
  services: [{ type: 'web', endpoint: values.endpoint! } as AgentMetadata['services'][number]],
  active: true,
  supportedTrust: ['reputation'],
};

const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

async function main(): Promise<void> {
  console.log('[register-agent] account:    ', account.address);
  console.log('[register-agent] chainId:    ', BASE_SEPOLIA_CHAIN_ID);
  console.log('[register-agent] rpcUrl:     ', rpcUrl);
  console.log('[register-agent] agentURI:   ', agentURI.slice(0, 80) + '... (truncated)');
  console.log('[register-agent] metadata:   ', JSON.stringify(metadata));
  console.log('[register-agent] broadcasting register(agentURI)...');

  const result = await registerAgent({
    agentURI,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl,
    signer: walletClient,
  });

  console.log('');
  console.log('[register-agent] ✓ registered');
  console.log('  agentId:         ', result.agentId);
  console.log('  registry:        ', result.registryAddress);
  console.log('  agentRegistry:   ', result.agentRegistry);
  console.log('  txHash:          ', result.txHash);
  console.log('');
  console.log('Next:');
  console.log(`  - Set agentId=${result.agentId} in your useSkillOSAgent / createSkillOSAgentClient config.`);
  console.log(`  - BaseScan: https://sepolia.basescan.org/tx/${result.txHash}`);
}

main().catch((err: unknown) => {
  console.error('[register-agent] FAIL:', err);
  process.exit(1);
});
