// SPEC-B1 delegation — SIWA sign-in split into prepare/complete.
//
//   prepare_siwa  → fetch a fresh nonce from the API, build the exact SIWA
//                   message string, cache it, and return it for the host to
//                   sign via base-mcp sign(type=personal_sign, { message }).
//   complete_siwa → POST { message, signature } to /v1/auth/siwa/verify, then
//                   cache the returned receipt (read by prepare_submit).
//
// @skillos/mcp signs nothing — the EIP-191 signature is produced by base-mcp.
// The signing-scheme alignment (personal_sign over the message string) is
// proven offline in packages/mcp/test/delegation-signing.test.ts.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MissingAgentAddressError } from '../config.js';
import { resolveAgentId } from '../identity/resolve.js';
import { buildAgentSiwaMessage } from '../delegation/siwa.js';
import { getSiwaPending, putReceipt, putSiwaPending } from '../delegation/store.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

interface SiwaVerifyResponse {
  receipt: string;
  expiresAt: string;
  address: `0x${string}`;
  agentId: number;
  signerType?: 'eoa' | 'sca';
  builderCode?: string;
}

export function registerPrepareSiwaTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'prepare_siwa',
    description:
      'Begin a SIWA session for wallet W. Fetches a fresh nonce from the API and returns the exact SIWA message string to sign. The host signs it via base-mcp sign(type=personal_sign, { message }) and passes the signature to complete_siwa. @skillos/mcp signs nothing.',
    inputSchema: {},
    handler: async () => {
      if (!ctx.config.agentAddress) throw new MissingAgentAddressError();
      const agentId = await resolveAgentId(ctx.config);

      const baseUrl = ctx.config.baseUrl.replace(/\/$/, '');
      const nonceRes = await fetch(`${baseUrl}/v1/auth/siwa/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!nonceRes.ok) {
        throw new Error(`SIWA nonce failed: HTTP ${nonceRes.status}: ${await nonceRes.text()}`);
      }
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const issuedAt = new Date().toISOString();
      const message = buildAgentSiwaMessage({
        domain: ctx.config.siwaDomain,
        address: ctx.config.agentAddress,
        agentId,
        agentRegistry: `eip155:${ctx.config.chainId}:${ctx.config.registryAddress}`,
        chainId: ctx.config.chainId,
        nonce,
        issuedAt,
      });

      putSiwaPending(ctx.config.agentAddress, { message, nonce, issuedAt });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message,
                address: ctx.config.agentAddress,
                hint: 'Sign `message` via base-mcp sign(type=personal_sign, data={ message }) from W, then call complete_siwa(signature).',
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });
}

export function registerCompleteSiwaTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'complete_siwa',
    description:
      'Finish a SIWA session: POST the prepared message + the host-produced signature to /v1/auth/siwa/verify, then cache the verification receipt for submit_score. Returns the agentId, resolved address, and receipt expiry.',
    inputSchema: {
      signature: z
        .string()
        .regex(/^0x[a-fA-F0-9]+$/, 'signature must be 0x-prefixed hex')
        .describe('EIP-191 personal_sign signature over the prepare_siwa message, produced by base-mcp from W.'),
    },
    handler: async ({ signature }) => {
      if (!ctx.config.agentAddress) throw new MissingAgentAddressError();
      const pending = getSiwaPending(ctx.config.agentAddress);
      if (!pending) {
        throw new Error('No pending SIWA message for W. Call prepare_siwa first.');
      }

      const baseUrl = ctx.config.baseUrl.replace(/\/$/, '');
      const verifyRes = await fetch(`${baseUrl}/v1/auth/siwa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pending.message, signature }),
      });
      if (!verifyRes.ok) {
        throw new Error(`SIWA verify failed: HTTP ${verifyRes.status}: ${await verifyRes.text()}`);
      }
      const verified = (await verifyRes.json()) as SiwaVerifyResponse;

      putReceipt(ctx.config.agentAddress, {
        receipt: verified.receipt,
        expiresAt: verified.expiresAt,
        agentId: verified.agentId,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                agentId: verified.agentId,
                address: verified.address,
                expiresAt: verified.expiresAt,
                ...(verified.signerType ? { signerType: verified.signerType } : {}),
                ...(verified.builderCode ? { builderCode: verified.builderCode } : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });
}
