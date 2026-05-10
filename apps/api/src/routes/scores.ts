import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
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
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V21_ADDRESS,
} from '../lib/contracts.js';
import {
  decodeIndexCursor,
  encodeIndexCursor,
} from '../lib/pagination.js';
import { scanContractEvents } from '../lib/scan.js';
import { getPublicClient } from '../lib/viem.js';

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
