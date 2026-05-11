// SIWA (Sign-In With Agent) verification wrappers.
//
// Composes @buildersgarden/siwa primitives with SkillOS-specific config:
//   - Expected SIWA domain (env-pinned, default skillos.network)
//   - Expected chain ID (Base Sepolia for testnet, 84532)
//   - Expected agent registry (ERC-8004 on Sepolia from env)
//   - Supabase-backed nonce store (./siwa-nonce-store.ts)
//   - viem PublicClient for onchain ownerOf() verification
//
// Verification follows the library's flow:
//   1. parseSIWAMessage: parse + structural validate the EIP-191 message
//   2. verifySIWA: verify signature (EOA or ERC-1271), domain, nonce, time
//      window, address-recovery, AND ownerOf(agentId) onchain
//
// On success, returns the structured agent fields the caller uses to mint
// a receipt via @buildersgarden/siwa/receipt createReceipt.

import { verifySIWA, parseSIWAMessage, type SIWAVerificationResult } from '@buildersgarden/siwa';
import type { Address, Hex, PublicClient } from 'viem';
import { getPublicClient } from './viem.js';
import { createSupabaseSIWANonceStore } from './siwa-nonce-store.js';

const EXPECTED_DOMAIN = process.env.SIWE_DOMAIN ?? 'skillos.network';
const EXPECTED_CHAIN_ID = 84532; // Base Sepolia
const EXPECTED_REGISTRY = (process.env.ERC8004_REGISTRY_ADDRESS ??
  '0x8004A818BFB912233c491871b3d84c89A494BD9e') as Address;
const EXPECTED_REGISTRY_CAIP10 = `eip155:${EXPECTED_CHAIN_ID}:${EXPECTED_REGISTRY}`;

export class SiwaValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SiwaValidationError';
  }
}

let cachedNonceStore = createSupabaseSIWANonceStore();
export function getSiwaNonceStore() {
  return cachedNonceStore;
}

export interface VerifiedSiwaAgent {
  address: Address;
  agentId: number;
  agentRegistry: string;
  chainId: number;
  signerType: 'eoa' | 'sca';
}

export async function verifySiwaSignature(params: {
  message: string;
  signature: Hex;
}): Promise<VerifiedSiwaAgent> {
  // Pre-parse to fail fast on malformed messages with a structured error.
  let parsed;
  try {
    parsed = parseSIWAMessage(params.message);
  } catch (err) {
    throw new SiwaValidationError(
      'AUTH_SIGNATURE_INVALID',
      `Malformed SIWA message: ${(err as Error).message}`,
    );
  }

  // Chain + registry bindings must match SkillOS expectations before the
  // library does the expensive crypto + onchain call.
  if (parsed.chainId !== EXPECTED_CHAIN_ID) {
    throw new SiwaValidationError(
      'AUTH_SIGNATURE_INVALID',
      `chainId mismatch: expected ${EXPECTED_CHAIN_ID}, got ${parsed.chainId}`,
    );
  }
  if (parsed.agentRegistry.toLowerCase() !== EXPECTED_REGISTRY_CAIP10.toLowerCase()) {
    throw new SiwaValidationError(
      'AUTH_SIGNATURE_INVALID',
      `agentRegistry mismatch: expected ${EXPECTED_REGISTRY_CAIP10}, got ${parsed.agentRegistry}`,
    );
  }

  // SIWA's verifySIWA expects a viem PublicClient typed against the generic
  // Chain. Our getPublicClient() returns a Base-specific narrowed client
  // (OP-stack adds a `deposit` transaction type that the generic doesn't
  // know about). Structural cast is safe — the library only calls
  // verifyMessage + getCode which the narrowed client supports identically.
  const result: SIWAVerificationResult = await verifySIWA(
    params.message,
    params.signature,
    EXPECTED_DOMAIN,
    { nonceStore: getSiwaNonceStore() },
    getPublicClient() as unknown as PublicClient,
  );

  if (!result.valid) {
    throw new SiwaValidationError(
      result.code ?? 'AUTH_SIGNATURE_INVALID',
      result.error ?? 'SIWA verification failed',
    );
  }

  return {
    address: result.address as Address,
    agentId: result.agentId,
    agentRegistry: result.agentRegistry,
    chainId: result.chainId,
    signerType: (result.signerType ?? 'eoa') as 'eoa' | 'sca',
  };
}

export { EXPECTED_DOMAIN as SIWA_EXPECTED_DOMAIN };
export { EXPECTED_CHAIN_ID as SIWA_EXPECTED_CHAIN_ID };
export { EXPECTED_REGISTRY as SIWA_EXPECTED_REGISTRY_ADDRESS };
export { EXPECTED_REGISTRY_CAIP10 as SIWA_EXPECTED_REGISTRY_CAIP10 };
