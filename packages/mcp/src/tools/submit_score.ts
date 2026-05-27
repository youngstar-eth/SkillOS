// submit_score — agent submission via SIWA + ERC-8128.
//
// X32-3: inlined SIWA + ERC-8128 + fetch logic (mirroring the working
// `apps/agent-runner/src/lib/submit.ts` reference). Replaces the prior
// `@skillos/sdk` `createSkillOSAgentClient` path which suffered two
// API-side bugs that surfaced in the X32-2 broadcast (PR #173):
//
//   1. SDK's `AgentScoreSubmitInput` is missing the required `game`
//      field — the API rejects bodies without it (X10 Path A
//      attribution). Fixing the SDK requires a republish; inlining
//      lets MCP `submit_score` work against the production API today.
//   2. The MCP wallet's `buildSiwaSigner` lacked `signRawMessage`, so
//      the `@buildersgarden/siwa/erc8128` adapter fell back to
//      `signMessage(hexString)` — signing the UTF-8 bytes of the hex
//      string instead of the raw signature-base bytes the slicekit
//      verifier expects. Result: every signed POST returned 401.
//      Fixed in `../wallet.ts` (added `signRawMessage` to the signer).
//
// The flow per call:
//   1. POST /v1/auth/siwa/nonce  → fresh nonce
//   2. signSIWAMessage(...)      → EIP-191 message + signature
//   3. POST /v1/auth/siwa/verify → opaque HMAC receipt bound to address
//   4. signAuthenticatedRequest  → ERC-8128 signed POST /v1/agents/scores
//
// Server signs the on-chain submitSoloScore attestation with the studio
// key and broadcasts (fire-and-forget); the returned txHash is
// unconfirmed. T0-only in v0.1 — higher tiers require AI plausibility
// infra (Phase 2 mainnet blocker). T1+ inputs return 400 from the API.

import { z } from 'zod';
import { signSIWAMessage } from '@buildersgarden/siwa/siwa';
import { signAuthenticatedRequest } from '@buildersgarden/siwa/erc8128';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MissingAgentIdError, MissingWalletError } from '../config.js';
import { buildSiwaSigner, buildWallet } from '../wallet.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const Bytes32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'must be 0x-prefixed 32-byte hex');

const GameSlug = z.enum(['2048', 'wordle', 'sudoku', 'minesweeper', 'clicker', 'match3']);

interface SubmitRequestBody {
  tournamentId: string;
  game: z.infer<typeof GameSlug>;
  score: number;
  matchCountDelta: number;
  tier: 'T0' | 'T1' | 'T2' | 'T3';
  soloRunId?: string;
}

interface SubmitApiResponse {
  txHash: string;
  soloRunId: string;
  submittedAt: string;
  tier: 'T0';
  agentAddress: string;
  agentId: number;
}

interface SiwaVerifyResponse {
  receipt: string;
  expiresAt: string;
  address: `0x${string}`;
  agentId: number;
  signerType?: 'eoa' | 'sca';
  builderCode?: string;
}

export function registerSubmitScoreTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'submit_score',
    description:
      'Submit a score as a verified agent. Performs the SIWA handshake (per-call), signs each request with ERC-8128, and POSTs to /v1/agents/scores. Returns the broadcast on-chain transaction hash and the server-generated soloRunId. T0 tier only in v0.1 (signature-only, no plausibility validation).',
    inputSchema: {
      tournamentId: Bytes32.describe('Tournament id (bytes32 hex).'),
      game: GameSlug.describe(
        'Game slug. Required (X10): server uses this to resolve the per-game Builder Code for ERC-8021 dataSuffix attribution on the submitSoloScore broadcast. Must match the game of the targeted tournamentId — the server does NOT verify this match-up; mis-attribution is the caller risk.',
      ),
      score: z.number().int().min(0).describe('Raw player score. Server-side signed as-is in T0.'),
      tier: z
        .enum(['T0', 'T1', 'T2', 'T3'])
        .optional()
        .describe('Quality tier. v0.1 only supports T0 (the default); T1+ returns 400.'),
      soloRunId: Bytes32.optional().describe('Optional client-supplied run id; server generates one if omitted.'),
      matchCountDelta: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Match count increment, capped at 10 on-chain. Defaults to 1.'),
    },
    handler: async ({ tournamentId, game, score, tier, soloRunId, matchCountDelta }) => {
      if (!ctx.config.privateKey) throw new MissingWalletError();
      if (ctx.config.agentId === null) throw new MissingAgentIdError();

      const wallet = buildWallet({ ...ctx.config, privateKey: ctx.config.privateKey });
      const signer = buildSiwaSigner(wallet.account);
      const baseUrl = ctx.config.baseUrl.replace(/\/$/, '');
      const domain = ctx.config.siwaDomain;
      const chainId = ctx.config.chainId;
      const agentRegistryCaip10 = `eip155:${chainId}:${ctx.config.registryAddress}`;

      // Step 1: nonce
      const nonceRes = await fetch(`${baseUrl}/v1/auth/siwa/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!nonceRes.ok) {
        throw new Error(`SIWA nonce failed: HTTP ${nonceRes.status}: ${await nonceRes.text()}`);
      }
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // Step 2: sign SIWA message
      const { message, signature } = await signSIWAMessage(
        {
          domain,
          uri: `https://${domain}/v1/auth/siwa`,
          agentId: ctx.config.agentId,
          agentRegistry: agentRegistryCaip10,
          chainId,
          nonce,
          issuedAt: new Date().toISOString(),
        },
        signer as never,
      );

      // Step 3: verify → receipt
      const verifyRes = await fetch(`${baseUrl}/v1/auth/siwa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        throw new Error(
          `SIWA verify failed: HTTP ${verifyRes.status}: ${await verifyRes.text()}`,
        );
      }
      const verified = (await verifyRes.json()) as SiwaVerifyResponse;

      // Step 4: ERC-8128 signed POST
      const body: SubmitRequestBody = {
        tournamentId,
        game,
        score,
        matchCountDelta: matchCountDelta ?? 1,
        tier: tier ?? 'T0',
        ...(soloRunId ? { soloRunId } : {}),
      };
      const submitUrl = `${baseUrl}/v1/agents/scores`;
      const baseRequest = new Request(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const signedRequest = await signAuthenticatedRequest(
        baseRequest,
        verified.receipt,
        signer as never,
        chainId,
      );
      const res = await fetch(signedRequest);
      if (!res.ok) {
        throw new Error(`submit_score failed: HTTP ${res.status}: ${await res.text()}`);
      }
      const result = (await res.json()) as SubmitApiResponse;

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
