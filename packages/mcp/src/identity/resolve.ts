// Zero-config agent-identity resolution: W (wallet) → ERC-8004 tokenId.
//
// The ERC-8004 IdentityRegistry exposes only FORWARD lookups (ownerOf,
// getAgentWallet, balanceOf) and is NOT ERC721Enumerable — there is no
// on-chain owner→tokenId view function, and the public RPC caps eth_getLogs
// at 2000-block windows, so a pure-RPC log scan is impractical at boot. We
// therefore reverse-resolve through the Blockscout explorer index (read-only,
// keyless), then VERIFY the result against the chain (ownerOf) before trusting
// it. This removes the manual `SKILLOS_AGENT_ID` env step that previously
// blocked SIWA.
//
// Resolution order (first hit wins):
//   1. explicit SKILLOS_AGENT_ID override        → never breaks existing setups
//   2. in-process session cache                  → resolve once per process
//   3. local file cache ~/.skillos/...           → survives restarts + offline
//   4. explorer reverse-resolve + ownerOf verify → portable zero-config path
//
// A successful (4) seeds (2) and (3); complete_register also seeds (3) so the
// register→use flow works even if the explorer later lags or is offline.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  AgentIdResolutionError,
  AmbiguousAgentIdError,
  MissingAgentAddressError,
  MissingAgentIdError,
  type SkillOSMcpConfig,
} from '../config.js';
import { buildPublicClient } from '../wallet.js';

const OWNER_OF_ABI = [
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'owner', type: 'address' }],
  },
] as const;

// ─── caches ───────────────────────────────────────────────────────────────

const sessionCache = new Map<string, number>();
const sessionKey = (chainId: number, w: string): string => `${chainId}:${w.toLowerCase()}`;

interface AgentIdCacheFile {
  agentId: number;
  owner: string;
  registry: string;
  chainId: number;
  resolvedAt: string;
  source: 'explorer' | 'complete_register';
}

function cacheFilePath(chainId: number, w: string): string {
  return join(homedir(), '.skillos', `agent-id-${chainId}-${w.toLowerCase()}.json`);
}

/**
 * Read the persisted tokenId for (chainId, W), but only if it matches the
 * configured registry — guards against a stale file after a registry/fork
 * change leaking the wrong identity.
 */
export function readFileCache(config: SkillOSMcpConfig, w: string): number | null {
  const path = cacheFilePath(config.chainId, w);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AgentIdCacheFile>;
    if (
      typeof parsed.agentId !== 'number' ||
      !Number.isInteger(parsed.agentId) ||
      parsed.chainId !== config.chainId ||
      (parsed.registry ?? '').toLowerCase() !== config.registryAddress.toLowerCase() ||
      (parsed.owner ?? '').toLowerCase() !== w.toLowerCase()
    ) {
      return null;
    }
    return parsed.agentId;
  } catch {
    return null; // corrupt cache is non-fatal — fall through to live resolution
  }
}

/** Persist a resolved tokenId for (chainId, W). Best-effort: never throws. */
export function writeFileCache(
  config: SkillOSMcpConfig,
  w: string,
  agentId: number,
  source: AgentIdCacheFile['source'],
): void {
  try {
    const dir = join(homedir(), '.skillos');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload: AgentIdCacheFile = {
      agentId,
      owner: w.toLowerCase(),
      registry: config.registryAddress.toLowerCase(),
      chainId: config.chainId,
      resolvedAt: new Date().toISOString(),
      source,
    };
    writeFileSync(cacheFilePath(config.chainId, w), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    sessionCache.set(sessionKey(config.chainId, w), agentId);
  } catch {
    // A read-only home dir must not break the tool — session cache + the live
    // resolve path still work; we just don't persist across restarts.
  }
}

// ─── explorer reverse-resolution ────────────────────────────────────────────

interface BlockscoutNftItem {
  id?: string;
  token?: { address?: string; address_hash?: string };
}
interface BlockscoutNftPage {
  items?: BlockscoutNftItem[];
  next_page_params?: Record<string, string | number> | null;
}

const MAX_EXPLORER_PAGES = 50; // hard backstop; we never silently truncate (see throw below)

/**
 * List the registry tokenIds owned by W via the Blockscout v2 index, filtered
 * to the configured registry contract. Follows pagination fully; throws rather
 * than returning a partial list if the page backstop is hit.
 */
export async function fetchOwnedTokenIdsFromExplorer(
  config: SkillOSMcpConfig,
  w: string,
): Promise<number[]> {
  const base = config.explorerUrl.replace(/\/$/, '');
  const registry = config.registryAddress.toLowerCase();
  const ids: number[] = [];
  let query = '?type=ERC-721';

  for (let page = 0; page < MAX_EXPLORER_PAGES; page++) {
    const res = await fetch(`${base}/api/v2/addresses/${w}/nft${query}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`explorer HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as BlockscoutNftPage;
    for (const item of data.items ?? []) {
      const addr = (item.token?.address ?? item.token?.address_hash ?? '').toLowerCase();
      if (addr !== registry) continue;
      const id = Number(item.id);
      if (Number.isInteger(id) && id >= 0 && !ids.includes(id)) ids.push(id);
    }
    if (!data.next_page_params || Object.keys(data.next_page_params).length === 0) {
      return ids;
    }
    const params = new URLSearchParams({ type: 'ERC-721' });
    for (const [k, v] of Object.entries(data.next_page_params)) params.set(k, String(v));
    query = `?${params.toString()}`;
  }
  throw new Error(
    `explorer pagination exceeded ${MAX_EXPLORER_PAGES} pages for ${w} — refusing to truncate; set SKILLOS_AGENT_ID to pin the id`,
  );
}

/** Verify on-chain that `agentId` is currently owned by W (defends against explorer lag). */
async function verifyOwnerOnchain(
  config: SkillOSMcpConfig,
  agentId: number,
  w: string,
): Promise<boolean> {
  const client = buildPublicClient(config);
  const owner = (await client.readContract({
    address: config.registryAddress,
    abi: OWNER_OF_ABI,
    functionName: 'ownerOf',
    args: [BigInt(agentId)],
  })) as string;
  return owner.toLowerCase() === w.toLowerCase();
}

// ─── public resolver ────────────────────────────────────────────────────────

/** Injection seams so the offline harness can drive resolution without a network. */
export interface ResolveDeps {
  fetchOwnedTokenIds?: (config: SkillOSMcpConfig, w: string) => Promise<number[]>;
  verifyOwner?: (config: SkillOSMcpConfig, agentId: number, w: string) => Promise<boolean>;
}

/**
 * Resolve the ERC-8004 tokenId for the configured agent wallet (W).
 *
 * Throws MissingAgentAddressError if W is unset, MissingAgentIdError if W owns
 * no identity, AmbiguousAgentIdError if it owns more than one, and
 * AgentIdResolutionError if the explorer is unreachable with no cache to fall
 * back on.
 */
export async function resolveAgentId(
  config: SkillOSMcpConfig,
  deps: ResolveDeps = {},
): Promise<number> {
  if (!config.agentAddress) throw new MissingAgentAddressError();
  const w = config.agentAddress;

  // 1. explicit override
  if (config.agentId !== null) return config.agentId;

  // 2. session cache
  const cached = sessionCache.get(sessionKey(config.chainId, w));
  if (cached !== undefined) return cached;

  // 3. file cache
  const fromFile = readFileCache(config, w);
  if (fromFile !== null) {
    sessionCache.set(sessionKey(config.chainId, w), fromFile);
    return fromFile;
  }

  // 4. explorer reverse-resolve
  const fetchOwned = deps.fetchOwnedTokenIds ?? fetchOwnedTokenIdsFromExplorer;
  let owned: number[];
  try {
    owned = await fetchOwned(config, w);
  } catch (err) {
    throw new AgentIdResolutionError(w, err);
  }
  if (owned.length === 0) throw new MissingAgentIdError(w);
  if (owned.length > 1) throw new AmbiguousAgentIdError(w, owned);

  const agentId = owned[0]!;

  // Defensive on-chain verify: the explorer could lag a transfer-out. If the
  // verify RPC itself errors we trust the explorer (availability > strictness).
  const verify = deps.verifyOwner ?? verifyOwnerOnchain;
  let owns = true;
  try {
    owns = await verify(config, agentId, w);
  } catch {
    owns = true;
  }
  if (!owns) throw new MissingAgentIdError(w);

  writeFileCache(config, w, agentId, 'explorer');
  return agentId;
}

/** Test-only — clear the in-process session cache. Not part of the package surface. */
export function _clearSessionCacheForTests(): void {
  sessionCache.clear();
}
