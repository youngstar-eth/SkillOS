// /v1/auth/siwa/* — Sign-In With Agent flow.
//
// Mirrors the SIWB pattern (nonce → sign → verify) but for agents rather
// than humans. Differences:
//   - Nonce is wallet-agnostic at issue time (the agent address is in the
//     signed message itself, not a request param).
//   - Verify performs an onchain ownerOf() against the ERC-8004 registry
//     in addition to signature recovery (handled by @buildersgarden/siwa).
//   - Output is an opaque HMAC receipt + agent identity fields, NOT a
//     bearer JWT (Q1 lock: receipt-only, no JWT wrapping; the receipt is
//     input to ERC-8128 per-request signing on subsequent calls).
//   - Builder Code is fetched server-side from api.base.dev on success
//     (Q3a' refinement of architecture-doc §3.2: trigger is signIn success
//     itself, not first agent-attributed tx).

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
// Subpath import (not barrel): the barrel re-exports signer/index.js which
// eagerly imports peer-optional wallet SDKs we don't install (@circle-fin/...,
// @privy-io/node, @openfort/openfort-node) — boom at function cold-start.
import { generateNonce } from '@buildersgarden/siwa/siwa';
import { ApiError } from '../middleware/errorEnvelope.js';
import { ErrorEnvelopeSchema } from '../schemas/common.js';
import {
  SiwaNonceRequestSchema,
  SiwaNonceResponseSchema,
  SiwaVerifyRequestSchema,
  SiwaVerifyResponseSchema,
} from '../schemas/auth.js';
import { getSiwaNonceStore, verifySiwaSignature, SiwaValidationError } from '../lib/siwa.js';
import { issueAgentReceipt } from '../lib/agent-receipt.js';

export const authSiwaRoutes = new OpenAPIHono();

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 min — matches SIWB

// ─── POST /v1/auth/siwa/nonce ─────────────────────────────────────────────

const nonceRoute = createRoute({
  method: 'post',
  path: '/v1/auth/siwa/nonce',
  summary: 'Issue a SIWA nonce',
  description:
    'Issues a single-use 5-minute nonce. The nonce is wallet-agnostic at issue time — the agent address only appears inside the signed SIWA message at verify time. Stored in Supabase `skillos_siwa_nonces`; consume is atomic via DELETE...RETURNING.',
  tags: ['auth'],
  request: {
    body: {
      content: { 'application/json': { schema: SiwaNonceRequestSchema } },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Nonce issued',
      content: { 'application/json': { schema: SiwaNonceResponseSchema } },
    },
    502: {
      description: 'Nonce store unavailable (transient)',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

authSiwaRoutes.openapi(nonceRoute, async (c) => {
  // Retry once on the off-chance generateNonce collides with an outstanding
  // un-consumed nonce — extraordinarily unlikely (16-char alphanumeric =
  // 36^16 namespace), but `issue` returning false is documented behavior we
  // should handle gracefully.
  let nonce = generateNonce(16);
  let ok = await getSiwaNonceStore().issue(nonce, NONCE_TTL_MS);
  if (!ok) {
    nonce = generateNonce(16);
    ok = await getSiwaNonceStore().issue(nonce, NONCE_TTL_MS);
  }
  if (!ok) {
    throw new ApiError(
      502,
      'AUTH_NONCE_UNAVAILABLE',
      'Could not allocate a fresh SIWA nonce — retry shortly',
    );
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  return c.json(
    {
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
    200,
  );
});

// ─── POST /v1/auth/siwa/verify ────────────────────────────────────────────

const verifyRoute = createRoute({
  method: 'post',
  path: '/v1/auth/siwa/verify',
  summary: 'Verify SIWA signature → opaque receipt',
  description:
    'Verifies a SIWA message + signature: (1) structural validation, (2) chain + registry binding match, (3) ECDSA/ERC-1271 signature recovery, (4) atomic nonce consume, (5) onchain ownerOf(agentId) check against ERC-8004 registry. On success, issues an HMAC receipt + fetches agent Builder Code from api.base.dev (best-effort).',
  tags: ['auth'],
  request: {
    body: {
      content: { 'application/json': { schema: SiwaVerifyRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Verified — receipt issued',
      content: { 'application/json': { schema: SiwaVerifyResponseSchema } },
    },
    400: {
      description: 'Verification failed (signature, nonce, registry, or message)',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Invalid input shape',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

authSiwaRoutes.openapi(verifyRoute, async (c) => {
  const { message, signature } = c.req.valid('json');

  let verified;
  try {
    verified = await verifySiwaSignature({
      message,
      signature: signature as `0x${string}`,
    });
  } catch (err) {
    if (err instanceof SiwaValidationError) {
      throw new ApiError(400, err.code, err.message);
    }
    throw err;
  }

  // Best-effort Builder Code fetch (Q3a' refinement). Failure here does NOT
  // fail the auth — attribution is a secondary concern. Logged for ops
  // visibility.
  const builderCode = await fetchAgentBuilderCode(verified.address).catch(
    (err: unknown) => {
      console.warn(
        `[siwa/verify] Builder Code fetch failed for ${verified.address}:`,
        (err as Error).message,
      );
      return undefined;
    },
  );

  const issued = issueAgentReceipt({
    address: verified.address,
    agentId: verified.agentId,
    agentRegistry: verified.agentRegistry,
    chainId: verified.chainId,
    signerType: verified.signerType,
  });

  return c.json(
    {
      receipt: issued.receipt,
      expiresAt: issued.expiresAt,
      address: verified.address,
      agentId: verified.agentId,
      signerType: verified.signerType,
      ...(builderCode ? { builderCode } : {}),
    },
    200,
  );
});

// ─── helpers ──────────────────────────────────────────────────────────────

async function fetchAgentBuilderCode(walletAddress: string): Promise<string | undefined> {
  const res = await fetch('https://api.base.dev/v1/agents/builder-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    throw new Error(`api.base.dev returned ${res.status}`);
  }
  const data = (await res.json()) as { builderCode?: string };
  if (!data.builderCode || !/^bc_[a-z0-9]{8}$/.test(data.builderCode)) {
    throw new Error(`malformed builderCode in response: ${data.builderCode}`);
  }
  return data.builderCode;
}
