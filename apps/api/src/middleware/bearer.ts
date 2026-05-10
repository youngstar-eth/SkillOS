// Bearer middleware: every write endpoint requires a valid JWT issued by
// /v1/auth/siwb/verify. No write endpoint is anon-reachable, by design.

import type { MiddlewareHandler } from 'hono';
import type { Address } from 'viem';

import { ApiError } from './errorEnvelope.js';
import { verifyBearer } from '../lib/jwt.js';

declare module 'hono' {
  interface ContextVariableMap {
    walletAddress: Address;
    sessionId: string;
  }
}

export const requireBearer = (): MiddlewareHandler => async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth) {
    throw new ApiError(
      400,
      'AUTH_BEARER_MISSING',
      'Authorization: Bearer <jwt> header required',
    );
  }
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ApiError(
      400,
      'AUTH_BEARER_INVALID',
      'Authorization header must be "Bearer <jwt>"',
    );
  }

  let payload;
  try {
    payload = await verifyBearer(match[1]);
  } catch (err) {
    const msg = (err as Error).message;
    const expired = /exp.*required|expired|"exp" claim/i.test(msg);
    throw new ApiError(
      400,
      expired ? 'AUTH_BEARER_EXPIRED' : 'AUTH_BEARER_INVALID',
      expired ? 'Bearer token has expired' : `Bearer verification failed: ${msg}`,
    );
  }

  c.set('walletAddress', payload.walletAddress);
  c.set('sessionId', payload.sessionId);
  await next();
};
