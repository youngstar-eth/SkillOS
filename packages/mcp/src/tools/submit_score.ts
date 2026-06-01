// SPEC-B1 delegation — score submission split into prepare/complete.
//
//   prepare_submit  → engine-validates the 2048 run (live session or replay),
//                     builds the /v1/agents/scores body, and constructs the
//                     ERC-8128 signature base. Returns { message, prepareId }.
//                     The host signs `message` via base-mcp personal_sign.
//   complete_submit → injects the host signature into the prepared request and
//                     POSTs it. The API verifies SIWA receipt + ERC-8128 sig,
//                     signs the on-chain submitSoloScore attestation with the
//                     STUDIO key (unchanged), and returns the broadcast txHash.
//
// @skillos/mcp holds no key and signs nothing. The signing-scheme alignment is
// proven offline in packages/mcp/test/delegation-signing.test.ts. T0 only in
// v0.x (signature-only, no plausibility); T1+ returns 400 from the API.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MissingAgentAddressError } from '../config.js';
import { resolveAgentId } from '../identity/resolve.js';
import { replay, type Direction } from '../engines/game2048.js';
import { getSession } from '../engines/session_store.js';
import { prepareSignedRequest, assembleSignedRequest } from '../delegation/erc8128.js';
import { getReceipt, putSubmitPending, takeSubmitPending } from '../delegation/store.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const Bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'must be 0x-prefixed 32-byte hex');
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

export function registerPrepareSubmitTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'prepare_submit',
    description:
      'Validate a run and build the ERC-8128 signature base for submitting a score as the verified agent W. For game="2048", replay-validates the score against the engine before building anything. Requires a SIWA receipt (call prepare_siwa/complete_siwa first). Returns { message, prepareId } — sign `message` via base-mcp personal_sign, then call complete_submit(prepareId, signature). T0 only.',
    inputSchema: {
      tournamentId: Bytes32.describe('Tournament id (bytes32 hex).'),
      game: GameSlug.describe(
        'Game slug. Required (X10): the server resolves the per-game Builder Code for ERC-8021 dataSuffix attribution. Must match the game of tournamentId — the server does NOT verify this match-up; mis-attribution is the caller risk.',
      ),
      score: z.number().int().min(0).describe('Raw player score. Server-side signed as-is in T0.'),
      tier: z
        .enum(['T0', 'T1', 'T2', 'T3'])
        .optional()
        .describe('Quality tier. v0.x only supports T0 (the default); T1+ returns 400.'),
      soloRunId: Bytes32.optional().describe('Optional client-supplied run id; server generates one if omitted.'),
      matchCountDelta: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Match count increment, capped at 10 on-chain. Defaults to 1.'),
      sessionId: z
        .string()
        .min(1)
        .max(128)
        .optional()
        .describe('X32-4 (2048 only): the engine session id used during the run. Required when game="2048".'),
      moves: z
        .array(z.enum(['up', 'down', 'left', 'right']))
        .max(1000)
        .optional()
        .describe('X32-4 (2048 only): full direction sequence (chronological). Required when game="2048".'),
    },
    handler: async ({ tournamentId, game, score, tier, soloRunId, matchCountDelta, sessionId, moves }) => {
      if (!ctx.config.agentAddress) throw new MissingAgentAddressError();
      // Precondition: W must own an identity. Auto-resolves (and memoizes) the
      // tokenId so prepare_siwa/submit no longer need SKILLOS_AGENT_ID set.
      await resolveAgentId(ctx.config);

      // X32-4 engine validation for the 2048 demo game (unchanged from v0.1):
      // trust the LIVE in-process session when it exists; otherwise fall back
      // to pure replay (the cross-process attack surface).
      if (game === '2048') {
        if (!sessionId || !moves) {
          throw new Error('prepare_submit(game="2048") requires `sessionId` and `moves` for engine validation.');
        }
        const live = getSession(sessionId);
        if (live) {
          if (live.score !== score) {
            throw new Error(
              `Engine score mismatch (live session): claimed=${score} live=${live.score} (sessionId=${sessionId}). Refusing to build submission.`,
            );
          }
        } else {
          const replayed = replay(sessionId, moves as Direction[]);
          if (replayed.score !== score) {
            throw new Error(
              `Engine score mismatch (replay): claimed=${score} replayed=${replayed.score} (sessionId=${sessionId}, moves=${moves.length}). Refusing to build submission.`,
            );
          }
        }
      }

      const cached = getReceipt(ctx.config.agentAddress);
      if (!cached) {
        throw new Error('No valid SIWA receipt for W. Call prepare_siwa then complete_siwa first.');
      }

      const body: SubmitRequestBody = {
        tournamentId,
        game,
        score,
        matchCountDelta: matchCountDelta ?? 1,
        tier: tier ?? 'T0',
        ...(soloRunId ? { soloRunId } : {}),
      };
      const baseUrl = ctx.config.baseUrl.replace(/\/$/, '');

      const { message, pending } = await prepareSignedRequest({
        address: ctx.config.agentAddress,
        chainId: ctx.config.chainId,
        receipt: cached.receipt,
        url: `${baseUrl}/v1/agents/scores`,
        method: 'POST',
        bodyText: JSON.stringify(body),
        contentType: 'application/json',
      });
      const prepareId = putSubmitPending(pending);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message,
                prepareId,
                hint: 'Sign `message` via base-mcp sign(type=personal_sign, data={ message }) from W, then call complete_submit(prepareId, signature) within ~60s (ERC-8128 request TTL).',
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

export function registerCompleteSubmitTool(server: McpServer, _ctx: ServerContext): void {
  registerTool(server, {
    name: 'complete_submit',
    description:
      'Finish a score submission: inject the host-produced ERC-8128 signature into the prepared request and POST it to /v1/agents/scores. The server verifies the signature, signs the on-chain submitSoloScore attestation (STUDIO key), and returns the broadcast txHash + soloRunId.',
    inputSchema: {
      prepareId: z.string().min(1).describe('The prepareId returned by prepare_submit.'),
      signature: z
        .string()
        .regex(/^0x[a-fA-F0-9]+$/, 'signature must be 0x-prefixed hex')
        .describe('EIP-191 personal_sign signature over the prepare_submit message, produced by base-mcp from W.'),
    },
    handler: async ({ prepareId, signature }) => {
      const pending = takeSubmitPending(prepareId);
      if (!pending) {
        throw new Error(`Unknown or already-consumed prepareId "${prepareId}". Call prepare_submit first.`);
      }

      const signedRequest = assembleSignedRequest(pending, signature as `0x${string}`);
      const res = await fetch(signedRequest);
      if (!res.ok) {
        throw new Error(`complete_submit failed: HTTP ${res.status}: ${await res.text()}`);
      }
      const result = (await res.json()) as SubmitApiResponse;

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
