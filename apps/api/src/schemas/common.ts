import { z } from 'zod';

export const WalletAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 40-char hex address')
  .openapi({
    description: 'EVM wallet address (checksum or lowercase)',
    example: '0x1234567890abcdef1234567890abcdef12345678',
  });

export const Bytes32HexSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'must be a 0x-prefixed 64-char hex string')
  .openapi({
    description: 'bytes32 hex (e.g., tournament ID, transaction hash)',
    example:
      '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  });

export const Uint256StringSchema = z
  .string()
  .regex(/^[0-9]+$/, 'must be a base-10 non-negative integer string')
  .openapi({
    description: 'uint256 as decimal string (JSON cannot represent BigInt)',
    example: '1000000',
  });

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional().openapi({
    description: 'Opaque cursor from a previous response. Pass back verbatim.',
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .openapi({
      description: 'Items per page (1-50). Defaults to 20.',
      example: 20,
    }),
});

export const PaginationResponseSchema = z.object({
  next: z.string().optional().openapi({
    description: 'Cursor for the next page. Absent when no more results.',
  }),
});

export const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({
        description:
          'Stable machine-readable code (e.g., NOT_FOUND, INVALID_PARAMS, INTERNAL).',
        example: 'NOT_FOUND',
      }),
      message: z.string().openapi({
        description: 'Human-readable description.',
      }),
      details: z.unknown().optional().openapi({
        description: 'Optional structured detail (e.g., Zod issues array).',
      }),
    }),
  })
  .openapi('Error');

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const HealthSchema = z
  .object({
    version: z.string(),
    commit: z.string(),
    uptimeSeconds: z.number(),
    network: z.literal('base-sepolia'),
    chainId: z.literal(84532),
  })
  .openapi('Health');
