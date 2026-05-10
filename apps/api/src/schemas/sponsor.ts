import { z } from 'zod';
import {
  Bytes32HexSchema,
  PaginationResponseSchema,
  Uint256StringSchema,
  WalletAddressSchema,
} from './common.js';

export const SponsorReceiptSchema = z
  .object({
    tokenId: Uint256StringSchema.openapi({
      description: 'ERC-5192 SBT tokenId. Soulbound — never transfers out.',
    }),
    tournamentId: Bytes32HexSchema,
    sponsor: WalletAddressSchema.openapi({
      description: 'Receipt owner. Same as path :wallet.',
    }),
    amount: Uint256StringSchema.openapi({
      description: 'Sponsorship contribution (USDC, 6 decimals).',
    }),
    blockNumber: z.number().int(),
    transactionHash: Bytes32HexSchema,
    timestamp: z.number().int(),
  })
  .openapi('SponsorReceipt');

export const SponsorReceiptsResponseSchema = z
  .object({
    wallet: WalletAddressSchema,
    items: z.array(SponsorReceiptSchema),
    pagination: PaginationResponseSchema,
  })
  .openapi('SponsorReceiptsResponse');

export type SponsorReceipt = z.infer<typeof SponsorReceiptSchema>;
