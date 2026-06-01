// Read-only viem public client.
//
// SPEC-B1: @skillos/mcp holds NO private key and signs nothing — all signing
// and transaction broadcast is delegated to base-mcp by the host. The only
// chain access this server needs is read-only: parsing the Registered event
// from an agent_register tx (complete_register) and any future reads. So this
// module exposes a public client only — there is no wallet client, no account,
// no signer.

import {
  createPublicClient,
  http,
  type PublicClient,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import type { SkillOSMcpConfig } from './config.js';

/**
 * Build a read-only viem PublicClient for the configured chain.
 *
 * Loose return type: viem's chain-narrowed client types (Base / Base Sepolia
 * include OP-stack tx types) don't structurally match the generic PublicClient
 * the callers consume (waitForTransactionReceipt only). Cast through `unknown`.
 */
export function buildPublicClient(config: SkillOSMcpConfig): PublicClient {
  const chain = config.chainId === 8453 ? base : baseSepolia;
  return createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  }) as unknown as PublicClient;
}
