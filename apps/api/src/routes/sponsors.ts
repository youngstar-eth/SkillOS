import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ErrorEnvelopeSchema,
  PaginationQuerySchema,
  WalletAddressSchema,
} from '../schemas/common.js';
import {
  SponsorReceiptsResponseSchema,
  type SponsorReceipt,
} from '../schemas/sponsor.js';
import {
  SPONSORSHIP_MODULE_ABI,
  SPONSORSHIP_MODULE_ADDRESS,
} from '../lib/contracts.js';
import {
  decodeIndexCursor,
  encodeIndexCursor,
} from '../lib/pagination.js';
import { scanContractEvents } from '../lib/scan.js';
import { getPublicClient } from '../lib/viem.js';

type PoolSponsoredRow = {
  args: {
    tournamentId?: `0x${string}`;
    sponsor?: `0x${string}`;
    amount?: bigint;
    receiptTokenId?: bigint;
  };
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
};

export const sponsorRoutes = new OpenAPIHono();

const route = createRoute({
  method: 'get',
  path: '/v1/sponsors/{wallet}/receipts',
  summary: 'ERC-5192 SBT receipts owned by wallet',
  description:
    'All PoolSponsored events where sponsor == :wallet. Each event corresponds to one soulbound receipt minted to the wallet. Soulbound = receipts are non-transferable, so the event ledger is a complete inventory.',
  tags: ['sponsors'],
  request: {
    params: z.object({ wallet: WalletAddressSchema }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'Sponsor receipts page',
      content: {
        'application/json': { schema: SponsorReceiptsResponseSchema },
      },
    },
    422: {
      description: 'Invalid params',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

sponsorRoutes.openapi(route, async (c) => {
  const { wallet } = c.req.valid('param');
  const { cursor, limit } = c.req.valid('query');
  const client = getPublicClient();

  const events = await scanContractEvents<PoolSponsoredRow>({
    address: SPONSORSHIP_MODULE_ADDRESS,
    abi: SPONSORSHIP_MODULE_ABI,
    eventName: 'PoolSponsored',
    args: { sponsor: wallet as `0x${string}` },
  });

  // Newest first.
  const sorted = [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(b.blockNumber - a.blockNumber);
    return b.logIndex - a.logIndex;
  });

  const start = decodeIndexCursor(cursor) ?? 0;
  const slice = sorted.slice(start, start + limit);

  const uniqueBlocks = [...new Set(slice.map((e) => e.blockNumber))];
  const blockTimes = new Map<bigint, number>();
  await Promise.all(
    uniqueBlocks.map(async (bn) => {
      const block = await client.getBlock({ blockNumber: bn });
      blockTimes.set(bn, Number(block.timestamp));
    }),
  );

  const items: SponsorReceipt[] = slice.map((ev) => ({
    tokenId: (ev.args.receiptTokenId ?? 0n).toString(),
    tournamentId: ev.args.tournamentId!,
    sponsor: ev.args.sponsor!,
    amount: (ev.args.amount ?? 0n).toString(),
    blockNumber: Number(ev.blockNumber),
    transactionHash: ev.transactionHash,
    timestamp: blockTimes.get(ev.blockNumber) ?? 0,
  }));

  const next =
    start + limit < sorted.length ? encodeIndexCursor(start + limit) : undefined;

  return c.json(
    { wallet, items, pagination: next ? { next } : {} },
    200,
  );
});
