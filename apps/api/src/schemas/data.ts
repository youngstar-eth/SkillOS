import { z } from '@hono/zod-openapi';
import {
  Bytes32HexSchema,
  Uint256StringSchema,
  WalletAddressSchema,
} from './common.js';

// ─── /v1/data/match-replay/:id ────────────────────────────────────────────
//
// T2 tier payload: tournament submission events with score/seed/duration.
// Phase 1 is a stubbed sample — the structure mirrors what live data would
// look like once the indexer fan-out lands. Real per-submission event data
// is post-Phase 2 (requires the indexer to capture per-submission seed +
// duration alongside ScoreSubmitted log entries).

export const MatchReplayEntrySchema = z
  .object({
    submissionIndex: z.number().int().nonnegative().openapi({
      description: 'Ordinal index within the tournament (zero-based).',
      example: 0,
    }),
    player: WalletAddressSchema,
    score: Uint256StringSchema,
    seed: Bytes32HexSchema,
    durationMs: z.number().int().nonnegative().openapi({
      description: 'Game duration in milliseconds.',
      example: 47213,
    }),
    blockNumber: z.number().int().nonnegative().openapi({
      description: 'On-chain block number for the ScoreSubmitted event.',
      example: 12345678,
    }),
    transactionHash: Bytes32HexSchema,
    timestamp: z.number().int().nonnegative().openapi({
      description: 'Unix seconds at block timestamp.',
      example: 1715000000,
    }),
  })
  .openapi('MatchReplayEntry');

export const MatchReplayResponseSchema = z
  .object({
    tournamentId: Bytes32HexSchema,
    tier: z.literal('T2').openapi({
      description: 'Quality tier (score + seed + duration; replay-verifiable).',
    }),
    entries: z.array(MatchReplayEntrySchema),
    sampleData: z.boolean().openapi({
      description:
        'True while Phase 1 stub is served; flips to false once the indexer captures per-submission seed + duration.',
      example: true,
    }),
  })
  .openapi('MatchReplay');

export type MatchReplayResponse = z.infer<typeof MatchReplayResponseSchema>;

// ─── /v1/data/cohort-snapshot ─────────────────────────────────────────────
//
// T3 tier payload: aggregated cross-tournament statistics. Phase 1 is a
// stubbed sample; real aggregation is post-Phase 2 (requires Materialised
// View over v2_tournaments + v2_submissions).

export const CohortGameStatsSchema = z
  .object({
    game: z.string().openapi({ description: 'Game slug.', example: '2048' }),
    participants: z.number().int().nonnegative().openapi({ example: 412 }),
    submissions: z.number().int().nonnegative().openapi({ example: 1837 }),
    medianScore: Uint256StringSchema,
    p90Score: Uint256StringSchema,
  })
  .openapi('CohortGameStats');

export const CohortSnapshotResponseSchema = z
  .object({
    snapshotAt: z.number().int().nonnegative().openapi({
      description: 'Unix seconds for the snapshot cut-off.',
      example: 1715000000,
    }),
    tier: z.literal('T3').openapi({
      description: 'Quality tier (aggregated cohort statistics).',
    }),
    totals: z
      .object({
        tournaments: z.number().int().nonnegative().openapi({ example: 24 }),
        participants: z.number().int().nonnegative().openapi({ example: 1183 }),
        submissions: z.number().int().nonnegative().openapi({ example: 5921 }),
        agentSubmissions: z
          .number()
          .int()
          .nonnegative()
          .openapi({ example: 612 }),
      })
      .openapi('CohortTotals'),
    byGame: z.array(CohortGameStatsSchema),
    sampleData: z.boolean().openapi({
      description:
        'True while Phase 1 stub is served; flips to false once the v2_submissions materialised view lands.',
      example: true,
    }),
  })
  .openapi('CohortSnapshot');

export type CohortSnapshotResponse = z.infer<typeof CohortSnapshotResponseSchema>;

// ─── 402 paymentRequirements shape (for OpenAPI documentation only) ───────
//
// The middleware short-circuits before our handler runs, so this schema is
// never executed — it exists purely so the OpenAPI spec accurately describes
// the 402 response shape that the library emits.

export const X402PaymentRequirementsSchema = z
  .object({
    x402Version: z.number().int().openapi({ example: 2 }),
    error: z.string().optional().openapi({ example: 'Payment required' }),
    resource: z
      .object({
        url: z.string().openapi({
          description: 'Fully-qualified URL of the requested resource.',
        }),
        description: z.string().openapi({
          example: 'Tournament match event replay (T2 tier data).',
        }),
        mimeType: z.string().openapi({ example: 'application/json' }),
      })
      .openapi('X402Resource'),
    accepts: z.array(
      z.object({
        scheme: z.string().openapi({ example: 'exact' }),
        network: z.string().openapi({ example: 'eip155:84532' }),
        amount: z.string().openapi({
          description: 'USDC amount in atomic units (6 decimals).',
          example: '10000',
        }),
        asset: WalletAddressSchema.openapi({
          description: 'USDC contract address for the chosen network.',
          example: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        }),
        payTo: WalletAddressSchema,
        maxTimeoutSeconds: z.number().int().openapi({ example: 300 }),
        extra: z.record(z.string(), z.unknown()).optional().openapi({
          description: 'Scheme-specific extras (e.g., EIP-712 name + version).',
        }),
      }),
    ),
  })
  .openapi('X402PaymentRequirements');
