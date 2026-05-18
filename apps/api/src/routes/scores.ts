import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { randomBytes } from 'node:crypto';
import { type Hex, BaseError, ContractFunctionRevertedError } from 'viem';
import {
  ErrorEnvelopeSchema,
  PaginationQuerySchema,
  WalletAddressSchema,
} from '../schemas/common.js';
import {
  ScoreHistoryResponseSchema,
  type ScoreEntry,
} from '../schemas/score.js';
import {
  ScoreSubmitRequestSchema,
  ScoreSubmitResponseSchema,
} from '../schemas/auth.js';
import {
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V21_ADDRESS,
} from '../lib/contracts.js';
import { signSoloSubmitAttestation } from '../lib/contracts-vendored/attestation.js';
import { getWalletClient } from '../lib/contracts-vendored/wallet-client.js';
import {
  decodeIndexCursor,
  encodeIndexCursor,
} from '../lib/pagination.js';
import { scanContractEvents } from '../lib/scan.js';
import { getPublicClient } from '../lib/viem.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { ApiError } from '../middleware/errorEnvelope.js';
import { requireBearer } from '../middleware/bearer.js';
import { check as rateLimit } from '../lib/rate-limit.js';

type ScoreSubmittedRow = {
  args: {
    id?: `0x${string}`;
    player?: `0x${string}`;
    score?: bigint;
    matchCountDelta?: bigint;
    nonce?: `0x${string}`;
  };
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
};

export const scoreRoutes = new OpenAPIHono();

const route = createRoute({
  method: 'get',
  path: '/v1/scores/{wallet}',
  summary: 'Score submissions by wallet',
  description:
    'All ScoreSubmitted events where player == :wallet, across every tournament. Sorted newest-first.',
  tags: ['scores'],
  request: {
    params: z.object({ wallet: WalletAddressSchema }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'Score history page',
      content: {
        'application/json': { schema: ScoreHistoryResponseSchema },
      },
    },
    422: {
      description: 'Invalid params',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

scoreRoutes.openapi(route, async (c) => {
  const { wallet } = c.req.valid('param');
  const { cursor, limit } = c.req.valid('query');
  const client = getPublicClient();

  const events = await scanContractEvents<ScoreSubmittedRow>({
    address: TOURNAMENT_POOL_V21_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    eventName: 'ScoreSubmitted',
    args: { player: wallet as `0x${string}` },
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

  const items: ScoreEntry[] = slice.map((ev) => ({
    tournamentId: ev.args.id!,
    player: ev.args.player!,
    score: (ev.args.score ?? 0n).toString(),
    matchCountDelta: (ev.args.matchCountDelta ?? 0n).toString(),
    nonce: ev.args.nonce!,
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

// ─── POST /v1/scores ──────────────────────────────────────────────────────
//
// Trust tier (per project_phase2_mainnet_blocker_plausibility memory):
//   T0 only — server signs whatever score the bearer-authenticated wallet
//   claims, no AI plausibility validation. External devs / agents using
//   this path operate at lower trust tier intentionally; game-app frontends
//   keep using their own backend (with plausibility) via duel-backend's
//   Next.js handlers. Pre-mainnet hard blocker: T1+ verification before
//   real-USDC tournaments can route through this endpoint.
//
// Response headers make the trust tier explicit to consumers (SDK X3, MCP X6):
//   X-SkillOS-Tier: T0
//   X-SkillOS-Verification: signature-only

const submitRoute = createRoute({
  method: 'post',
  path: '/v1/scores',
  summary: 'Submit a score (T0 signature-only or T1+ class-enforced agent submit)',
  description:
    'Bearer-authenticated. Server signs a submitSoloScore attestation with STUDIO_PRIVATE_KEY and broadcasts on-chain (fire-and-forget; tx hash returned before block inclusion). T0 is signature-only (no plausibility, no DB persistence). T1+ (X14.0) lifts the prior 501 mainnet-blocker by enforcing tournament-class declaration off-chain (supplement v1.5 §3.16) and persisting the run to v2_tournament_solo_runs with class_tag=agent. Game-app frontends continue using their own per-game /api/tournaments/[id]/solo backends for human submissions with AI plausibility checks.',
  tags: ['scores'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: ScoreSubmitRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Submission broadcast on-chain',
      content: { 'application/json': { schema: ScoreSubmitResponseSchema } },
      headers: z.object({
        'X-SkillOS-Tier': z.enum(['T0', 'T1', 'T2', 'T3']),
        'X-SkillOS-Verification': z.enum(['signature-only', 'class-enforced']),
      }),
    },
    400: {
      description: 'Bearer or input invalid',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    403: {
      description:
        'Class mismatch — tournament is declared human-only and rejects agent submissions (X14.0 off-chain enforcement).',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    404: {
      description: 'Tournament not found by on_chain_id (T1+ only — T0 path does not read DB).',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    409: {
      description: 'Tournament settled (T1+) or on-chain submitSoloScore reverted.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    429: {
      description: 'Rate limit exceeded (60/min per wallet)',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

scoreRoutes.use('/v1/scores', requireBearer());
scoreRoutes.openapi(submitRoute, async (c) => {
  const wallet = c.get('walletAddress');

  const limited = rateLimit(`scores:${wallet.toLowerCase()}`);
  if (!limited.allowed) {
    c.header('X-RateLimit-Reset', String(Math.floor(limited.resetAt / 1000)));
    throw new ApiError(
      400,
      'RATE_LIMITED',
      'Per-wallet rate limit exceeded (60 requests/minute)',
    );
  }

  const body = c.req.valid('json');

  // X14.0 T1+ lift — closes memory project_phase2_mainnet_blocker_plausibility.
  // T0 stays signature-only (no DB read, no class enforcement). T1+ reads
  // the tournament row by on_chain_id and enforces off-chain class declaration
  // per supplement v1.5 §3.16. The contract layer remains class-agnostic.
  let tournamentDbId: string | null = null;
  if (body.tier !== 'T0') {
    const supabase = getSupabaseClient();
    const { data: tRow, error: tErr } = await supabase
      .from('v2_tournaments')
      .select('id, tournament_class, settled_at')
      .eq('on_chain_id', body.tournamentId)
      .maybeSingle();
    if (tErr) {
      throw new ApiError(500, 'DB_ERROR', tErr.message);
    }
    if (!tRow) {
      throw new ApiError(
        404,
        'TOURNAMENT_NOT_FOUND',
        `No tournament with on_chain_id=${body.tournamentId}`,
      );
    }
    if (tRow.settled_at) {
      throw new ApiError(
        409,
        'TOURNAMENT_SETTLED',
        'Tournament already settled; submissions are closed.',
      );
    }
    // /v1/scores T1+ caller is treated as agent-class (per spec — SDK + MCP
    // consumers operate at the higher tier). Reject only on human-only pools.
    if (tRow.tournament_class === 'human-only') {
      throw new ApiError(
        403,
        'class_mismatch',
        'Tournament is human-only; agent submission rejected.',
      );
    }
    tournamentDbId = tRow.id as string;
  }

  const soloRunId: Hex = (body.soloRunId as Hex | undefined) ??
    (`0x${randomBytes(32).toString('hex')}` as Hex);
  const onChainNonce = `0x${randomBytes(32).toString('hex')}` as Hex;

  const signature = await signSoloSubmitAttestation({
    tournamentId: body.tournamentId as Hex,
    player: wallet,
    score: BigInt(body.score),
    soloRunId,
    matchCountDelta: BigInt(body.matchCountDelta),
    nonce: onChainNonce,
  });

  const walletClient = getWalletClient();
  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      address: TOURNAMENT_POOL_V21_ADDRESS,
      abi: TOURNAMENT_POOL_ABI,
      functionName: 'submitSoloScore',
      args: [
        body.tournamentId as Hex,
        wallet,
        BigInt(body.score),
        soloRunId,
        BigInt(body.matchCountDelta),
        onChainNonce,
        signature,
      ],
    });
  } catch (err) {
    // Surface contract-revert reasons as actionable client errors. The
    // ContractFunctionRevertedError nests inside a wrapping BaseError; the
    // walk-cause traversal handles both shapes.
    if (err instanceof BaseError) {
      const reverted = err.walk(
        (e) => e instanceof ContractFunctionRevertedError,
      );
      if (reverted instanceof ContractFunctionRevertedError) {
        const errorName = reverted.data?.errorName ?? 'Unknown';
        throw new ApiError(
          409,
          `CHAIN_REVERT_${errorName}`,
          `submitSoloScore reverted on-chain: ${errorName}`,
        );
      }
    }
    throw err;
  }

  // X14.0: T1+ persists to v2_tournament_solo_runs with agent class.
  // Best-effort post-broadcast — DB failure does NOT roll back the chain
  // submit (reconcile cron will pick up the row later from chain events).
  if (body.tier !== 'T0' && tournamentDbId) {
    try {
      const supabase = getSupabaseClient();
      const { error: insertErr } = await supabase
        .from('v2_tournament_solo_runs')
        .insert({
          tournament_id: tournamentDbId,
          player_address: wallet,
          score: body.score,
          is_paid_retry: false,
          fee_paid_usdc: 0,
          fee_tx_hash: null,
          is_agent: true,
          class_tag: 'agent',
        });
      if (insertErr) {
        console.error('[/v1/scores T1+] solo_runs persist failed', insertErr);
      }
    } catch (persistErr) {
      console.error('[/v1/scores T1+] solo_runs persist threw', persistErr);
    }
  }

  c.header('X-SkillOS-Tier', body.tier);
  c.header(
    'X-SkillOS-Verification',
    body.tier === 'T0' ? 'signature-only' : 'class-enforced',
  );
  return c.json(
    {
      txHash,
      soloRunId,
      submittedAt: new Date().toISOString(),
      tier: body.tier,
      ...(body.tier !== 'T0'
        ? { isAgent: true, classTag: 'agent' as const }
        : {}),
    },
    200,
  );
});
