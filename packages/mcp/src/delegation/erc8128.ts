// SPEC-B1 delegation — ERC-8128 request signing, split into prepare/complete
// so @skillos/mcp constructs the signature base but never signs it.
//
// The signing-scheme gate (SPEC-B1 §"Signing-scheme verification gate"):
// @slicekit/erc8128 (via @buildersgarden/siwa) signs the RFC-9421 signature
// base under EIP-191 (`signRawMessage(hex)` → `signMessage({ raw })`), and the
// verifier reconstructs the same base and calls `verifyMessage({ raw })`. The
// base is enforced to be printable ASCII (slicekit rejects any byte outside
// \x20-\x7E in derived component values, lines joined by \n). Therefore the
// base's raw bytes are byte-identical to the UTF-8 encoding of its string
// form, so a base-mcp `personal_sign` over the STRING produces a signature the
// verifier accepts unchanged. (See packages/mcp/test/delegation-signing.test.ts.)
//
// CRITICAL: `created`/`expires`/`nonce` are generated INSIDE signRequest. We
// must run it ONCE (here, in prepare), capture the assembled headers + the
// signature base, then only inject the externally-produced signature in
// `assembleSignedRequest`. Re-running signRequest would regenerate those
// params and invalidate the signature.

import { signAuthenticatedRequest } from '@buildersgarden/siwa/erc8128';
import { hexToBytes } from 'viem';

// A syntactically valid, non-empty placeholder signature so signRequest
// completes header assembly. Its value is discarded; only the captured base +
// assembled Signature-Input/Content-Digest headers are retained.
const PLACEHOLDER_SIGNATURE = `0x${'00'.repeat(65)}` as const;

export interface PrepareSignedRequestInput {
  /** Agent wallet address W (keyid binding). */
  address: `0x${string}`;
  chainId: number;
  /** SIWA verification receipt (X-SIWA-Receipt). */
  receipt: string;
  url: string;
  method: string;
  bodyText: string | null;
  contentType?: string;
}

export interface PendingSignedRequest {
  url: string;
  method: string;
  bodyText: string | null;
  contentType?: string;
  receipt: string;
  contentDigest: string | null;
  signatureInput: string;
  label: string;
}

export interface PreparedSignedRequest {
  /**
   * The RFC-9421 signature base as a printable-ASCII string. Hand this to the
   * host to sign via base-mcp `sign(type=personal_sign, { message })`.
   */
  message: string;
  /** Opaque context needed by `assembleSignedRequest` to finalize the POST. */
  pending: PendingSignedRequest;
}

/**
 * Build (but do not sign) an ERC-8128-authenticated request. Returns the
 * signature base to delegate to base-mcp, plus the context to finalize it.
 */
export async function prepareSignedRequest(
  input: PrepareSignedRequestInput,
): Promise<PreparedSignedRequest> {
  let capturedHex: `0x${string}` | null = null;
  const capturingSigner = {
    getAddress: async (): Promise<`0x${string}`> => input.address,
    signMessage: async (): Promise<`0x${string}`> => PLACEHOLDER_SIGNATURE,
    signRawMessage: async (hex: `0x${string}`): Promise<`0x${string}`> => {
      capturedHex = hex;
      return PLACEHOLDER_SIGNATURE;
    },
  };

  const headers = new Headers();
  if (input.contentType) headers.set('Content-Type', input.contentType);
  const request = new Request(input.url, {
    method: input.method,
    headers,
    ...(input.bodyText != null ? { body: input.bodyText } : {}),
  });

  const signed = await signAuthenticatedRequest(
    request,
    input.receipt,
    capturingSigner as never,
    input.chainId,
  );

  if (capturedHex === null) {
    throw new Error(
      'prepareSignedRequest: the ERC-8128 signer was never invoked — cannot derive the signature base.',
    );
  }
  // capturedHex is the hex encoding of the printable-ASCII RFC-9421 base.
  const message = Buffer.from((capturedHex as string).slice(2), 'hex').toString('utf8');

  const signatureInput = signed.headers.get('signature-input');
  if (!signatureInput) {
    throw new Error('prepareSignedRequest: signed request is missing the Signature-Input header.');
  }
  const eqIdx = signatureInput.indexOf('=');
  const label = eqIdx > 0 ? signatureInput.slice(0, eqIdx).trim() : 'eth';

  return {
    message,
    pending: {
      url: input.url,
      method: input.method,
      bodyText: input.bodyText,
      contentType: input.contentType,
      receipt: input.receipt,
      contentDigest: signed.headers.get('content-digest'),
      signatureInput,
      label,
    },
  };
}

/**
 * Assemble the final signed Request by injecting the host-produced signature.
 * Uses the EXACT Signature-Input / Content-Digest captured during prepare so
 * the verifier reconstructs the identical signature base.
 */
export function assembleSignedRequest(
  pending: PendingSignedRequest,
  signature: `0x${string}`,
): Request {
  const sigBytes = hexToBytes(signature);
  if (sigBytes.length === 0) {
    throw new Error('assembleSignedRequest: signature is empty.');
  }
  const sigB64 = Buffer.from(sigBytes).toString('base64');

  const headers = new Headers();
  if (pending.contentType) headers.set('Content-Type', pending.contentType);
  headers.set('X-SIWA-Receipt', pending.receipt);
  if (pending.contentDigest) headers.set('Content-Digest', pending.contentDigest);
  headers.set('Signature-Input', pending.signatureInput);
  headers.set('Signature', `${pending.label}=:${sigB64}:`);

  return new Request(pending.url, {
    method: pending.method,
    headers,
    ...(pending.bodyText != null ? { body: pending.bodyText } : {}),
  });
}
