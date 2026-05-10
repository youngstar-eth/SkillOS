// Tournaments routes.
//
// Sprint X2 follow-up (2026-05-10): the LIST endpoint reads from the
// Supabase `v2_tournaments` table populated by duel-backend's
// `cron/index-tournaments-created` cron. This retires the chunked event
// scan that worked for X1 but fell apart on Base Sepolia public RPC's
// tightened limits (2000-block max range + aggressive parallel rate limit).
//
// The single-tournament GET endpoint still uses on-chain readContract —
// that's a single RPC call, not a scan, and gives canonical fresh state.
// Leaderboard still uses scanContractEvents — per-tournament filter keeps
// volume bounded.
//
// Closes the long-standing post-YC indexer backlog item for the list path.

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
import { getSupabaseClient } from '../lib/supabase.js';
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

// DB → API field mapping for the list endpoint. cycle_type comes back as
// 'daily' / 'weekly' text; map to the 0/1 enum the on-chain contract uses
// (and that single-tournament GET returns from on-chain).
const CYCLE_TYPE_DB_TO_NUM: Record<string, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
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
  const start = decodeIndexCursor(cursor) ?? 0;

  // Off-by-one safe range: Supabase `range(from, to)` is inclusive, so we
  // request `limit` rows + 1 sentinel to detect "more pages exist".
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('v2_tournaments')
    .select(
      'on_chain_id, game, cycle_type, starts_at, ends_at, prize_pool_usdc, participation_bonus, sponsor_address, settled_at',
    )
    .order('starts_at', { ascending: false })
    .range(start, start + limit); // request limit+1 rows
  if (error) {
    throw new ApiError(502, 'INDEXER_QUERY_FAILED', `v2_tournaments read failed: ${error.message}`);
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const tournaments: Tournament[] = slice.map((r) => ({
    id: r.on_chain_id as `0x${string}`,
    sponsor: r.sponsor_address as `0x${string}`,
    game: r.game,
    cycleType: CYCLE_TYPE_DB_TO_NUM[r.cycle_type] ?? 0,
    startsAt: Math.floor(new Date(r.starts_at).getTime() / 1000),
    endsAt: Math.floor(new Date(r.ends_at).getTime() / 1000),
    // DB stores prize pool as numeric(20,6) USDC; on-chain + API surface
    // is base units (uint256, 6 decimals). Multiply by 1e6, drop fractional.
    prizePool: BigInt(Math.round(Number(r.prize_pool_usdc) * 1_000_000)).toString(),
    participationBonus: String(r.participation_bonus ?? 0),
    settled: r.settled_at !== null,
    // Indexer table doesn't track live participant count. Single-tournament
    // GET returns the canonical on-chain count via readContract.
    participantsCount: 0,
  }));

  const next = hasMore ? encodeIndexCursor(start + limit) : undefined;
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
