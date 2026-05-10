// Server-side viem walletClient bound to STUDIO_PRIVATE_KEY for broadcasting
// signed attestations to TournamentPool. Mirrors lib-shared/rpc.ts pattern.
//
// Why a separate module from ../viem.ts (which only builds publicClient):
// the public client is for everyone (read endpoints); the wallet client is
// only loaded when /v1/scores POST runs (so a misconfigured STUDIO_PRIVATE_KEY
// doesn't break read-only deploys).

import { createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

import { getSignerAccount } from './attestation.js';

let cached: ReturnType<typeof buildWalletClient> | null = null;

function buildWalletClient() {
  // Write-path RPC selection: prefer write-specific premium RPC (Alchemy
  // and similar handle eth_sendRawTransaction reliably); fall back to the
  // shared/read RPC URL; finally to the public Base Sepolia endpoint.
  //
  // This is split from the read path (lib/viem.ts) because Alchemy's free
  // tier caps eth_getLogs at a 10-block range — ruinous for our chunked
  // event scanner — while the public RPC allows 10k-block ranges for reads.
  // Net effect: writes get Alchemy's uptime advantage, reads keep the
  // permissive public limit.
  const rpcUrl =
    process.env.BASE_SEPOLIA_WRITE_RPC_URL ??
    process.env.BASE_SEPOLIA_RPC_URL ??
    'https://sepolia.base.org';
  return createWalletClient({
    account: getSignerAccount(),
    chain: baseSepolia,
    transport: http(rpcUrl, {
      retryCount: 3,
      retryDelay: 250,
      timeout: 30_000,
    }),
  });
}

export function getWalletClient() {
  if (!cached) cached = buildWalletClient();
  return cached;
}
