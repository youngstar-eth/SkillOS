#!/usr/bin/env tsx
//
// scripts/register-agent.ts — register an agent on Base Sepolia ERC-8004.
//
// Calls the IdentityRegistry's register(agentURI) function via viem.writeContract,
// then parses the Registered event from the receipt to extract agentId.
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
// Why direct viem and NOT @buildersgarden/siwa/registry.registerAgent:
//   The library helper kept opening signer-interface mismatch surfaces — three
//   distinct failure modes in two days (barrel cascade pulling signer/circle.js,
//   "signer.getAddress is not a function" when passing a viem WalletClient, then
//   "maxFeePerGas is not a valid Legacy Transaction attribute" when wrapping
//   the account in an inline signer). Each "fix" opened a new layer because the
//   helper's signer abstraction sits between two stable APIs (the lib's ethers-
//   shaped TransactionSigner interface, and viem's account/walletClient shape)
//   without an adapter that handles either cleanly. Direct contract-write is
//   the canonical, stable pattern; the helper is bypassed entirely.
//
// Library footprint kept: only the AgentMetadata type (compile-time erased).
// SIWA + ERC-8128 flows in scripts/agent-smoke.mjs still use the library's
// /siwa + /erc8128 subpaths — those are clean.

import { parseArgs } from 'node:util';
import type { AgentMetadata } from '@buildersgarden/siwa/registry';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const BASE_SEPOLIA_CHAIN_ID = 84532;
const DEFAULT_RPC = 'https://sepolia.base.org';
const ERC8004_REGISTRY_ADDRESS = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;

// Minimal ERC-8004 IdentityRegistry ABI — register fn + Registered event.
// Schema lifted verbatim from @buildersgarden/siwa/dist/registry.js so the
// function/event selectors match what the on-chain contract emits.
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

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});
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
  services: [{ name: 'web', endpoint: values.endpoint! }],
  active: true,
  supportedTrust: ['reputation'],
};

const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

async function main(): Promise<void> {
  console.log('[register-agent] account:    ', account.address);
  console.log('[register-agent] chainId:    ', BASE_SEPOLIA_CHAIN_ID);
  console.log('[register-agent] rpcUrl:     ', rpcUrl);
  console.log('[register-agent] registry:   ', ERC8004_REGISTRY_ADDRESS);
  console.log('[register-agent] agentURI:   ', agentURI.slice(0, 80) + '... (truncated)');
  console.log('[register-agent] metadata:   ', JSON.stringify(metadata));
  console.log('[register-agent] broadcasting register(agentURI)...');

  const txHash = await walletClient.writeContract({
    address: ERC8004_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [agentURI],
  });
  console.log('[register-agent] txHash:     ', txHash);
  console.log('[register-agent] waiting for receipt...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
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
  const { agentId, owner } = logs[0]!.args;
  const agentRegistry = `eip155:${BASE_SEPOLIA_CHAIN_ID}:${ERC8004_REGISTRY_ADDRESS}`;

  console.log('');
  console.log('[register-agent] ✓ registered');
  console.log('  agentId:         ', agentId.toString());
  console.log('  registry:        ', ERC8004_REGISTRY_ADDRESS);
  console.log('  agentRegistry:   ', agentRegistry);
  console.log('  owner:           ', owner);
  console.log('  txHash:          ', txHash);
  console.log('');
  console.log('Next:');
  console.log(`  - Set agentId=${agentId} in your useSkillOSAgent / createSkillOSAgentClient config.`);
  console.log(`  - BaseScan: https://sepolia.basescan.org/tx/${txHash}`);
}

main().catch((err: unknown) => {
  console.error('[register-agent] FAIL:', err);
  process.exit(1);
});
