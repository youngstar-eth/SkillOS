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
  /**
   * Explicit ERC-8004 tokenId override (env `SKILLOS_AGENT_ID`), or null.
   *
   * This is now an OPTIONAL override: when unset, agent tools resolve the
   * tokenId on-chain from `agentAddress` (W) via the explorer index + a local
   * cache (see identity/resolve.ts). Set it to pin a specific id, to run fully
   * offline, or to disambiguate a wallet that owns more than one identity.
   */
  agentId: number | null;
  /** SIWA domain — must match server SIWE_DOMAIN env. */
  siwaDomain: string;
  /** ERC-8004 IdentityRegistry. Sensible defaults per env; override for forks. */
  registryAddress: Address;
  chainId: number;
  rpcUrl: string;
  /**
   * Blockscout explorer origin for the configured chain. Used read-only to
   * reverse-resolve W → tokenId (the registry exposes no owner→tokenId view).
   * Sensible defaults per env; override with `SKILLOS_EXPLORER_URL`.
   */
  explorerUrl: string;
  /**
   * Funded EOA private key used SOLELY to pay the x402 data tiers
   * (fetch_match_replay / fetch_cohort_snapshot) by signing the EIP-3009 USDC
   * authorization. This is the ONLY key @skillos/mcp reads, and it is NOT the
   * agent identity signer — identity / SIWA / ERC-8128 writes stay delegated to
   * base-mcp (W). The x402 "exact" EVM rail verifies ECDSA only, so the payer
   * MUST be an EOA; a smart-wallet Base Account cannot settle it. Env:
   * `SKILLOS_X402_PAYER_KEY`. Null when unset → data tools throw a precise
   * error; every other tool is unaffected.
   */
  x402PayerKey: `0x${string}` | null;
}

const ENV_DEFAULTS: Record<
  SkillOSEnv,
  Pick<SkillOSMcpConfig, 'baseUrl' | 'registryAddress' | 'chainId' | 'rpcUrl' | 'explorerUrl'>
> = {
  testnet: {
    baseUrl: 'https://api.skillos.network',
    registryAddress: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://base-sepolia.blockscout.com',
  },
  mainnet: {
    baseUrl: 'https://api.skillos.network',
    registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://base.blockscout.com',
  },
};

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const PK_RE = /^0x[a-fA-F0-9]{64}$/;

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

  const rawPayerKey = process.env.SKILLOS_X402_PAYER_KEY?.trim();
  let x402PayerKey: `0x${string}` | null = null;
  if (rawPayerKey) {
    if (!PK_RE.test(rawPayerKey)) {
      throw new Error(
        'SKILLOS_X402_PAYER_KEY must be a 0x-prefixed 32-byte hex private key (66 chars).',
      );
    }
    x402PayerKey = rawPayerKey as `0x${string}`;
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
    explorerUrl: (process.env.SKILLOS_EXPLORER_URL?.trim() || defaults.explorerUrl).replace(/\/$/, ''),
    x402PayerKey,
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
  constructor(address?: string) {
    super(
      `No ERC-8004 agent identity found${address ? ` for wallet ${address}` : ''}. ` +
        'Register one first: prepare_register → base-mcp send_calls → complete_register. ' +
        'The tokenId is then resolved automatically from your wallet — or set SKILLOS_AGENT_ID to pin it / run offline.',
    );
    this.name = 'MissingAgentIdError';
  }
}

/**
 * Wallet W owns more than one identity in the registry, so auto-resolution
 * cannot pick one safely. Surfaces the candidates and requires an explicit
 * SKILLOS_AGENT_ID — never silently guesses.
 */
export class AmbiguousAgentIdError extends Error {
  constructor(address: string, candidates: number[]) {
    super(
      `Wallet ${address} owns ${candidates.length} ERC-8004 identities (${candidates.join(', ')}). ` +
        'Set SKILLOS_AGENT_ID=<id> to choose which one this agent acts as.',
    );
    this.name = 'AmbiguousAgentIdError';
  }
}

/**
 * On-chain reverse-resolution failed to reach the explorer and no cached id
 * was available. Distinct from "no identity exists" — this is an availability
 * problem, recoverable by retry, an explicit SKILLOS_AGENT_ID, or a prior
 * complete_register on this machine (which seeds the local cache).
 */
export class AgentIdResolutionError extends Error {
  constructor(address: string, cause: unknown) {
    super(
      `Could not resolve the agent identity for ${address} from the explorer ` +
        `(${cause instanceof Error ? cause.message : String(cause)}). ` +
        'Retry, set SKILLOS_AGENT_ID=<id>, or override SKILLOS_EXPLORER_URL.',
    );
    this.name = 'AgentIdResolutionError';
  }
}

/**
 * Thrown when a paid x402 data tool is called but no payer key is configured.
 * Distinct from the delegation errors above: identity / writes are delegated to
 * base-mcp, but the x402 "exact" EVM rail is ECDSA-only, so paying a data tier
 * needs a held funded EOA (`SKILLOS_X402_PAYER_KEY`) — data payments ONLY.
 */
export class MissingX402PayerKeyError extends Error {
  constructor() {
    super(
      'This data tool requires an x402 payer. Set SKILLOS_X402_PAYER_KEY to a funded Base-Sepolia EOA private key — it signs the EIP-3009 USDC authorization and pays the quoted price (gasless for the payer; the facilitator broadcasts). The payer MUST be an EOA: a smart-wallet Base Account cannot settle x402. This key pays data tiers ONLY — identity signing stays delegated to base-mcp.',
    );
    this.name = 'MissingX402PayerKeyError';
  }
}
