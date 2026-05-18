// X23.3 — Rating API endpoints per docs/sprints/x23-glicko-2/SPEC.md §E.
//
// Read-only public surface over v2_player_ratings + v2_player_rating_history.
// Writes are owned by the X23.2 cron handler (single-writer invariant). No
// bearer auth — ratings are public-by-default per X23 SPEC §J.3.
//
// Pattern conventions match apps/api/src/routes/scores.ts:
//   - decodeIndexCursor/encodeIndexCursor opaque cursor (lib/pagination.ts)
//   - check() rate-limit (60 req/min/key — module-level constant in lib/rate-limit.ts)
//     SPEC §E.3 suggests 60–120/min per endpoint; the existing lib uses 60/min for
//     all keys, which satisfies the lower bound. Bumping to per-endpoint limits is
//     a lib refactor with cross-cutting blast radius — deferred to Phase 2 polish.
//   - getSupabaseClient() service-role read (bypasses RLS; anon SELECT policy
//     exists at DB level too for SDK / external direct-Supabase consumers)

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  decodeIndexCursor,
  encodeIndexCursor,
} from '../lib/pagination.js';
import { check as rateLimit } from '../lib/rate-limit.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { ApiError } from '../middleware/errorEnvelope.js';
import {
  ErrorEnvelopeSchema,
  WalletAddressSchema,
} from '../schemas/common.js';
import {
  HistoryQuerySchema,
  HistoryResponseSchema,
  LeaderboardQuerySchema,
  LeaderboardResponseSchema,
  RatingsResponseSchema,
} from '../schemas/rating.js';

// defaultHook remaps Hono OpenAPI's default 400-on-validation-fail to 422
// (correct semantics for malformed-but-well-formed-request) and shapes the
// payload into the canonical ErrorEnvelope so SDK consumers can rely on a
// single error format across rating endpoints.
export const ratingRoutes = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'INVALID_PARAMS',
            message: 'Request validation failed',
            details: result.error.issues,
          },
        },
        422,
      );
    }
  },
});

// ─── Pure helpers (extracted for unit-testability) ────────────────────────

// Each *Row type is the shape returned by the Supabase .select() projection;
// kept narrow so the mapper signature shows what columns are actually read.

export interface RatingRow {
  game: string;
  class: string;
  rating: number | string;
  rd: number | string;
  volatility: number | string;
  updates_count: number;
  updated_at: string | null;
}

export interface LeaderboardRow {
  wallet: string;
  rating: number | string;
  rd: number | string;
  volatility: number | string;
  updated_at: string;
}

export interface HistoryRow {
  game: string;
  class: string;
  rating_before: number | string;
  rating_after: number | string;
  rd_before: number | string;
  rd_after: number | string;
  tournament_id: string | null;
  matches_count: number;
  recorded_at: string;
}

export function rowToRatingEntry(r: RatingRow) {
  return {
    game: r.game,
    class: r.class as 'human' | 'agent',
    rating: Number(r.rating),
    rd: Number(r.rd),
    volatility: Number(r.volatility),
    updatesCount: Number(r.updates_count),
    lastUpdate: r.updated_at,
  };
}

export function rowToLeaderboardItem(r: LeaderboardRow, rank: number) {
  return {
    rank,
    wallet: r.wallet,
    rating: Number(r.rating),
    rd: Number(r.rd),
    volatility: Number(r.volatility),
    lastUpdate: r.updated_at,
  };
}

export function rowToHistoryItem(r: HistoryRow) {
  return {
    game: r.game,
    class: r.class as 'human' | 'agent',
    ratingBefore: Number(r.rating_before),
    ratingAfter: Number(r.rating_after),
    rdBefore: Number(r.rd_before),
    rdAfter: Number(r.rd_after),
    tournamentId: r.tournament_id,
    matchesCount: Number(r.matches_count),
    recordedAt: r.recorded_at,
  };
}

// Pagination: fetched limit+1 to peek for next-page existence. Trim to limit
// and emit a cursor only if a peeked-extra row was returned.
export function paginateRows<T>(
  rows: T[],
  limit: number,
  start: number,
): { slice: T[]; next: string | undefined } {
  const hasMore = rows.length > limit;
  return {
    slice: rows.slice(0, limit),
    next: hasMore ? encodeIndexCursor(start + limit) : undefined,
  };
}

// IP-based rate-limit key for public read endpoints. Vercel functions forward
// the client IP via x-forwarded-for; first comma-token is the originating
// client (subsequent tokens are upstream proxies).
function rateLimitKey(c: { req: { header: (k: string) => string | undefined } }, scope: string): string {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  return `ratings:${scope}:${ip}`;
}

function enforceRateLimit(
  c: { req: { header: (k: string) => string | undefined }; header: (k: string, v: string) => void },
  scope: string,
): void {
  const result = rateLimit(rateLimitKey(c, scope));
  if (!result.allowed) {
    c.header('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)));
    throw new ApiError(
      400,
      'RATE_LIMITED',
      'Per-IP rate limit exceeded (60 requests/minute)',
    );
  }
}

// Route registration order matters: the leaderboard route's static path
// `/v1/ratings/leaderboard` must register BEFORE the `/v1/ratings/{wallet}`
// dynamic route so Hono's radix tree resolves the static match first.
// Otherwise the WalletAddressSchema validator rejects "leaderboard" as a
// malformed wallet and 422s the request before the leaderboard handler runs.

// ─── GET /v1/ratings/leaderboard ───────────────────────────────────────────

const leaderboardRoute = createRoute({
  method: 'get',
  path: '/v1/ratings/leaderboard',
  summary: 'Top-N ratings within a (game, class) cohort',
  description:
    'Cursor-paginated leaderboard. Rank field is 1-indexed and stable across pages — rank 1 is the global top of the cohort. Cursored responses are NOT cached (per X23 SPEC §E.4).',
  tags: ['ratings'],
  request: {
    query: LeaderboardQuerySchema,
  },
  responses: {
    200: {
      description: 'Leaderboard page',
      content: { 'application/json': { schema: LeaderboardResponseSchema } },
    },
    400: {
      description: 'Rate limit exceeded',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Invalid query',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

ratingRoutes.openapi(leaderboardRoute, async (c) => {
  enforceRateLimit(c, 'leaderboard');
  const { game, class: classFilter, cursor, limit } = c.req.valid('query');

  const start = decodeIndexCursor(cursor) ?? 0;

  const supabase = getSupabaseClient();
  // Fetch limit+1 rows to peek for next-page existence without a count query.
  const { data, error } = await supabase
    .from('v2_player_ratings')
    .select('wallet, rating, rd, volatility, updated_at')
    .eq('game', game)
    .eq('class', classFilter)
    .order('rating', { ascending: false })
    .order('wallet', { ascending: true })
    .range(start, start + limit);

  if (error) {
    throw new ApiError(500, 'DB_ERROR', error.message);
  }

  const { slice, next } = paginateRows((data ?? []) as LeaderboardRow[], limit, start);
  const rankings = slice.map((r, i) => rowToLeaderboardItem(r, start + i + 1));

  // E.4: cursored views are not edge-cache friendly. Only cache first page.
  if (!cursor) {
    c.header('Cache-Control', 'public, max-age=30, s-maxage=60');
  } else {
    c.header('Cache-Control', 'no-cache');
  }

  return c.json(
    {
      game,
      class: classFilter,
      rankings,
      pagination: next ? { next } : {},
    },
    200,
  );
});

// ─── GET /v1/ratings/{wallet} ──────────────────────────────────────────────

const ratingsRoute = createRoute({
  method: 'get',
  path: '/v1/ratings/{wallet}',
  summary: 'All ratings for a wallet',
  description:
    'Returns every (game, class) rating row for the wallet. Empty array if no ratings have been computed yet. Public read — no auth required.',
  tags: ['ratings'],
  request: {
    params: z.object({ wallet: WalletAddressSchema }),
  },
  responses: {
    200: {
      description: 'Ratings list',
      content: { 'application/json': { schema: RatingsResponseSchema } },
    },
    400: {
      description: 'Rate limit exceeded',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Invalid wallet format',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

ratingRoutes.openapi(ratingsRoute, async (c) => {
  enforceRateLimit(c, 'wallet');
  const { wallet } = c.req.valid('param');

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('v2_player_ratings')
    .select('game, class, rating, rd, volatility, updates_count, updated_at')
    .eq('wallet', wallet)
    .order('game', { ascending: true });

  if (error) {
    throw new ApiError(500, 'DB_ERROR', error.message);
  }

  const ratings = (data ?? []).map((r) => rowToRatingEntry(r as RatingRow));

  // E.4: cache 30s edge / 60s shared. Public endpoint, low write rate.
  c.header('Cache-Control', 'public, max-age=30, s-maxage=60');
  return c.json({ wallet, ratings }, 200);
});

// ─── GET /v1/ratings/history/{wallet} ──────────────────────────────────────

const historyRoute = createRoute({
  method: 'get',
  path: '/v1/ratings/history/{wallet}',
  summary: 'Rating-change audit log for a wallet',
  description:
    'Append-only history of rating updates, newest-first. Optional game + class filters narrow the scope. Audit-friendly: each row carries before/after rating + RD plus the originating tournament_id.',
  tags: ['ratings'],
  request: {
    params: z.object({ wallet: WalletAddressSchema }),
    query: HistoryQuerySchema,
  },
  responses: {
    200: {
      description: 'History page',
      content: { 'application/json': { schema: HistoryResponseSchema } },
    },
    400: {
      description: 'Rate limit exceeded',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Invalid params',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

ratingRoutes.openapi(historyRoute, async (c) => {
  enforceRateLimit(c, 'history');
  const { wallet } = c.req.valid('param');
  const { game, class: classFilter, cursor, limit } = c.req.valid('query');

  const start = decodeIndexCursor(cursor) ?? 0;

  const supabase = getSupabaseClient();
  let query = supabase
    .from('v2_player_rating_history')
    .select(
      'game, class, rating_before, rating_after, rd_before, rd_after, tournament_id, matches_count, recorded_at',
    )
    .eq('wallet', wallet)
    .order('recorded_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + limit);

  if (game) query = query.eq('game', game);
  if (classFilter) query = query.eq('class', classFilter);

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, 'DB_ERROR', error.message);
  }

  const { slice, next } = paginateRows((data ?? []) as HistoryRow[], limit, start);
  const history = slice.map((r) => rowToHistoryItem(r));

  if (!cursor) {
    c.header('Cache-Control', 'public, max-age=30, s-maxage=60');
  } else {
    c.header('Cache-Control', 'no-cache');
  }

  return c.json(
    {
      wallet,
      history,
      pagination: next ? { next } : {},
    },
    200,
  );
});
