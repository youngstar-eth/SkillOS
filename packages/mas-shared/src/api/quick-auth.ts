import { createClient } from "@farcaster/quick-auth";

/**
 * Shared Quick Auth client. The lib performs JWKS fetches against
 * `https://auth.farcaster.xyz/.well-known/jwks.json` (cached in memory).
 */
const quickAuth = createClient();

export type VerifiedToken = {
  fid: number;
  issuedAt: number;
  expiresAt: number;
  audience: string;
};

export type AuthFailure = {
  ok: false;
  status: 401;
  error:
    | "missing_bearer"
    | "invalid_token"
    | "token_expired"
    | "audience_mismatch";
};

export type AuthSuccess = { ok: true } & VerifiedToken;

/**
 * Resolve the domain this deployment accepts tokens for.
 *
 * Priority: QUICK_AUTH_DOMAIN env > request Host header.
 * Strip the scheme if present (Quick Auth compares against bare domain).
 */
function resolveDomain(req: Request): string {
  const explicit = process.env.QUICK_AUTH_DOMAIN;
  if (explicit) return explicit.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return host;
}

/**
 * Verify a `Bearer` token from the `Authorization` header.
 * Returns a discriminated result — callers branch on `ok`.
 */
export async function verifyBearer(
  req: Request,
): Promise<AuthSuccess | AuthFailure> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "missing_bearer" };
  }
  const token = header.slice(header.indexOf(" ") + 1).trim();
  if (!token) return { ok: false, status: 401, error: "missing_bearer" };

  const domain = resolveDomain(req);
  try {
    const payload = await quickAuth.verifyJwt({ token, domain });
    return {
      ok: true,
      fid: payload.sub,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      audience: payload.aud,
    };
  } catch (err) {
    // The Quick Auth client throws on expired / invalid / audience mismatch.
    // We treat all as 401 but surface a finer code when we can tell.
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("expired")) {
      return { ok: false, status: 401, error: "token_expired" };
    }
    if (message.includes("audience") || message.includes("aud")) {
      return { ok: false, status: 401, error: "audience_mismatch" };
    }
    return { ok: false, status: 401, error: "invalid_token" };
  }
}
