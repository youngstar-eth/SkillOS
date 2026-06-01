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
  /**
   * Agent wallet address W (the base-mcp Base Account), or null if not set.
   * SPEC-B1: @skillos/mcp holds NO private key — all signing is delegated to
   * base-mcp. W is the single agent identity (mints the agentId, signs SIWA +
   * ERC-8128). Required for delegated write tools.
   */
  agentAddress: `0x${string}` | null;
  /** ERC-8004 tokenId owned by `agentAddress` (W). Required for agent tools. */
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

  const rawAddr = process.env.SKILLOS_AGENT_ADDRESS?.trim();
  let agentAddress: `0x${string}` | null = null;
  if (rawAddr) {
    if (!ADDR_RE.test(rawAddr)) {
      throw new Error(
        'SKILLOS_AGENT_ADDRESS must be a 0x-prefixed 20-byte address (42 chars). This is your base-mcp wallet (W). Remove the var if you only need read tools.',
      );
    }
    agentAddress = rawAddr as `0x${string}`;
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
    agentAddress,
    agentId,
    siwaDomain: process.env.SKILLOS_SIWA_DOMAIN?.trim() || 'skillos.network',
    registryAddress,
    chainId: defaults.chainId,
    rpcUrl: process.env.SKILLOS_RPC_URL?.trim() || defaults.rpcUrl,
  };
}

export class MissingAgentAddressError extends Error {
  constructor() {
    super(
      'Tool requires the agent wallet address. Set SKILLOS_AGENT_ADDRESS to your base-mcp wallet (W). @skillos/mcp holds no key — signing is delegated to base-mcp.',
    );
    this.name = 'MissingAgentAddressError';
  }
}

export class MissingAgentIdError extends Error {
  constructor() {
    super(
      'Tool requires an agent identity. Set SKILLOS_AGENT_ID to the ERC-8004 tokenId your wallet (W) owns. Run prepare_register → base-mcp send_calls → complete_register first if you have none.',
    );
    this.name = 'MissingAgentIdError';
  }
}
