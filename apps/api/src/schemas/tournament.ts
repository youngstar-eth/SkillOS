import { z } from 'zod';
import {
  Bytes32HexSchema,
  PaginationResponseSchema,
  Uint256StringSchema,
  WalletAddressSchema,
} from './common.js';

export const TournamentSchema = z
  .object({
    id: Bytes32HexSchema,
    sponsor: WalletAddressSchema,
    game: z.string().openapi({
      description:
        'Game slug, decoded from on-chain bytes32. Falls back to hex if not UTF-8 decodable.',
      example: '2048',
    }),
    cycleType: z.number().int().min(0).openapi({
      description: 'Cycle enum (0=daily, 1=weekly, 2=monthly, ...)',
    }),
    startsAt: z.number().int().openapi({
      description: 'Unix seconds, tournament window start.',
    }),
    endsAt: z.number().int().openapi({
      description: 'Unix seconds, tournament window end.',
    }),
    prizePool: Uint256StringSchema.openapi({
      description: 'USDC, 6 decimals (1_000_000 = $1).',
    }),
    participationBonus: Uint256StringSchema,
    settled: z.boolean(),
    participantsCount: z.number().int().min(0),
  })
  .openapi('Tournament');

export const TournamentListResponseSchema = z
  .object({
    items: z.array(TournamentSchema),
    pagination: PaginationResponseSchema,
  })
  .openapi('TournamentListResponse');

export type Tournament = z.infer<typeof TournamentSchema>;
