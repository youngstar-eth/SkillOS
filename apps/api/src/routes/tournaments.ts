// Tournaments routes.
//
// Trade-off note (Sprint X1): TournamentPool stores tournaments in a
// `mapping(bytes32 => Tournament)` with no on-chain enumeration. To list
// tournaments we scan `TournamentCreated` events from SPONSOR_INDEXER_DEPLOY_BLOCK.
// At current testnet volumes (single digits of tournaments), this is a
// 1-RPC-call read per page request and well under public RPC quotas. A
// proper indexer is post-YC backlog (see project_post_yc_tournament_created_indexer
// memory). When migrated, only this file changes.

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ApiError } from '../middleware/errorEnvelope.js';
import {
  Bytes32HexSchema,
  ErrorEnvelopeSchema,
  PaginationQuerySchema,
} from '../schemas/common.js';
import {
  LeaderboardResponseSchema,
  type LeaderboardEntry,
} from '../schemas/score.js';
import {
  TournamentListResponseSchema,
  TournamentSchema,
  type Tournament,
} from '../schemas/tournament.js';
import {
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V21_ADDRESS,
} from '../lib/contracts.js';
import { decodeGame } from '../lib/games.js';
import {
  decodeIndexCursor,
  encodeIndexCursor,
} from '../lib/pagination.js';
import { scanContractEvents } from '../lib/scan.js';
import { getPublicClient } from '../lib/viem.js';

type TournamentCreatedRow = {
  args: {
    id?: `0x${string}`;
    sponsor?: `0x${string}`;
    game?: `0x${string}`;
    cycleType?: number;
    startsAt?: bigint;
    endsAt?: bigint;
    prizePool?: bigint;
    participationBonus?: bigint;
  };
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
};

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

export const tournamentRoutes = new OpenAPIHono();

// ─── GET /v1/tournaments ──────────────────────────────────────────────────

const listRoute = createRoute({
  method: 'get',
  path: '/v1/tournaments',
  summary: 'List tournaments',
  description:
    'Paginated list of tournaments, newest-first. Derived from TournamentCreated events; per-tournament settled/participantsCount fields read via multicall.',
  tags: ['tournaments'],
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      description: 'Tournament list page',
      content: {
        'application/json': { schema: TournamentListResponseSchema },
      },
    },
    422: {
      description: 'Invalid query parameters',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

tournamentRoutes.openapi(listRoute, async (c) => {
  const { cursor, limit } = c.req.valid('query');

  const events = await scanContractEvents<TournamentCreatedRow>({
    address: TOURNAMENT_POOL_V21_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    eventName: 'TournamentCreated',
  });

  // Sort newest-first: descending blockNumber, then descending logIndex.
  const sorted = [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(b.blockNumber - a.blockNumber);
    return b.logIndex - a.logIndex;
  });

  const start = decodeIndexCursor(cursor) ?? 0;
  const slice = sorted.slice(start, start + limit);

  const tournaments: Tournament[] = slice.map((ev) => {
    const a = ev.args;
    return {
      id: a.id!,
      sponsor: a.sponsor!,
      game: decodeGame(a.game!),
      cycleType: Number(a.cycleType ?? 0n),
      startsAt: Number(a.startsAt ?? 0n),
      endsAt: Number(a.endsAt ?? 0n),
      prizePool: (a.prizePool ?? 0n).toString(),
      participationBonus: (a.participationBonus ?? 0n).toString(),
      // List view trades freshness for cost: settled flag and participants
      // count come from on-chain state, not the event. v0.1 reads them lazily
      // via /v1/tournaments/:id; the list view returns conservative defaults.
      settled: false,
      participantsCount: 0,
    };
  });

  const next =
    start + limit < sorted.length ? encodeIndexCursor(start + limit) : undefined;

  return c.json({ items: tournaments, pagination: next ? { next } : {} }, 200);
});

// ─── GET /v1/tournaments/:id ──────────────────────────────────────────────

const getRoute = createRoute({
  method: 'get',
  path: '/v1/tournaments/{id}',
  summary: 'Get tournament by id',
  description: 'Fresh on-chain state for a single tournament.',
  tags: ['tournaments'],
  request: {
    params: z.object({ id: Bytes32HexSchema }),
  },
  responses: {
    200: {
      description: 'Tournament state',
      content: { 'application/json': { schema: TournamentSchema } },
    },
    404: {
      description: 'Tournament does not exist',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Invalid id',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

tournamentRoutes.openapi(getRoute, async (c) => {
  const { id } = c.req.valid('param');
  const client = getPublicClient();

  const t = await client.readContract({
    address: TOURNAMENT_POOL_V21_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: 'getTournament',
    args: [id as `0x${string}`],
  });

  // The mapping returns a zero-filled struct for unknown ids. Treat
  // sponsor === 0x0 + endsAt === 0 as "not found" — both must be zero so
  // we don't false-negative a degenerate but valid tournament.
  if (
    t.sponsor === '0x0000000000000000000000000000000000000000' &&
    t.endsAt === 0n
  ) {
    throw new ApiError(404, 'NOT_FOUND', `Tournament ${id} does not exist`);
  }

  return c.json(
    {
      id,
      sponsor: t.sponsor,
      game: decodeGame(t.game),
      cycleType: Number(t.cycleType),
      startsAt: Number(t.startsAt),
      endsAt: Number(t.endsAt),
      prizePool: t.prizePool.toString(),
      participationBonus: t.participationBonus.toString(),
      settled: t.settled,
      participantsCount: t.participants.length,
    },
    200,
  );
});

// ─── GET /v1/tournaments/:id/leaderboard ──────────────────────────────────

const leaderboardRoute = createRoute({
  method: 'get',
  path: '/v1/tournaments/{id}/leaderboard',
  summary: 'Score history for a tournament',
  description:
    'All ScoreSubmitted events for the tournament, sorted by score descending (block number ascending as tiebreaker). Each row represents one submission, not best-per-player.',
  tags: ['tournaments'],
  request: {
    params: z.object({ id: Bytes32HexSchema }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'Leaderboard page',
      content: { 'application/json': { schema: LeaderboardResponseSchema } },
    },
    422: {
      description: 'Invalid params',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

tournamentRoutes.openapi(leaderboardRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { cursor, limit } = c.req.valid('query');
  const client = getPublicClient();

  const events = await scanContractEvents<ScoreSubmittedRow>({
    address: TOURNAMENT_POOL_V21_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    eventName: 'ScoreSubmitted',
    args: { id: id as `0x${string}` },
  });

  // Score desc, then earliest submission wins ties.
  const sorted = [...events].sort((a, b) => {
    const sA = a.args.score ?? 0n;
    const sB = b.args.score ?? 0n;
    if (sA !== sB) return Number(sB - sA);
    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber);
    return a.logIndex - b.logIndex;
  });

  const start = decodeIndexCursor(cursor) ?? 0;
  const slice = sorted.slice(start, start + limit);

  // Resolve block timestamps in one batch — viem's getBlock is one RPC each
  // but we can dedupe by block number first. For typical pages (~20 entries
  // mostly within the same few blocks during settlement windows) this is
  // bounded and fast.
  const uniqueBlocks = [...new Set(slice.map((e) => e.blockNumber))];
  const blockTimes = new Map<bigint, number>();
  await Promise.all(
    uniqueBlocks.map(async (bn) => {
      const block = await client.getBlock({ blockNumber: bn });
      blockTimes.set(bn, Number(block.timestamp));
    }),
  );

  const items: LeaderboardEntry[] = slice.map((ev, i) => ({
    rank: start + i + 1,
    player: ev.args.player!,
    score: (ev.args.score ?? 0n).toString(),
    blockNumber: Number(ev.blockNumber),
    transactionHash: ev.transactionHash,
    timestamp: blockTimes.get(ev.blockNumber) ?? 0,
  }));

  const next =
    start + limit < sorted.length ? encodeIndexCursor(start + limit) : undefined;

  return c.json(
    { tournamentId: id, items, pagination: next ? { next } : {} },
    200,
  );
});
