import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { ApiError } from '../middleware/errorEnvelope.js';
import { ErrorEnvelopeSchema } from '../schemas/common.js';
import {
  SiwbNonceRequestSchema,
  SiwbNonceResponseSchema,
  SiwbVerifyRequestSchema,
  SiwbVerifyResponseSchema,
} from '../schemas/auth.js';
import { consumeNonce, issueNonce } from '../lib/auth-store.js';
import { issueBearer } from '../lib/jwt.js';
import { parseAndValidate, SiwbValidationError, verifySignature } from '../lib/siwe.js';

export const authRoutes = new OpenAPIHono();

// ─── POST /v1/auth/siwb/nonce ─────────────────────────────────────────────

const nonceRoute = createRoute({
  method: 'post',
  path: '/v1/auth/siwb/nonce',
  summary: 'Issue a SIWB nonce',
  description:
    'Issues a single-use 5-minute nonce for use in a SIWE message. If the wallet already has an outstanding nonce, the previous one is invalidated and a fresh one is returned (REPLACE pattern; UX rationale: cancel-and-retry flows shouldn\'t fail).',
  tags: ['auth'],
  request: {
    body: {
      content: { 'application/json': { schema: SiwbNonceRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Nonce issued',
      content: { 'application/json': { schema: SiwbNonceResponseSchema } },
    },
    422: {
      description: 'Invalid input',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

authRoutes.openapi(nonceRoute, async (c) => {
  const { walletAddress } = c.req.valid('json');
  const { nonce, issuedAt, expiresAt } = await issueNonce(walletAddress);
  return c.json(
    {
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
    200,
  );
});

// ─── POST /v1/auth/siwb/verify ────────────────────────────────────────────

const verifyRoute = createRoute({
  method: 'post',
  path: '/v1/auth/siwb/verify',
  summary: 'Verify SIWE signature → bearer JWT',
  description:
    'Verifies a SIWE message + signature against the address. Order of checks: (1) parse + validate SIWE fields, (2) consume nonce atomically (single-use, replay-rejected), (3) viem.verifyMessage (handles ERC-6492 wrapper transparently for Base Account smart wallets). On success, issues a 24h HS256 JWT. Bearer is meant for Authorization: Bearer <token> on write endpoints.',
  tags: ['auth'],
  request: {
    body: {
      content: { 'application/json': { schema: SiwbVerifyRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Verified — bearer issued',
      content: { 'application/json': { schema: SiwbVerifyResponseSchema } },
    },
    400: {
      description: 'Verification failed (signature, nonce, or message)',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Invalid input shape',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

authRoutes.openapi(verifyRoute, async (c) => {
  const { message, signature, walletAddress } = c.req.valid('json');

  // 1. Parse + validate SIWE fields. Cheap; do before crypto.
  let fields;
  try {
    fields = parseAndValidate(message);
  } catch (err) {
    if (err instanceof SiwbValidationError) {
      throw new ApiError(400, err.code, err.message);
    }
    throw err;
  }

  if (fields.address.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new ApiError(
      400,
      'AUTH_SIGNATURE_INVALID',
      'walletAddress does not match the address in the SIWE message',
    );
  }

  // 2. Consume nonce FIRST — replay protection before signature crypto.
  // Per spec constraint: "Don't waste crypto cycles on already-consumed nonces."
  const consume = await consumeNonce(fields.nonce, walletAddress);
  if (!consume.ok) {
    const codeMap = {
      NOT_FOUND: 'AUTH_NONCE_NOT_FOUND',
      EXPIRED: 'AUTH_NONCE_EXPIRED',
      CONSUMED: 'AUTH_NONCE_CONSUMED',
    } as const;
    throw new ApiError(
      400,
      codeMap[consume.reason],
      `Nonce check failed: ${consume.reason}`,
    );
  }

  // 3. Verify signature via viem (transparent ERC-6492 handling).
  const valid = await verifySignature({
    message,
    signature: signature as `0x${string}`,
    address: walletAddress as `0x${string}`,
  });
  if (!valid) {
    // The nonce has already been consumed at this point — that's intentional.
    // A failed verify with a valid nonce should still burn that nonce so an
    // attacker can't grind through signatures against a single nonce.
    throw new ApiError(
      400,
      'AUTH_SIGNATURE_INVALID',
      'Signature verification failed',
    );
  }

  // 4. Issue bearer.
  const { token, sessionId, expiresAt } = await issueBearer(
    walletAddress as `0x${string}`,
  );
  return c.json(
    {
      token,
      sessionId,
      expiresAt: expiresAt.toISOString(),
    },
    200,
  );
});
