// SIWA receipt issuance + verification.
//
// Receipts are stateless HMAC-signed tokens issued by /v1/auth/siwa/verify
// and carried in the X-SIWA-Receipt header on subsequent agent requests.
// Format: base64url(json).base64url(hmac-sha256) — see
// @buildersgarden/siwa/receipt.
//
// The HMAC secret comes from SIWA_RECEIPT_SECRET (separate from JWT_SECRET).
// Rotation invalidates all outstanding receipts immediately. Per-env secret;
// never reuse across testnet/mainnet.
//
// Default TTL: library default is 30 minutes. We expose this as the
// configurable RECEIPT_TTL_MS (24h to match SIWB JWT TTL for consistency;
// shorter than SIWB acceptable since agents re-sign cheaply via SIWA).
//
// Note: per Sprint X4 Q1c lock, the receipt is the SOLE auth credential —
// not wrapped in a JWT. ERC-8128 per-request signing adds the integrity
// layer on writes.

import {
  createReceipt as libCreateReceipt,
  verifyReceipt as libVerifyReceipt,
  type ReceiptPayload,
} from '@buildersgarden/siwa/receipt';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h — match SIWB JWT for consistency

function secret(): string {
  const raw = process.env.SIWA_RECEIPT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('SIWA_RECEIPT_SECRET missing or too short (need ≥32 chars)');
  }
  return raw;
}

export interface IssuedReceipt {
  receipt: string;
  expiresAt: string;
}

export function issueAgentReceipt(input: {
  address: string;
  agentId: number;
  agentRegistry: string;
  chainId: number;
  signerType?: 'eoa' | 'sca';
}): IssuedReceipt {
  const result = libCreateReceipt(
    {
      address: input.address,
      agentId: input.agentId,
      agentRegistry: input.agentRegistry,
      chainId: input.chainId,
      verified: 'onchain',
      signerType: input.signerType,
    },
    { secret: secret(), ttl: TTL_MS },
  );
  return { receipt: result.receipt, expiresAt: result.expiresAt };
}

export function verifyAgentReceipt(receipt: string): ReceiptPayload | null {
  return libVerifyReceipt(receipt, secret());
}

export function getReceiptSecret(): string {
  return secret();
}

export { TTL_MS as RECEIPT_TTL_MS };
