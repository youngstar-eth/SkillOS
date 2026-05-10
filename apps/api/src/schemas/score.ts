import { z } from 'zod';
import {
  Bytes32HexSchema,
  PaginationResponseSchema,
  Uint256StringSchema,
  WalletAddressSchema,
} from './common.js';

export const ScoreEntrySchema = z
  .object({
    tournamentId: Bytes32HexSchema,
    player: WalletAddressSchema,
    score: Uint256StringSchema.openapi({
      description: 'Raw submitted score, pre-cap.',
    }),
    matchCountDelta: Uint256StringSchema,
    nonce: Bytes32HexSchema,
    blockNumber: z.number().int(),
    transactionHash: Bytes32HexSchema,
    timestamp: z.number().int().openapi({
      description: 'Unix seconds at block.',
    }),
  })
  .openapi('ScoreEntry');

export const LeaderboardEntrySchema = z
  .object({
    rank: z.number().int().min(1),
    player: WalletAddressSchema,
    score: Uint256StringSchema,
    blockNumber: z.number().int(),
    transactionHash: Bytes32HexSchema,
    timestamp: z.number().int(),
  })
  .openapi('LeaderboardEntry');

export const LeaderboardResponseSchema = z
  .object({
    tournamentId: Bytes32HexSchema,
    items: z.array(LeaderboardEntrySchema),
    pagination: PaginationResponseSchema,
  })
  .openapi('LeaderboardResponse');

export const ScoreHistoryResponseSchema = z
  .object({
    wallet: WalletAddressSchema,
    items: z.array(ScoreEntrySchema),
    pagination: PaginationResponseSchema,
  })
  .openapi('ScoreHistoryResponse');

export type ScoreEntry = z.infer<typeof ScoreEntrySchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
