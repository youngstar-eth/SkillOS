// SPEC-B1 delegation — SIWA message construction (no signing).
//
// Under wallet delegation, @skillos/mcp constructs the exact SIWA plaintext
// message and hands it to the host, which signs it with base-mcp
// `sign(type=personal_sign, { message })`. We never touch a key here.
//
// The message is built with @buildersgarden/siwa's canonical builder so the
// bytes are identical to what the server's verifier (verifySIWA) parses and
// recovers under EIP-191 personal_sign.

import { buildSIWAMessage } from '@buildersgarden/siwa/siwa';

export interface AgentSiwaMessageInput {
  /** SIWA domain — MUST match the API's SIWE_DOMAIN. */
  domain: string;
  /** Agent wallet address W (the base-mcp Base Account). */
  address: `0x${string}`;
  /** ERC-8004 tokenId owned by W. */
  agentId: number;
  /** CAIP-10 registry string, e.g. eip155:84532:0x... */
  agentRegistry: string;
  chainId: number;
  /** Server-issued SIWA nonce (POST /v1/auth/siwa/nonce). */
  nonce: string;
  /** ISO-8601 issued-at timestamp. */
  issuedAt: string;
  statement?: string;
  expirationTime?: string;
}

/**
 * Build the canonical SIWA message string for an agent identity.
 *
 * Returns the plaintext message to be EIP-191 personal_sign'd by the host
 * wallet (base-mcp). Identical byte construction to what `verifySIWA` parses.
 */
export function buildAgentSiwaMessage(input: AgentSiwaMessageInput): string {
  return buildSIWAMessage({
    domain: input.domain,
    address: input.address,
    uri: `https://${input.domain}/v1/auth/siwa`,
    version: '1',
    agentId: input.agentId,
    agentRegistry: input.agentRegistry,
    chainId: input.chainId,
    nonce: input.nonce,
    issuedAt: input.issuedAt,
    ...(input.statement ? { statement: input.statement } : {}),
    ...(input.expirationTime ? { expirationTime: input.expirationTime } : {}),
  });
}
