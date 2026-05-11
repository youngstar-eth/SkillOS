// Paywalled data tier endpoints (Sprint X5).
//
// Auth: x402 protocol — global middleware mounted in app.ts intercepts
// requests to these paths and short-circuits with HTTP 402 +
// `PAYMENT-REQUIRED` header until a valid `PAYMENT-SIGNATURE` header is
// presented. The handlers below only execute on confirmed-paid requests.
//
// Phase 1 returns hash-derived stubbed samples — payload shape is the
// long-term contract; underlying data source is the Phase 2 work item.

import { createHash } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { Bytes32HexSchema, ErrorEnvelopeSchema } from '../schemas/common.js';
import {
  CohortSnapshotResponseSchema,
  MatchReplayResponseSchema,
  X402PaymentRequirementsSchema,
  type CohortSnapshotResponse,
  type MatchReplayResponse,
} from '../schemas/data.js';

export const dataRoutes = new OpenAPIHono();

// ─── helpers ──────────────────────────────────────────────────────────────

const PRNG_FROM_ID = (id: string, salt: string): () => number => {
  // Deterministic mulberry32 seeded off the tournament id + salt. Lets
  // every (id, salt) pair produce its own plausible-but-fake sample stream.
  const digest = createHash('sha256').update(id + ':' + salt).digest();
  let state = digest.readUInt32BE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hexFromBytes = (rand: () => number, bytes: number): `0x${string}` => {
  let out = '0x';
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(rand() * 256).toString(16).padStart(2, '0');
  }
  return out as `0x${string}`;
};

// ─── GET /v1/data/match-replay/:id (T2, $0.01 USDC) ───────────────────────

const matchReplayRoute = createRoute({
  method: 'get',
  path: '/v1/data/match-replay/{id}',
  summary: 'Tournament match replay (paywalled, T2 tier)',
  description:
    'Returns per-submission event entries for a tournament — score, seed, duration, on-chain anchor. Replay-verifiable. Costs $0.01 USDC on Base Sepolia via x402; unauthenticated requests receive HTTP 402 with the payment requirements in the `PAYMENT-REQUIRED` response header. Phase 1 returns a hash-derived stubbed sample (`sampleData: true`); shape is the long-term contract.',
  tags: ['data'],
  security: [{ x402Payment: [] }],
  request: { params: z.object({ id: Bytes32HexSchema }) },
  responses: {
    200: {
      description: 'Paid request — match replay payload',
      content: { 'application/json': { schema: MatchReplayResponseSchema } },
      headers: z.object({
        'X-SkillOS-Tier': z.literal('T2'),
        'X-SkillOS-Verification': z.literal('x402'),
      }),
    },
    402: {
      description:
        'Payment required. Body is empty per x402 v2; payment requirements are encoded in the `PAYMENT-REQUIRED` response header (base64-encoded JSON matching X402PaymentRequirements).',
      content: {
        'application/json': { schema: X402PaymentRequirementsSchema },
      },
    },
    422: {
      description: 'Invalid tournament id',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

dataRoutes.openapi(matchReplayRoute, (c) => {
  const { id } = c.req.valid('param');

  const rand = PRNG_FROM_ID(id, 'match-replay');
  const entryCount = 5 + Math.floor(rand() * 11); // 5-15 entries
  const baseBlock = 12_000_000 + Math.floor(rand() * 1_000_000);
  const baseTimestamp = 1_715_000_000 + Math.floor(rand() * 5_000_000);

  const entries: MatchReplayResponse['entries'] = [];
  for (let i = 0; i < entryCount; i++) {
    entries.push({
      submissionIndex: i,
      player: hexFromBytes(rand, 20),
      score: String(50 + Math.floor(rand() * 5000)),
      seed: hexFromBytes(rand, 32),
      durationMs: 15_000 + Math.floor(rand() * 240_000),
      blockNumber: baseBlock + i * 6,
      transactionHash: hexFromBytes(rand, 32),
      timestamp: baseTimestamp + i * 12,
    });
  }

  c.header('X-SkillOS-Tier', 'T2');
  c.header('X-SkillOS-Verification', 'x402');

  return c.json(
    {
      tournamentId: id,
      tier: 'T2' as const,
      entries,
      sampleData: true,
    },
    200,
  );
});

// ─── GET /v1/data/cohort-snapshot (T3, $0.10 USDC) ────────────────────────

const cohortSnapshotRoute = createRoute({
  method: 'get',
  path: '/v1/data/cohort-snapshot',
  summary: 'Aggregated cohort snapshot (paywalled, T3 tier)',
  description:
    'Cross-tournament aggregated statistics — totals, per-game breakdown, agent vs human submission split. Costs $0.10 USDC on Base Sepolia via x402; unauthenticated requests receive HTTP 402 with the payment requirements in the `PAYMENT-REQUIRED` response header. Phase 1 returns a fixed plausible sample (`sampleData: true`); shape is the long-term contract.',
  tags: ['data'],
  security: [{ x402Payment: [] }],
  responses: {
    200: {
      description: 'Paid request — cohort snapshot payload',
      content: { 'application/json': { schema: CohortSnapshotResponseSchema } },
      headers: z.object({
        'X-SkillOS-Tier': z.literal('T3'),
        'X-SkillOS-Verification': z.literal('x402'),
      }),
    },
    402: {
      description:
        'Payment required. Body is empty per x402 v2; payment requirements are encoded in the `PAYMENT-REQUIRED` response header (base64-encoded JSON matching X402PaymentRequirements).',
      content: {
        'application/json': { schema: X402PaymentRequirementsSchema },
      },
    },
  },
});

const COHORT_SAMPLE: CohortSnapshotResponse = {
  snapshotAt: 1_715_040_000,
  tier: 'T3',
  totals: {
    tournaments: 24,
    participants: 1_183,
    submissions: 5_921,
    agentSubmissions: 612,
  },
  byGame: [
    { game: '2048', participants: 412, submissions: 1_837, medianScore: '1276', p90Score: '4892' },
    { game: 'wordle', participants: 287, submissions: 1_104, medianScore: '4', p90Score: '6' },
    { game: 'sudoku', participants: 198, submissions: 743, medianScore: '218', p90Score: '491' },
    { game: 'minesweeper', participants: 156, submissions: 612, medianScore: '94', p90Score: '274' },
    { game: 'match3', participants: 84, submissions: 952, medianScore: '3680', p90Score: '11240' },
    { game: 'clicker', participants: 46, submissions: 673, medianScore: '8421', p90Score: '24180' },
  ],
  sampleData: true,
};

dataRoutes.openapi(cohortSnapshotRoute, (c) => {
  c.header('X-SkillOS-Tier', 'T3');
  c.header('X-SkillOS-Verification', 'x402');
  return c.json(COHORT_SAMPLE, 200);
});
