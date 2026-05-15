// x402 paywall middleware setup (Sprint X5).
//
// Wraps @x402/hono + @x402/core + @x402/evm into a single Hono middleware
// that gates the `/v1/data/*` paywalled tier. Routes not listed here pass
// through unguarded — the middleware checks `requiresPayment()` per request
// and falls through to next() when the path doesn't match.
//
// Testnet uses the public x402.org facilitator (no signup). Mainnet path
// flips to CDP facilitator (https://api.cdp.coinbase.com/platform/v2/x402)
// once Phase 2 lands — overridable via X402_FACILITATOR_URL.
//
// Receiver wallet hygiene: X402_RECEIVER_ADDRESS MUST be a fresh testnet
// address with zero existing role overlap (trustedSigner / sponsor /
// deployer / agent). See project_skillbase_trustedsigner memory.

import type { MiddlewareHandler } from 'hono';
import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator';
const BASE_SEPOLIA_CAIP2 = 'eip155:84532' as const;

// Price table — keep in lock-step with §3.1, the README, and ADR 0003.
// String form ('$0.01') is canonical for USD-pegged stablecoins; the
// scheme resolves the asset address per network internally (USDC
// 0x036CbD53842c5426634e7929541eC2318f3dCF7e on Base Sepolia).
//
// agentMatchRetry: ADR 0003 D4. $1.05 = $1.00 ENTRY_FEE (one solo retry
// at TournamentPool ENTRY_FEE constant) + $0.05 surplus (gas for the
// downstream chargeEntryFee tx, facilitator margin, observability
// budget). Atomic: 1_050_000 USDC base units (6 decimals).
export const X402_PRICES = {
  matchReplay: '$0.01',
  cohortSnapshot: '$0.10',
  agentMatchRetry: '$1.05',
} as const;

const isHexAddress = (v: string): v is `0x${string}` =>
  /^0x[a-fA-F0-9]{40}$/.test(v);

const readReceiver = (): `0x${string}` => {
  const raw = process.env.X402_RECEIVER_ADDRESS?.trim();
  if (!raw) {
    throw new Error(
      'X402_RECEIVER_ADDRESS is required. Set it to a fresh testnet wallet ' +
        '(zero on-chain history; no role overlap with trustedSigner / sponsor ' +
        '/ deployer / agent). For local dev only, an obviously-invalid ' +
        '0x000000000000000000000000000000000000dEaD placeholder is acceptable.',
    );
  }
  if (!isHexAddress(raw)) {
    throw new Error(
      `X402_RECEIVER_ADDRESS is not a valid 0x-prefixed 40-char hex address: ${raw}`,
    );
  }
  return raw;
};

const buildMiddleware = (): MiddlewareHandler => {
  const payTo = readReceiver();
  const facilitatorUrl =
    process.env.X402_FACILITATOR_URL?.trim() || DEFAULT_FACILITATOR_URL;

  const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });

  // Register the ExactEvmScheme for Base Sepolia. One scheme per network;
  // adding mainnet later means a second .register() call after the
  // facilitator URL flip.
  const server = new x402ResourceServer(facilitator).register(
    BASE_SEPOLIA_CAIP2,
    new ExactEvmScheme(),
  );

  // Route config — path patterns support :param syntax (regex-compiled).
  // Routes not listed pass through without payment check.
  return paymentMiddleware(
    {
      '/v1/data/match-replay/:id': {
        accepts: [
          {
            scheme: 'exact',
            price: X402_PRICES.matchReplay,
            network: BASE_SEPOLIA_CAIP2,
            payTo,
          },
        ],
        description: 'Tournament match event replay (T2 tier data).',
        mimeType: 'application/json',
      },
      '/v1/data/cohort-snapshot': {
        accepts: [
          {
            scheme: 'exact',
            price: X402_PRICES.cohortSnapshot,
            network: BASE_SEPOLIA_CAIP2,
            payTo,
          },
        ],
        description: 'Aggregated cohort statistics (T3 tier data).',
        mimeType: 'application/json',
      },
      // Sprint X15.6 — /v1/agents/matches/start-solo is intentionally NOT
      // in this route map (ADR 0003 D5 mechanics resolution). Two reasons:
      //
      //   1. Spectator UX: a browser POST that returns 402 instead of 202
      //      breaks the apex "kick off → subscribe to Realtime" flow on
      //      /watch/[runId].
      //   2. Server-side satisfaction: the agent (AGENT_PRIVATE_KEY) is the
      //      payer, not the spectator. paymentMiddleware can't satisfy its
      //      own paywall; settlement happens inside the handler after the
      //      runId is reserved.
      //
      // The actual x402 settlement lives in apps/api/src/lib/x402-client.ts
      // (X15.6) and is called from the start-solo handler's background
      // worker. X402_PRICES.agentMatchRetry above stays the single source
      // of truth for the $1.05 amount; the client reads it directly.
    },
    server,
  );
};

let cached: MiddlewareHandler | null = null;

// Lazy-initialised middleware wrapper. Defers env var validation + facilitator
// client construction to first request so module imports (and unrelated
// routes) keep working when X402_RECEIVER_ADDRESS is unset.
export const getX402Middleware = (): MiddlewareHandler => {
  return async (c, next) => {
    if (!cached) cached = buildMiddleware();
    return cached(c, next);
  };
};
