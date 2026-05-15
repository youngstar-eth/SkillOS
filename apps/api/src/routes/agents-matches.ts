// /v1/agents/matches/* — Sprint X20 spectator demo.
//
// X20 ships one route: POST /v1/agents/matches/start-solo. Public (no auth)
// for the testnet demo era; X21 adds SIWA + matchmaker queue routes.
//
// The route is fire-and-forget: insert duel_runs row → return runId →
// c.executionCtx.waitUntil drives the match in the background of the same
// function invocation. The spectator UI subscribes to Supabase Realtime on
// duel_moves and renders moves as they land.

import type { Hex } from 'viem';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { waitUntil } from '@vercel/functions';
import { ErrorEnvelopeSchema } from '../schemas/common.js';
import {
  SoloMatchStartRequestSchema,
  SoloMatchStartResponseSchema,
} from '../schemas/duels.js';
import { check as rateLimit } from '../lib/rate-limit.js';
import { chargeRetryFeeIfRequired } from '../lib/duel/charge-retry-fee.js';
import { reserveSoloRun, runSoloMatch } from '../lib/duel/runner.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { ApiError } from '../middleware/errorEnvelope.js';

export const agentMatchesRoutes = new OpenAPIHono();

const APEX_WATCH_BASE_URL =
  process.env.APEX_WATCH_BASE_URL ?? 'https://www.skillbase.games/watch';

const startSoloRoute = createRoute({
  method: 'post',
  path: '/v1/agents/matches/start-solo',
  summary: 'Start a solo agent match (X20 spectator MVP)',
  description:
    'Reserves a duel_runs row and kicks off an agent-vs-deterministic 2048 match in the background. Returns the runId immediately so the caller can navigate to /watch/[runId] on the apex marketing site. Each move emits a duel_moves INSERT, broadcast via Supabase Realtime to subscribers of the `duel_match_{runId}` channel. The match runs for up to 24 moves or ~55 sec, then settles on-chain via the X10 wire (submitSoloScore + ERC-8021 dataSuffix attribution) when X20_DEMO_TOURNAMENT_ID is configured.',
  tags: ['agents'],
  request: {
    body: {
      content: { 'application/json': { schema: SoloMatchStartRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Match reserved; runId returned, background loop started',
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
  // Per-IP rate-limit. The CDN-provided header is set by Vercel's edge;
  // local dev falls back to a stable "local" bucket.
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

  // X15.3 — orchestrate on-chain entry fee (chargeRetryFee) before kicking
  // off the run, so submitSoloScore won't revert InsufficientFeePaid when
  // the match finishes. The orchestrator is contract-aware: priorSolo == 0
  // skips the on-chain fee (free-first slot); priorSolo >= 1 enforces the
  // allowance + chargeRetryFee pair. The route still always charges x402
  // (the off-chain meter is a separate ledger from TournamentPool's fee
  // accumulator) — see ADR 0003 D3.
  const tournamentIdRaw = process.env.X20_DEMO_TOURNAMENT_ID?.trim();
  if (tournamentIdRaw && tournamentIdRaw.startsWith('0x')) {
    try {
      await chargeRetryFeeIfRequired({
        tournamentId: tournamentIdRaw as Hex,
        agentAddress: reserved.agentAddress,
        runId: reserved.runId,
        game: body.game,
      });
    } catch (err) {
      console.error('[agent-matches] chargeRetryFee failed', err);
      await markRunErrored(reserved.runId, err);
      throw new ApiError(
        502,
        'CHARGE_RETRY_FEE_FAILED',
        err instanceof Error ? err.message : 'On-chain entry-fee payment failed',
      );
    }
  } else {
    console.warn(
      '[agent-matches] X20_DEMO_TOURNAMENT_ID unset — skipping chargeRetryFee. ' +
        'submitSoloScore will be skipped too (X20 dev-mode behaviour).',
    );
  }

  // Drive the actual match in the background. On Vercel, waitUntil keeps the
  // function alive until the promise resolves OR maxDuration is hit
  // (vercel.json sets 60s). Locally / outside Vercel, waitUntil is a no-op
  // wrapper around the promise — the tsx dev server keeps it alive via the
  // Node event loop while we wait.
  const matchPromise = runSoloMatch({
    runId: reserved.runId,
    seed: reserved.seed,
    game: body.game,
  }).catch((err) => {
    console.error('[agent-matches] background match failed', err);
  });
  waitUntil(matchPromise);

  return c.json(
    {
      runId: reserved.runId,
      seed: reserved.seed,
      agentAddress: reserved.agentAddress,
      watchUrl: `${APEX_WATCH_BASE_URL}/${reserved.runId}`,
      startedAt: new Date().toISOString(),
    },
    200,
  );
});

async function markRunErrored(runId: string, err: unknown): Promise<void> {
  const message =
    err instanceof Error ? err.message.slice(0, 500) : 'chargeRetryFee failed';
  try {
    const sb = getSupabaseClient();
    await sb
      .from('duel_runs')
      .update({
        status: 'error',
        error_message: message,
        ended_at: new Date().toISOString(),
      })
      .eq('id', runId);
  } catch (updateErr) {
    console.error('[agent-matches] failed to mark duel_runs errored', updateErr);
  }
}
