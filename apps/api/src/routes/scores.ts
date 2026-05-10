import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { randomBytes } from 'node:crypto';
import type { Hex } from 'viem';
import {
  ErrorEnvelopeSchema,
  PaginationQuerySchema,
  WalletAddressSchema,
} from '../schemas/common.js';
import {
  ScoreHistoryResponseSchema,
  type ScoreEntry,
} from '../schemas/score.js';
import {
  ScoreSubmitRequestSchema,
  ScoreSubmitResponseSchema,
} from '../schemas/auth.js';
import {
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V21_ADDRESS,
} from '../lib/contracts.js';
import { signSoloSubmitAttestation } from '../lib/contracts-vendored/attestation.js';
import { getWalletClient } from '../lib/contracts-vendored/wallet-client.js';
import {
  decodeIndexCursor,
  encodeIndexCursor,
} from '../lib/pagination.js';
import { scanContractEvents } from '../lib/scan.js';
import { getPublicClient } from '../lib/viem.js';
import { ApiError } from '../middleware/errorEnvelope.js';
import { requireBearer } from '../middleware/bearer.js';
import { check as rateLimit } from '../lib/rate-limit.js';

type ScoreSubmittedRow = {
  args: {
    id?: `0x${string}`;
    player?: `0x${string}`;
    score?: bigint;
    matchCountDelta?: bigint;
    nonce?: `0x${string}`;
  };
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
};

export const scoreRoutes = new OpenAPIHono();

const route = createRoute({
  method: 'get',
  path: '/v1/scores/{wallet}',
  summary: 'Score submissions by wallet',
  description:
    'All ScoreSubmitted events where player == :wallet, across every tournament. Sorted newest-first.',
  tags: ['scores'],
  request: {
    params: z.object({ wallet: WalletAddressSchema }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'Score history page',
      content: {
        'application/json': { schema: ScoreHistoryResponseSchema },
      },
    },
    422: {
      description: 'Invalid params',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

scoreRoutes.openapi(route, async (c) => {
  const { wallet } = c.req.valid('param');
  const { cursor, limit } = c.req.valid('query');
  const client = getPublicClient();

  const events = await scanContractEvents<ScoreSubmittedRow>({
    address: TOURNAMENT_POOL_V21_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    eventName: 'ScoreSubmitted',
    args: { player: wallet as `0x${string}` },
  });

  // Newest first.
  const sorted = [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(b.blockNumber - a.blockNumber);
    return b.logIndex - a.logIndex;
  });

  const start = decodeIndexCursor(cursor) ?? 0;
  const slice = sorted.slice(start, start + limit);

  const uniqueBlocks = [...new Set(slice.map((e) => e.blockNumber))];
  const blockTimes = new Map<bigint, number>();
  await Promise.all(
    uniqueBlocks.map(async (bn) => {
      const block = await client.getBlock({ blockNumber: bn });
      blockTimes.set(bn, Number(block.timestamp));
    }),
  );

  const items: ScoreEntry[] = slice.map((ev) => ({
    tournamentId: ev.args.id!,
    player: ev.args.player!,
    score: (ev.args.score ?? 0n).toString(),
    matchCountDelta: (ev.args.matchCountDelta ?? 0n).toString(),
    nonce: ev.args.nonce!,
    blockNumber: Number(ev.blockNumber),
    transactionHash: ev.transactionHash,
    timestamp: blockTimes.get(ev.blockNumber) ?? 0,
  }));

  const next =
    start + limit < sorted.length ? encodeIndexCursor(start + limit) : undefined;

  return c.json(
    { wallet, items, pagination: next ? { next } : {} },
    200,
  );
});

// ─── POST /v1/scores ──────────────────────────────────────────────────────
//
// Trust tier (per project_phase2_mainnet_blocker_plausibility memory):
//   T0 only — server signs whatever score the bearer-authenticated wallet
//   claims, no AI plausibility validation. External devs / agents using
//   this path operate at lower trust tier intentionally; game-app frontends
//   keep using their own backend (with plausibility) via duel-backend's
//   Next.js handlers. Pre-mainnet hard blocker: T1+ verification before
//   real-USDC tournaments can route through this endpoint.
//
// Response headers make the trust tier explicit to consumers (SDK X3, MCP X6):
//   X-SkillOS-Tier: T0
//   X-SkillOS-Verification: signature-only

const submitRoute = createRoute({
  method: 'post',
  path: '/v1/scores',
  summary: 'Submit a score (T0 tier — signature-only, no plausibility)',
  description:
    'Bearer-authenticated. Server signs a submitSoloScore attestation with STUDIO_PRIVATE_KEY and broadcasts on-chain (fire-and-forget; tx hash returned before block inclusion). Sprint X2 ships T0-only; T1+ submissions return 501 until plausibility pipeline is integrated (Phase 2 mainnet blocker). Game-app frontends should continue using their own per-game /api/tournaments/[id]/solo backends, which run AI plausibility checks.',
  tags: ['scores'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: ScoreSubmitRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Submission broadcast on-chain',
      content: { 'application/json': { schema: ScoreSubmitResponseSchema } },
      headers: z.object({
        'X-SkillOS-Tier': z.literal('T0'),
        'X-SkillOS-Verification': z.literal('signature-only'),
      }),
    },
    400: {
      description: 'Bearer or input invalid',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    429: {
      description: 'Rate limit exceeded (60/min per wallet)',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    501: {
      description: 'Tier not implemented',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

scoreRoutes.use('/v1/scores', requireBearer());
scoreRoutes.openapi(submitRoute, async (c) => {
  const wallet = c.get('walletAddress');

  const limited = rateLimit(`scores:${wallet.toLowerCase()}`);
  if (!limited.allowed) {
    c.header('X-RateLimit-Reset', String(Math.floor(limited.resetAt / 1000)));
    throw new ApiError(
      400,
      'RATE_LIMITED',
      'Per-wallet rate limit exceeded (60 requests/minute)',
    );
  }

  const body = c.req.valid('json');
  if (body.tier !== 'T0') {
    throw new ApiError(
      400,
      'TIER_NOT_IMPLEMENTED',
      `Tier ${body.tier} requires plausibility validation pipeline (Phase 2 mainnet blocker). Sprint X2 supports T0 only.`,
    );
  }

  const soloRunId: Hex = (body.soloRunId as Hex | undefined) ??
    (`0x${randomBytes(32).toString('hex')}` as Hex);
  const onChainNonce = `0x${randomBytes(32).toString('hex')}` as Hex;

  const signature = await signSoloSubmitAttestation({
    tournamentId: body.tournamentId as Hex,
    player: wallet,
    score: BigInt(body.score),
    soloRunId,
    matchCountDelta: BigInt(body.matchCountDelta),
    nonce: onChainNonce,
  });

  const walletClient = getWalletClient();
  const txHash = await walletClient.writeContract({
    address: TOURNAMENT_POOL_V21_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: 'submitSoloScore',
    args: [
      body.tournamentId as Hex,
      wallet,
      BigInt(body.score),
      soloRunId,
      BigInt(body.matchCountDelta),
      onChainNonce,
      signature,
    ],
  });

  c.header('X-SkillOS-Tier', 'T0');
  c.header('X-SkillOS-Verification', 'signature-only');
  return c.json(
    {
      txHash,
      soloRunId,
      submittedAt: new Date().toISOString(),
      tier: 'T0' as const,
    },
    200,
  );
});
