import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

// Inferred return type carries the concrete chain/transport generics, which is
// what we want — explicit `PublicClient` annotations strip those and trigger
// "two unrelated types" diagnostics under viem's branded generic system.
const buildClient = () => {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl, {
      retryCount: 2,
      timeout: 8_000,
    }),
  });
};

let client: ReturnType<typeof buildClient> | undefined;

export const getPublicClient = () => {
  if (!client) client = buildClient();
  return client;
};

// TournamentPool v2.1 deploy block on Base Sepolia (2026-04-29).
// Mirrors duel-backend's DEFAULT_DEPLOY_BLOCK so both indexers stay in sync.
// Override per-environment via SPONSOR_INDEXER_DEPLOY_BLOCK if redeployed.
const DEFAULT_DEPLOY_BLOCK = 40_851_426n;

export const FROM_BLOCK: bigint = (() => {
  const raw = process.env.SPONSOR_INDEXER_DEPLOY_BLOCK;
  if (raw && /^[0-9]+$/.test(raw)) return BigInt(raw);
  return DEFAULT_DEPLOY_BLOCK;
})();
