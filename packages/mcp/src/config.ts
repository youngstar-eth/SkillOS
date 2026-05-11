// Process-level configuration for @skillos/mcp.
//
// Env-driven so MCP clients (Claude Desktop, Cursor, agent runtimes) can
// supply credentials per-install without us touching disk. All values are
// optional except SKILLOS_ENV (defaulted), so read tools work with zero
// configuration; write tools throw a precise error if their inputs aren't
// available.

import type { Address } from 'viem';

export type SkillOSEnv = 'testnet' | 'mainnet';

export interface SkillOSMcpConfig {
  env: SkillOSEnv;
  baseUrl: string;
  /** 0x-prefixed 32-byte private key, or null if not set. Required for write tools. */
  privateKey: `0x${string}` | null;
  /** ERC-8004 tokenId owned by `privateKey`. Required for agent tools. */
  agentId: number | null;
  /** SIWA domain — must match server SIWE_DOMAIN env. */
  siwaDomain: string;
  /** ERC-8004 IdentityRegistry. Sensible defaults per env; override for forks. */
  registryAddress: Address;
  chainId: number;
  rpcUrl: string;
}

const ENV_DEFAULTS: Record<
  SkillOSEnv,
  Pick<SkillOSMcpConfig, 'baseUrl' | 'registryAddress' | 'chainId' | 'rpcUrl'>
> = {
  testnet: {
    baseUrl: 'https://api.skillos.network',
    registryAddress: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
  },
  mainnet: {
    baseUrl: 'https://api.skillos.network',
    registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
  },
};

const PK_RE = /^0x[a-fA-F0-9]{64}$/;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

function readEnvEnum(): SkillOSEnv {
  const v = (process.env.SKILLOS_ENV ?? 'testnet').toLowerCase();
  if (v !== 'testnet' && v !== 'mainnet') {
    throw new Error(`SKILLOS_ENV must be "testnet" or "mainnet", got "${v}"`);
  }
  return v;
}

export function loadConfig(): SkillOSMcpConfig {
  const env = readEnvEnum();
  const defaults = ENV_DEFAULTS[env];

  const rawPk = process.env.SKILLOS_PRIVATE_KEY?.trim();
  let privateKey: `0x${string}` | null = null;
  if (rawPk) {
    if (!PK_RE.test(rawPk)) {
      throw new Error(
        'SKILLOS_PRIVATE_KEY must be 0x-prefixed 32-byte hex (66 chars total). Remove the var if you only need read tools.',
      );
    }
    privateKey = rawPk as `0x${string}`;
  }

  const rawAgentId = process.env.SKILLOS_AGENT_ID?.trim();
  let agentId: number | null = null;
  if (rawAgentId) {
    const n = Number(rawAgentId);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`SKILLOS_AGENT_ID must be a non-negative integer, got "${rawAgentId}"`);
    }
    agentId = n;
  }

  const rawRegistry = process.env.SKILLOS_REGISTRY_ADDRESS?.trim();
  let registryAddress: Address = defaults.registryAddress;
  if (rawRegistry) {
    if (!ADDR_RE.test(rawRegistry)) {
      throw new Error(`SKILLOS_REGISTRY_ADDRESS is not a valid 0x-prefixed address: ${rawRegistry}`);
    }
    registryAddress = rawRegistry as Address;
  }

  return {
    env,
    baseUrl: process.env.SKILLOS_BASE_URL?.trim() || defaults.baseUrl,
    privateKey,
    agentId,
    siwaDomain: process.env.SKILLOS_SIWA_DOMAIN?.trim() || 'skillos.network',
    registryAddress,
    chainId: defaults.chainId,
    rpcUrl: process.env.SKILLOS_RPC_URL?.trim() || defaults.rpcUrl,
  };
}

export class MissingWalletError extends Error {
  constructor() {
    super(
      'Tool requires a wallet. Set SKILLOS_PRIVATE_KEY (0x-prefixed 32-byte hex) in the MCP server env.',
    );
    this.name = 'MissingWalletError';
  }
}

export class MissingAgentIdError extends Error {
  constructor() {
    super(
      'Tool requires an agent identity. Set SKILLOS_AGENT_ID to the ERC-8004 tokenId your wallet owns. Run agent_register first if you have none.',
    );
    this.name = 'MissingAgentIdError';
  }
}
