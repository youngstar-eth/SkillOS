import { z } from '@hono/zod-openapi';
import {
  PaginationResponseSchema,
  WalletAddressSchema,
} from './common.js';

// Class enum inherits the X14.0 schema lock (v4_20260518_x14_class.sql) —
// 'human' | 'agent'. Surfaces schema drift in CI if X14 ever broadens its
// domain (per X23 SPEC §C.2 — intentional coupling).
export const ClassEnumSchema = z.enum(['human', 'agent']).openapi({
  description:
    'Participant class declaration. Ratings are partitioned per-(wallet, game, class); cohorts never cross class boundaries.',
  example: 'human',
});

// ─── GET /v1/ratings/{wallet} ──────────────────────────────────────────────

export const RatingEntrySchema = z
  .object({
    game: z.string().openapi({ description: 'Game slug', example: '2048' }),
    class: ClassEnumSchema,
    rating: z.number().openapi({
      description: 'Glicko-2 rating. SkillOS default 1000 (≡ legacy Glicko 1500).',
      example: 1081.9,
    }),
    rd: z.number().openapi({
      description:
        'Rating Deviation. Lower = more confident. SkillOS default 350.',
      example: 312.4,
    }),
    volatility: z.number().openapi({
      description: 'Glicko-2 volatility. SkillOS default 0.06.',
      example: 0.0599,
    }),
    updatesCount: z.number().int().openapi({
      description:
        'Total rating periods applied (denormalized from history log for leaderboard read perf).',
      example: 3,
    }),
    lastUpdate: z
      .string()
      .nullable()
      .openapi({
        description:
          'ISO8601 timestamp of most recent rating update, or null if never updated since row creation.',
        example: '2026-05-18T14:32:00.000Z',
      }),
  })
  .openapi('RatingEntry');

export const RatingsResponseSchema = z
  .object({
    wallet: WalletAddressSchema,
    ratings: z.array(RatingEntrySchema),
  })
  .openapi('RatingsResponse');

// ─── GET /v1/ratings/leaderboard ──────────────────────────────────────────

export const LeaderboardQuerySchema = z.object({
  game: z.string().min(1).openapi({
    description: 'Game slug (required). Example slugs: 2048, wordle, sudoku.',
    example: '2048',
  }),
  class: ClassEnumSchema.openapi({
    description: 'Class to rank within. Required — cohorts never cross classes.',
    param: { name: 'class', in: 'query' },
  }),
  cursor: z.string().optional().openapi({
    description: 'Opaque cursor from previous page. Pass verbatim.',
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .openapi({
      description: 'Items per page (1-500). Defaults to 100.',
      example: 100,
    }),
});

export const LeaderboardItemSchema = z
  .object({
    rank: z.number().int().openapi({
      description:
        '1-indexed rank within the (game, class) cohort. Stable across pages — rank 1 is the global top.',
      example: 1,
    }),
    wallet: WalletAddressSchema,
    rating: z.number(),
    rd: z.number(),
    volatility: z.number(),
    lastUpdate: z.string().openapi({
      description: 'ISO8601 timestamp of most recent rating update.',
    }),
  })
  .openapi('LeaderboardItem');

export const LeaderboardResponseSchema = z
  .object({
    game: z.string(),
    class: ClassEnumSchema,
    rankings: z.array(LeaderboardItemSchema),
    pagination: PaginationResponseSchema,
  })
  .openapi('LeaderboardResponse');

// ─── GET /v1/ratings/history/{wallet} ─────────────────────────────────────

export const HistoryQuerySchema = z.object({
  game: z.string().optional().openapi({
    description: 'Optional game-slug filter. Omit to span all games.',
  }),
  class: ClassEnumSchema.optional().openapi({
    description: 'Optional class filter. Omit to span both classes.',
    param: { name: 'class', in: 'query' },
  }),
  cursor: z.string().optional().openapi({
    description: 'Opaque cursor from previous page. Pass verbatim.',
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({
      description: 'Items per page (1-100). Defaults to 20.',
    }),
});

export const HistoryItemSchema = z
  .object({
    game: z.string(),
    class: ClassEnumSchema,
    ratingBefore: z.number(),
    ratingAfter: z.number(),
    rdBefore: z.number(),
    rdAfter: z.number(),
    tournamentId: z
      .string()
      .uuid()
      .nullable()
      .openapi({
        description:
          'v2_tournaments.id of the tournament that produced this rating change. Nullable — tournament rows can be purged at testnet→mainnet cutover.',
      }),
    matchesCount: z.number().int().openapi({
      description: 'Number of pairwise outcomes applied in this rating period.',
    }),
    recordedAt: z.string().openapi({
      description: 'ISO8601 timestamp when the rating change was recorded.',
    }),
  })
  .openapi('HistoryItem');

export const HistoryResponseSchema = z
  .object({
    wallet: WalletAddressSchema,
    history: z.array(HistoryItemSchema),
    pagination: PaginationResponseSchema,
  })
  .openapi('HistoryResponse');

export type RatingEntry = z.infer<typeof RatingEntrySchema>;
export type LeaderboardItem = z.infer<typeof LeaderboardItemSchema>;
export type HistoryItem = z.infer<typeof HistoryItemSchema>;
