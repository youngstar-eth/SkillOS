// /v1/agents/* — agent-attributed writes.
//
// Auth: requires a valid SIWA receipt header (X-SIWA-Receipt) AND a fresh
// ERC-8128 per-request signature (Signature + Signature-Input + Content-Digest
// headers). Both verified by requireSiwaAuth() — see ../middleware/agent-auth.ts.
//
// Q4 lock scoped ERC-8128 enforcement to writes only; both endpoints here
// are writes (POST + PATCH).

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { randomBytes } from 'node:crypto';
import {
  type Hex,
  BaseError,
  ContractFunctionRevertedError,
  type Address,
} from 'viem';
import {
  AgentScoreSubmitRequestSchema,
  AgentScoreSubmitResponseSchema,
  AgentProfilePatchRequestSchema,
  AgentProfileResponseSchema,
} from '../schemas/agents.js';
import { ErrorEnvelopeSchema } from '../schemas/common.js';
import {
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V21_ADDRESS,
} from '../lib/contracts.js';
import { signSoloSubmitAttestation } from '../lib/contracts-vendored/attestation.js';
import { getWalletClient } from '../lib/contracts-vendored/wallet-client.js';
import { dataSuffixForGame, type KnownGame } from '../lib/games.js';
import { ApiError } from '../middleware/errorEnvelope.js';
import { requireSiwaAuth } from '../middleware/agent-auth.js';
import { check as rateLimit } from '../lib/rate-limit.js';

export const agentRoutes = new OpenAPIHono();

// ─── POST /v1/agents/scores ───────────────────────────────────────────────

const submitRoute = createRoute({
  method: 'post',
  path: '/v1/agents/scores',
  summary: 'Submit a score on behalf of a verified agent',
  description:
    'Agent-authenticated via SIWA receipt + ERC-8128 per-request signature. Server signs a submitSoloScore attestation with STUDIO_PRIVATE_KEY and broadcasts on-chain. T0 tier only in v0.1; T1+ returns 501 (same constraint as POST /v1/scores). The signing wallet is the AGENT address (proven via SIWA + onchain ownerOf), NOT a separate user wallet.',
  tags: ['agents'],
  security: [{ siwaReceipt: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: AgentScoreSubmitRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Submission broadcast on-chain',
      content: { 'application/json': { schema: AgentScoreSubmitResponseSchema } },
      headers: z.object({
        'X-SkillOS-Tier': z.literal('T0'),
        'X-SkillOS-Verification': z.literal('siwa-erc8128'),
      }),
    },
    400: {
      description: 'Receipt missing/invalid, ERC-8128 sig invalid, or input invalid',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    429: {
      description: 'Rate limit exceeded (60/min per agent address)',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

agentRoutes.use('/v1/agents/scores', requireSiwaAuth());
agentRoutes.openapi(submitRoute, async (c) => {
  const agent = c.get('agent');
  const agentAddress = agent.address as Address;

  const limited = rateLimit(`agent-scores:${agentAddress.toLowerCase()}`);
  if (!limited.allowed) {
    c.header('X-RateLimit-Reset', String(Math.floor(limited.resetAt / 1000)));
    throw new ApiError(429, 'RATE_LIMITED', 'Per-agent rate limit exceeded (60/min)');
  }

  const body = c.req.valid('json');
  if (body.tier !== 'T0') {
    // ApiError status enum doesn't include 501; matches POST /v1/scores
    // precedent (400 for tier-not-implemented). OpenAPI schema reflects
    // the actual returned status.
    throw new ApiError(
      400,
      'TIER_NOT_IMPLEMENTED',
      `Tier ${body.tier} requires plausibility pipeline (Phase 2 mainnet blocker). X4 supports T0 only.`,
    );
  }

  const soloRunId: Hex = (body.soloRunId as Hex | undefined) ??
    (`0x${randomBytes(32).toString('hex')}` as Hex);
  const onChainNonce = `0x${randomBytes(32).toString('hex')}` as Hex;

  const signature = await signSoloSubmitAttestation({
    tournamentId: body.tournamentId as Hex,
    player: agentAddress,
    score: BigInt(body.score),
    soloRunId,
    matchCountDelta: BigInt(body.matchCountDelta),
    nonce: onChainNonce,
  });

  const walletClient = getWalletClient();
  // X10: Path A attribution via ERC-8021 dataSuffix. Resolved server-side
  // from the per-game Builder Code map (apps/api/src/lib/games.ts). viem's
  // writeContract appends this to the encoded calldata; the contract
  // ignores trailing bytes (invisible at EVM execution level) but the
  // off-chain attribution indexer reads them from tx.input.
  const dataSuffix = dataSuffixForGame(body.game as KnownGame);
  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      address: TOURNAMENT_POOL_V21_ADDRESS,
      abi: TOURNAMENT_POOL_ABI,
      functionName: 'submitSoloScore',
      args: [
        body.tournamentId as Hex,
        agentAddress,
        BigInt(body.score),
        soloRunId,
        BigInt(body.matchCountDelta),
        onChainNonce,
        signature,
      ],
      dataSuffix,
    });
  } catch (err) {
    if (err instanceof BaseError) {
      const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
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

  c.header('X-SkillOS-Tier', 'T0');
  c.header('X-SkillOS-Verification', 'siwa-erc8128');
  return c.json(
    {
      txHash,
      soloRunId,
      submittedAt: new Date().toISOString(),
      tier: 'T0' as const,
      agentAddress,
      agentId: agent.agentId,
    },
    200,
  );
});

// ─── PATCH /v1/agents/profile ─────────────────────────────────────────────
//
// X4 v0.1: in-memory store keyed by agentId. Process-local, not durable
// across restarts. Sufficient for SIWA + ERC-8128 smoke; X4.5 swaps to
// Supabase-backed table `skillos_agent_profiles`.

interface AgentProfile {
  agentId: number;
  agentAddress: string;
  displayName?: string;
  preferences?: Record<string, unknown>;
  updatedAt: string;
}

const profileStore = new Map<number, AgentProfile>();

const patchRoute = createRoute({
  method: 'patch',
  path: '/v1/agents/profile',
  summary: 'Update off-chain agent profile',
  description:
    'Update display name + arbitrary preferences for the authenticated agent. On-chain identity (name, description, endpoints, pubkey) stays in the ERC-8004 registry — use that for identity changes; this endpoint is for off-chain UX metadata.',
  tags: ['agents'],
  security: [{ siwaReceipt: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: AgentProfilePatchRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Profile updated',
      content: { 'application/json': { schema: AgentProfileResponseSchema } },
    },
    400: { description: 'Invalid input', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

agentRoutes.use('/v1/agents/profile', requireSiwaAuth());
agentRoutes.openapi(patchRoute, async (c) => {
  const agent = c.get('agent');
  const body = c.req.valid('json');

  const existing = profileStore.get(agent.agentId);
  const updated: AgentProfile = {
    agentId: agent.agentId,
    agentAddress: agent.address,
    displayName: body.displayName ?? existing?.displayName,
    preferences: body.preferences ?? existing?.preferences,
    updatedAt: new Date().toISOString(),
  };
  profileStore.set(agent.agentId, updated);

  return c.json(updated, 200);
});
