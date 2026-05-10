// SIWE (Sign-In With Ethereum / Base Account) message utilities.
//
// Two-stage verification, matching Base's published auth guide pattern:
//   1. siwe parses the message and validates structural fields (nonce,
//      domain, chainId, address, expirationTime).
//   2. viem.verifyMessage verifies the signature itself — viem handles
//      the ERC-6492 wrapper transparently, which siwe's own .verify()
//      does NOT do reliably for Base Account smart wallets that haven't
//      deployed yet.
//
// References:
//   - https://docs.base.org/base-account/guides/authenticate-users
//   - https://viem.sh/docs/actions/public/verifyMessage
//
// We DON'T construct SIWE messages here — clients build them. We only
// receive + verify.

import { SiweMessage } from 'siwe';
import type { Address, Hex } from 'viem';
import { getPublicClient } from './viem.js';

const EXPECTED_DOMAIN = process.env.SIWE_DOMAIN ?? 'skillos.network';
const EXPECTED_CHAIN_ID = 84532; // Base Sepolia

export interface ParsedSiwbFields {
  domain: string;
  address: Address;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

export class SiwbValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SiwbValidationError';
  }
}

export function parseAndValidate(message: string): ParsedSiwbFields {
  let parsed: SiweMessage;
  try {
    parsed = new SiweMessage(message);
  } catch (err) {
    throw new SiwbValidationError(
      'AUTH_SIGNATURE_INVALID',
      `Malformed SIWE message: ${(err as Error).message}`,
    );
  }

  if (parsed.domain !== EXPECTED_DOMAIN) {
    throw new SiwbValidationError(
      'AUTH_SIGNATURE_INVALID',
      `domain mismatch: expected ${EXPECTED_DOMAIN}, got ${parsed.domain}`,
    );
  }
  if (parsed.chainId !== EXPECTED_CHAIN_ID) {
    throw new SiwbValidationError(
      'AUTH_SIGNATURE_INVALID',
      `chainId mismatch: expected ${EXPECTED_CHAIN_ID}, got ${parsed.chainId}`,
    );
  }
  if (parsed.expirationTime) {
    const exp = Date.parse(parsed.expirationTime);
    if (Number.isFinite(exp) && exp < Date.now()) {
      throw new SiwbValidationError(
        'AUTH_SIGNATURE_INVALID',
        'SIWE message expirationTime is in the past',
      );
    }
  }

  return {
    domain: parsed.domain,
    address: parsed.address as Address,
    chainId: parsed.chainId,
    nonce: parsed.nonce,
    issuedAt: parsed.issuedAt ?? new Date().toISOString(),
    expirationTime: parsed.expirationTime,
  };
}

export async function verifySignature(params: {
  message: string;
  signature: Hex;
  address: Address;
}): Promise<boolean> {
  const client = getPublicClient();
  return client.verifyMessage({
    address: params.address,
    message: params.message,
    signature: params.signature,
  });
}
