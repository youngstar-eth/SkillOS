import { z } from 'zod';
import { Bytes32HexSchema, WalletAddressSchema } from './common.js';

export const SiwbNonceRequestSchema = z
  .object({
    walletAddress: WalletAddressSchema,
  })
  .openapi('SiwbNonceRequest');

export const SiwbNonceResponseSchema = z
  .object({
    nonce: z.string().regex(/^[a-f0-9]{32}$/, 'lowercase hex, 32 chars').openapi({
      description:
        'Cryptographic random, 32 lowercase hex chars. Matches Base SIWE nonce regex `\\w{32}$`.',
    }),
    issuedAt: z.string().datetime().openapi({
      description: 'ISO-8601, UTC. Equals server-side `now()` at issuance.',
    }),
    expiresAt: z.string().datetime().openapi({
      description: 'ISO-8601, UTC. issuedAt + 5 minutes.',
    }),
  })
  .openapi('SiwbNonceResponse');

export const SiwbVerifyRequestSchema = z
  .object({
    message: z.string().min(20).openapi({
      description: 'Full SIWE-formatted message (EIP-4361). Server parses + validates.',
    }),
    signature: z
      .string()
      .regex(/^0x[a-fA-F0-9]+$/, 'must be 0x-prefixed hex')
      .openapi({
        description:
          'EIP-191 personal_sign signature. Base Account smart wallets wrap with ERC-6492; viem.verifyMessage handles transparently.',
      }),
    walletAddress: WalletAddressSchema.openapi({
      description: 'Must equal the address inside the SIWE message body.',
    }),
  })
  .openapi('SiwbVerifyRequest');

export const SiwbVerifyResponseSchema = z
  .object({
    token: z.string().openapi({
      description:
        'Bearer JWT (HS256, 24h TTL). Pass as `Authorization: Bearer <token>` to write endpoints.',
    }),
    expiresAt: z.string().datetime().openapi({
      description: 'ISO-8601, UTC. Token expiration.',
    }),
    sessionId: z.string().uuid(),
  })
  .openapi('SiwbVerifyResponse');

// Score-submit shapes for /v1/scores POST.

export const ScoreSubmitRequestSchema = z
  .object({
    tournamentId: Bytes32HexSchema,
    score: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .openapi({
        description:
          'Raw player score. T0 tier: server signs as-is, no plausibility validation.',
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
        description:
          'Match count increment (capped at MATCH_COUNT_CAP=10 on-chain). 1 by default.',
      }),
    tier: z
      .enum(['T0', 'T1', 'T2', 'T3'])
      .default('T0')
      .openapi({
        description:
          'Quality tier per spec. Sprint X2 only validates T0 (signature-only). T1+ rejected with 501.',
      }),
  })
  .openapi('ScoreSubmitRequest');

export const ScoreSubmitResponseSchema = z
  .object({
    txHash: Bytes32HexSchema.openapi({
      description: 'On-chain submitSoloScore broadcast hash. Fire-and-forget — not waited for inclusion.',
    }),
    soloRunId: Bytes32HexSchema,
    submittedAt: z.string().datetime(),
    tier: z.literal('T0').openapi({
      description: 'Confirms the trust tier server applied. Echoed in X-SkillOS-Tier header.',
    }),
  })
  .openapi('ScoreSubmitResponse');
