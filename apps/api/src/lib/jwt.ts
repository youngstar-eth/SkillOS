// JWT issuance + verification using `jose`.
//
// Algorithm: HS256 (shared secret). Per spec lock decision #1 in §5 of
// the developer-surface doc, this is the v1 approach. RS256 (asymmetric)
// is deferred until SDK in X3 multi-service architecture argues for it
// (e.g., MCP server verifying tokens issued by API server without sharing
// the secret).
//
// Token shape:
//   { sub: walletAddress, sessionId: uuid, iat, exp: 24h, iss: 'skillos.network' }
//
// JWT_SECRET rotation policy: never reuse across testnet/mainnet. Per-env
// secrets stored in Vercel env. A rotation invalidates all outstanding
// bearers immediately (acceptable; users re-sign SIWE for a fresh token).

import { jwtVerify, SignJWT } from 'jose';
import type { Address } from 'viem';

const ISSUER = process.env.SIWE_DOMAIN ?? 'skillos.network';
const TTL_SECONDS = 24 * 60 * 60; // 24h

let cachedKey: Uint8Array | undefined;
function key(): Uint8Array {
  if (!cachedKey) {
    const raw = process.env.JWT_SECRET;
    if (!raw || raw.length < 32) {
      throw new Error('JWT_SECRET missing or too short (need ≥32 chars)');
    }
    cachedKey = new TextEncoder().encode(raw);
  }
  return cachedKey;
}

export interface JwtPayload {
  walletAddress: Address;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}

export async function issueBearer(walletAddress: Address): Promise<{
  token: string;
  sessionId: string;
  expiresAt: Date;
}> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TTL_SECONDS;
  const sessionId = crypto.randomUUID();

  const token = await new SignJWT({ sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(walletAddress)
    .setIssuer(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(key());

  return { token, sessionId, expiresAt: new Date(expiresAt * 1000) };
}

export async function verifyBearer(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, key(), { issuer: ISSUER });
  if (typeof payload.sub !== 'string') {
    throw new Error('JWT missing subject (walletAddress)');
  }
  if (typeof payload.sessionId !== 'string') {
    throw new Error('JWT missing sessionId claim');
  }
  return {
    walletAddress: payload.sub as Address,
    sessionId: payload.sessionId,
    issuedAt: payload.iat ?? 0,
    expiresAt: payload.exp ?? 0,
  };
}
