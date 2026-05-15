// /v1/agents/matches/* — Sprint X20 spectator demo + X15 paid retries.
//
// X20 shipped one route: POST /v1/agents/matches/start-solo. Public (no
// auth) for the testnet demo era; X21 adds SIWA + matchmaker queue
// routes.
//
// X15.6 inverts the previously-synchronous flow: the handler reserves a
// duel_runs row, inserts a pending x15_payment_attempts row, returns
// 202 + runId immediately, and orchestrates x402 settlement + on-chain
// chargeRetryFee + run loop in a single waitUntil-tracked background
// worker. The apex spectator UI subscribes to Realtime on both
// duel_moves (move-by-move) and x15_payment_attempts (settlement
// progress) keyed on the returned runId.

import type { Address, Hex } from 'viem';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { waitUntil } from '@vercel/functions';
import { ErrorEnvelopeSchema } from '../schemas/common.js';
import {
  SoloMatchStartRequestSchema,
  SoloMatchStartResponseSchema,
} from '../schemas/duels.js';
import { check as rateLimit } from '../lib/rate-limit.js';
import { TOURNAMENT_POOL_ABI } from '../lib/contracts-vendored/abi.js';
import { TOURNAMENT_POOL_V21_ADDRESS } from '../lib/contracts-vendored/addresses.js';
import { chargeRetryFeeIfRequired } from '../lib/duel/charge-retry-fee.js';
import { reserveSoloRun, runSoloMatch } from '../lib/duel/runner.js';
import { BUILDER_CODES } from '../lib/games.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { getPublicClient } from '../lib/viem.js';
import {
  settleX402Payment,
  type SettleX402PaymentResult,
} from '../lib/x402-client.js';
import { ApiError } from '../middleware/errorEnvelope.js';

export const agentMatchesRoutes = new OpenAPIHono();

const APEX_WATCH_BASE_URL =
  process.env.APEX_WATCH_BASE_URL ?? 'https://www.skillbase.games/watch';

const startSoloRoute = createRoute({
  method: 'post',
  path: '/v1/agents/matches/start-solo',
  summary: 'Start a solo agent match (X20 spectator MVP + X15 paid retries)',
  description:
    'Reserves a duel_runs row, inserts a pending x15_payment_attempts row, and returns 202 + runId. The handler does NOT block on x402 settlement or chargeRetryFee — those run in a background worker (waitUntil) along with the actual game loop. Spectator UI subscribes to two Realtime channels on the returned runId: duel_moves for move-by-move state, x15_payment_attempts for settlement progress (pending → x402_settled → anchored/skipped).',
  tags: ['agents'],
  request: {
    body: {
      content: { 'application/json': { schema: SoloMatchStartRequestSchema } },
    },
  },
  responses: {
    202: {
      description:
        'Match reserved; runId returned; x402 + chargeRetryFee + run loop kicked off asynchronously.',
      content: { 'application/json': { schema: SoloMatchStartResponseSchema } },
    },
    429: {
      description: 'Rate-limit exceeded (per-IP soft cap; X20 testnet demo)',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    502: {
      description: 'Reservation failed (database unavailable, signer misconfig)',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

agentMatchesRoutes.openapi(startSoloRoute, async (c) => {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'local';
  const limited = rateLimit(`agent-matches-start-solo:${ip}`);
  if (!limited.allowed) {
    c.header('X-RateLimit-Reset', String(Math.floor(limited.resetAt / 1000)));
    throw new ApiError(
      429,
      'RATE_LIMITED',
      'Per-IP rate limit exceeded — wait before triggering another match.',
    );
  }

  const body = c.req.valid('json');

  let reserved;
  try {
    reserved = await reserveSoloRun({ game: body.game });
  } catch (err) {
    console.error('[agent-matches] reserveSoloRun failed', err);
    throw new ApiError(
      502,
      'RESERVE_FAILED',
      err instanceof Error ? err.message : 'Failed to reserve match',
    );
  }

  const tournamentIdRaw = process.env.X20_DEMO_TOURNAMENT_ID?.trim();
  const tournamentId =
    tournamentIdRaw && tournamentIdRaw.startsWith('0x')
      ? (tournamentIdRaw as Hex)
      : null;

  if (tournamentId) {
    // Production path — full x402 + chargeRetryFee + run loop.
    waitUntil(
      orchestrateAgentRun({
        runId: reserved.runId,
        agentAddress: reserved.agentAddress,
        seed: reserved.seed,
        game: body.game,
        tournamentId,
      }).catch((err) => {
        console.error('[agent-matches] orchestration failed', err);
      }),
    );
  } else {
    // Dev mode — X20_DEMO_TOURNAMENT_ID unset. No x402, no chargeRetryFee.
    // Preserved so local dev + first-deploy stay functional (matches the
    // existing maybeSubmitOnChain skip in runner.ts).
    console.warn(
      '[agent-matches] X20_DEMO_TOURNAMENT_ID unset — dev mode, skipping x402 + chargeRetryFee. ' +
        'submitSoloScore will also skip.',
    );
    waitUntil(
      runSoloMatch({
        runId: reserved.runId,
        seed: reserved.seed,
        game: body.game,
      }).catch((err) => {
        console.error('[agent-matches] dev-mode run failed', err);
      }),
    );
  }

  return c.json(
    {
      runId: reserved.runId,
      seed: reserved.seed,
      agentAddress: reserved.agentAddress,
      watchUrl: `${APEX_WATCH_BASE_URL}/${reserved.runId}`,
      startedAt: new Date().toISOString(),
      status: 'pending' as const,
    },
    202,
  );
});

interface OrchestrateArgs {
  runId: string;
  agentAddress: Address;
  seed: string;
  // X20 ships 2048 only; widen alongside SoloMatchStartRequestSchema when
  // X21+ adds engines. KnownGame is the upstream union but the literal
  // keeps this orchestrator's signature aligned with runSoloMatch.
  game: '2048';
  tournamentId: Hex;
}

/**
 * Background worker for the production path. Order:
 *   1. Read priorSolo from chain (needed for the x15_payment_attempts
 *      NOT NULL column AND to decide whether the on-chain charge step
 *      runs).
 *   2. Insert pending x15_payment_attempts row.
 *   3. settleX402Payment → update status='x402_settled' + tx hash.
 *   4. If priorSolo > 0: chargeRetryFeeIfRequired → wait for receipt →
 *      update status='anchored' + tx hash + block.
 *      Else: update status='skipped' (free-first slot).
 *   5. runSoloMatch (game loop + submitSoloScore at end via X10 wire).
 *
 * Each step short-circuits the next on failure: mark the attempt
 * needs_manual_review, mark duel_runs.status='error', and return.
 * The agent's x402 USDC is NOT refunded on failure — operator
 * reconciles manually (X16 will automate).
 */
async function orchestrateAgentRun(args: OrchestrateArgs): Promise<void> {
  const sb = getSupabaseClient();
  const publicClient = getPublicClient();

  // ─── Step 1: read priorSolo from chain ────────────────────────────────
  let priorSolo: number;
  try {
    const raw = await publicClient.readContract({
      address: TOURNAMENT_POOL_V21_ADDRESS,
      abi: TOURNAMENT_POOL_ABI,
      functionName: 'soloSubmissionCount',
      args: [args.tournamentId, args.agentAddress],
    });
    priorSolo = Number(raw);
  } catch (err) {
    console.error('[agent-matches] priorSolo read failed', err);
    await markRunErrored(args.runId, err);
    return;
  }

  // ─── Step 2: insert pending x15_payment_attempts row ──────────────────
  let attemptId: string;
  try {
    const { data, error } = await sb
      .from('x15_payment_attempts')
      .insert({
        run_id: args.runId,
        attempt_number: 1,
        agent_address: args.agentAddress.toLowerCase(),
        tournament_id: args.tournamentId,
        prior_solo: priorSolo,
        status: 'pending',
        builder_code: BUILDER_CODES[args.game],
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(
        `x15_payment_attempts insert failed: ${error?.message ?? 'no row returned'}`,
      );
    }
    attemptId = data.id as string;
  } catch (err) {
    console.error('[agent-matches] payment attempt insert failed', err);
    await markRunErrored(args.runId, err);
    return;
  }

  // ─── Step 3: settle x402 ──────────────────────────────────────────────
  let settle: SettleX402PaymentResult;
  try {
    settle = await settleX402Payment({
      runId: args.runId,
      agentAddress: args.agentAddress,
      priorSolo,
    });
  } catch (err) {
    console.error('[agent-matches] x402 settle failed', err);
    await failAttempt(attemptId, 'X402_SETTLE_FAILED', err);
    await markRunErrored(args.runId, err);
    return;
  }
  await sb
    .from('x15_payment_attempts')
    .update({
      status: 'x402_settled',
      x402_tx_hash: settle.x402TxHash,
      x402_amount_atomic: settle.x402AmountAtomic.toString(),
      x402_settled_at: settle.settledAt.toISOString(),
    })
    .eq('id', attemptId);

  // ─── Step 4: on-chain charge or skip ──────────────────────────────────
  if (priorSolo > 0) {
    try {
      const charge = await chargeRetryFeeIfRequired({
        tournamentId: args.tournamentId,
        agentAddress: args.agentAddress,
        runId: args.runId,
        game: args.game,
      });
      if (charge.charged) {
        // X15.3 returns the tx hash without waiting for the receipt; we
        // wait here so charge_block_number lands in the same UPDATE as
        // status='anchored'. Subscribers see one Realtime event for the
        // confirmed state instead of two (anchored-without-block, then
        // anchored-with-block).
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: charge.txHash,
        });
        await sb
          .from('x15_payment_attempts')
          .update({
            status: 'anchored',
            tx_hash: charge.txHash,
            approve_tx_hash: charge.approveTxHash ?? null,
            charge_block_number: Number(receipt.blockNumber),
            charge_confirmed_at: new Date().toISOString(),
          })
          .eq('id', attemptId);
      }
    } catch (err) {
      console.error('[agent-matches] chargeRetryFee failed', err);
      await failAttempt(attemptId, 'CHARGE_RETRY_FEE_FAILED', err);
      await markRunErrored(args.runId, err);
      return;
    }
  } else {
    await sb
      .from('x15_payment_attempts')
      .update({
        status: 'skipped',
        reason: 'free_first_slot',
      })
      .eq('id', attemptId);
  }

  // ─── Step 5: run the game loop ────────────────────────────────────────
  try {
    await runSoloMatch({
      runId: args.runId,
      seed: args.seed,
      game: args.game,
    });
  } catch (err) {
    // runSoloMatch already swallows + marks duel_runs.status='error'
    // internally; this catch is belt-and-suspenders.
    console.error('[agent-matches] runSoloMatch escaped', err);
  }
}

async function failAttempt(
  attemptId: string,
  errorCode: 'X402_SETTLE_FAILED' | 'CHARGE_RETRY_FEE_FAILED',
  err: unknown,
): Promise<void> {
  const sb = getSupabaseClient();
  await sb
    .from('x15_payment_attempts')
    .update({
      status: 'failed',
      error_code: errorCode,
      error_message: truncateErrorMessage(err),
      needs_manual_review: true,
    })
    .eq('id', attemptId);
}

async function markRunErrored(runId: string, err: unknown): Promise<void> {
  const sb = getSupabaseClient();
  try {
    await sb
      .from('duel_runs')
      .update({
        status: 'error',
        error_message: truncateErrorMessage(err),
        ended_at: new Date().toISOString(),
      })
      .eq('id', runId);
  } catch (updateErr) {
    console.error('[agent-matches] failed to mark duel_runs errored', updateErr);
  }
}

function truncateErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err).slice(0, 500);
}
