// Process configuration — merged from env vars and ~/.skillos/config.json.
//
// Env wins over file (per usual CLI conventions). The file is owned by the
// user and exists only after `skillos init`; the env path lets one-off
// commands work without touching disk.
//
// Field set mirrors @skillos/mcp's SKILLOS_* vars so the same .env can
// drive both tools across a developer's machine.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Address } from 'viem';

export type SkillOSEnv = 'testnet' | 'mainnet';

export interface CliConfig {
  env: SkillOSEnv;
  baseUrl: string;
  privateKey: `0x${string}` | null;
  agentId: number | null;
  siwaDomain: string;
  registryAddress: Address;
  chainId: number;
  rpcUrl: string;
}

interface OnDiskConfig {
  env?: SkillOSEnv;
  baseUrl?: string;
  privateKey?: `0x${string}`;
  agentId?: number;
  siwaDomain?: string;
  registryAddress?: Address;
  rpcUrl?: string;
}

const ENV_DEFAULTS: Record<
  SkillOSEnv,
  Pick<CliConfig, 'baseUrl' | 'registryAddress' | 'chainId' | 'rpcUrl'>
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

export const CONFIG_DIR = path.join(os.homedir(), '.skillos');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function readOnDiskConfig(): OnDiskConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as OnDiskConfig;
  } catch {
    return {};
  }
}

export function writeOnDiskConfig(cfg: OnDiskConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function pickEnv(value: string | undefined, fallback: SkillOSEnv = 'testnet'): SkillOSEnv {
  const v = (value ?? fallback).toLowerCase();
  if (v !== 'testnet' && v !== 'mainnet') {
    throw new Error(`env must be "testnet" or "mainnet", got "${v}"`);
  }
  return v;
}

export interface LoadConfigOverrides {
  env?: string;
  baseUrl?: string;
  privateKey?: string;
}

export function loadConfig(overrides: LoadConfigOverrides = {}): CliConfig {
  const disk = readOnDiskConfig();

  const env = pickEnv(overrides.env ?? process.env.SKILLOS_ENV ?? disk.env, 'testnet');
  const defaults = ENV_DEFAULTS[env];

  const rawPk =
    overrides.privateKey?.trim() ||
    process.env.SKILLOS_PRIVATE_KEY?.trim() ||
    disk.privateKey?.trim();
  let privateKey: `0x${string}` | null = null;
  if (rawPk) {
    if (!PK_RE.test(rawPk)) {
      throw new Error('Private key must be 0x-prefixed 32-byte hex (66 chars).');
    }
    privateKey = rawPk as `0x${string}`;
  }

  let agentId: number | null = null;
  const rawAgentId = process.env.SKILLOS_AGENT_ID?.trim() ?? (disk.agentId !== undefined ? String(disk.agentId) : undefined);
  if (rawAgentId) {
    const n = Number(rawAgentId);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`agentId must be a non-negative integer, got "${rawAgentId}"`);
    }
    agentId = n;
  }

  let registryAddress: Address = (disk.registryAddress ?? defaults.registryAddress) as Address;
  const rawRegistry = process.env.SKILLOS_REGISTRY_ADDRESS?.trim();
  if (rawRegistry) {
    if (!ADDR_RE.test(rawRegistry)) {
      throw new Error(`registry address is not valid: ${rawRegistry}`);
    }
    registryAddress = rawRegistry as Address;
  }

  return {
    env,
    baseUrl:
      overrides.baseUrl?.trim() ||
      process.env.SKILLOS_BASE_URL?.trim() ||
      disk.baseUrl?.trim() ||
      defaults.baseUrl,
    privateKey,
    agentId,
    siwaDomain: process.env.SKILLOS_SIWA_DOMAIN?.trim() || disk.siwaDomain?.trim() || 'skillos.network',
    registryAddress,
    chainId: defaults.chainId,
    rpcUrl: process.env.SKILLOS_RPC_URL?.trim() || disk.rpcUrl?.trim() || defaults.rpcUrl,
  };
}

export class MissingWalletError extends Error {
  constructor() {
    super(
      'No wallet configured. Set SKILLOS_PRIVATE_KEY, pass --key, or run `skillos init` to persist a key in ~/.skillos/config.json.',
    );
    this.name = 'MissingWalletError';
  }
}

export class MissingAgentIdError extends Error {
  constructor() {
    super(
      'No agent identity configured. Set SKILLOS_AGENT_ID, or run `skillos agent register` to mint one.',
    );
    this.name = 'MissingAgentIdError';
  }
}
