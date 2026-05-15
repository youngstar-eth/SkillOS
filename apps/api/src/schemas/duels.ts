// Sprint X20 — duel match endpoint schemas.

import { z } from '@hono/zod-openapi';
import { Bytes32HexSchema, WalletAddressSchema } from './common.js';

export const SoloMatchStartRequestSchema = z
  .object({
    game: z.literal('2048').openapi({
      description:
        'Game slug. X20 ships 2048 only; X21+ broadens to other engines as they stabilise their replay-deterministic mode.',
    }),
  })
  .openapi('SoloMatchStartRequest');

export const SoloMatchStartResponseSchema = z
  .object({
    runId: z.string().uuid().openapi({
      description:
        'Supabase duel_runs.id. The watch UI subscribes to channel `duel_match_{runId}` on the duel_moves table.',
    }),
    seed: Bytes32HexSchema.openapi({
      description: 'Deterministic match seed; feeds the engine SeededRng and is replay-verifiable.',
    }),
    agentAddress: WalletAddressSchema.openapi({
      description:
        'The on-chain agent identity for this match. For X20 this is the STUDIO_PRIVATE_KEY-derived server address; X21 provisions fresh per-agent wallets.',
    }),
    watchUrl: z.string().url().openapi({
      description:
        'Canonical apex watch URL. Built from APEX_WATCH_BASE_URL + runId.',
    }),
    startedAt: z.string().datetime(),
    status: z.literal('pending').openapi({
      description:
        'Always "pending" for the 202 response. X15.6: x402 settlement and on-chain chargeRetryFee happen asynchronously after this reply lands; subscribers track progress via the x15_payment_attempts Realtime channel keyed by runId.',
    }),
  })
  .openapi('SoloMatchStartResponse');
