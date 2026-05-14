// Agent-endpoint Zod schemas — Sprint X4.

import { z } from 'zod';
import { Bytes32HexSchema, WalletAddressSchema } from './common.js';

// POST /v1/agents/scores — agent-attributed score submission.
// Mirrors ScoreSubmitRequest but the actor is an agent (proven via SIWA
// receipt + ERC-8128 signature), not a SIWB-bearer human.
export const AgentScoreSubmitRequestSchema = z
  .object({
    tournamentId: Bytes32HexSchema,
    game: z
      .enum(['2048', 'wordle', 'sudoku', 'minesweeper', 'clicker', 'match3'])
      .openapi({
        description:
          'Game slug. X10: server uses this to resolve the per-game Builder Code for ERC-8021 dataSuffix attribution on the submitSoloScore broadcast. Required for Path A attribution. Must match the game of the targeted tournamentId — the server does NOT verify this match-up; mis-attribution is the caller risk.',
      }),
    score: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .openapi({
        description:
          'Raw agent score. T0 tier only in v0.1 (signature-only, no plausibility — same constraint as POST /v1/scores).',
      }),
    soloRunId: Bytes32HexSchema.optional().openapi({
      description: 'Client-supplied bytes32; if omitted, server generates random.',
    }),
    matchCountDelta: z
      .number()
      .int()
      .min(0)
      .default(1)
      .openapi({
        description: 'Match count increment (capped at MATCH_COUNT_CAP=10 on-chain).',
      }),
    tier: z
      .enum(['T0', 'T1', 'T2', 'T3'])
      .default('T0')
      .openapi({
        description: 'Quality tier. Sprint X4 supports T0 only — T1+ rejected with 501.',
      }),
  })
  .openapi('AgentScoreSubmitRequest');

export const AgentScoreSubmitResponseSchema = z
  .object({
    txHash: Bytes32HexSchema.openapi({
      description: 'On-chain submitSoloScore broadcast hash (fire-and-forget).',
    }),
    soloRunId: Bytes32HexSchema,
    submittedAt: z.string().datetime(),
    tier: z.literal('T0'),
    agentAddress: WalletAddressSchema.openapi({
      description: 'The verified agent wallet address from the SIWA receipt.',
    }),
    agentId: z.number().int().nonnegative(),
  })
  .openapi('AgentScoreSubmitResponse');

// PATCH /v1/agents/profile — update off-chain agent metadata. The on-chain
// identity (name, description, endpoints, public key) lives in the ERC-8004
// registry; this endpoint is for off-chain caches like display name +
// arbitrary preferences. Persistence is in-memory in X4; Supabase-backed
// in X4.5 (see TODO inline).
export const AgentProfilePatchRequestSchema = z
  .object({
    displayName: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .openapi({ description: 'Off-chain display name (≤64 chars).' }),
    preferences: z
      .record(z.string(), z.unknown())
      .optional()
      .openapi({ description: 'Free-form key/value preferences object.' }),
  })
  .refine(
    (v) => v.displayName !== undefined || v.preferences !== undefined,
    { message: 'At least one of displayName or preferences must be provided' },
  )
  .openapi('AgentProfilePatchRequest');

export const AgentProfileResponseSchema = z
  .object({
    agentId: z.number().int().nonnegative(),
    agentAddress: WalletAddressSchema,
    displayName: z.string().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
    updatedAt: z.string().datetime(),
  })
  .openapi('AgentProfile');
