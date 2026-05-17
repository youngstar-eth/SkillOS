// ───────────────────────────────────────────────────────────────────────────
// Server-side viem clients for Base Sepolia.
//
// Two clients:
//   - publicClient: read-only, used for getChallenge(), event lookups,
//     trustedSigner() cross-check.
//   - walletClient: tied to STUDIO_PRIVATE_KEY — the one address
//     authorized to sign settle / walkover on behalf of matches. Also
//     broadcasts the settle tx itself so the server pays gas (players do
//     not sign a settle tx; that's the "no submit-signature" UX we promised
//     the frontend).
//
// Server-only: never import from a client component.
// ───────────────────────────────────────────────────────────────────────────

import { type Chain, createPublicClient, createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { CHAIN_ID } from "@skillos/contracts";
import { getSignerAccount } from "./attestation";

function resolveChain(): Chain {
  // V2 targets Base Sepolia (84532). Guard against env drift.
  if (CHAIN_ID !== baseSepolia.id) {
    throw new Error(
      `Unsupported CHAIN_ID ${CHAIN_ID}; Skillbase V2 expects Base Sepolia (${baseSepolia.id}).`,
    );
  }
  return baseSepolia;
}

function resolveRpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
}

let cachedPublic: ReturnType<typeof createPublicClient> | null = null;
export function getPublicClient() {
  if (!cachedPublic) {
    cachedPublic = createPublicClient({
      chain: resolveChain(),
      transport: http(resolveRpcUrl(), {
        retryCount: 3,
        retryDelay: 200,
        timeout: 30_000,
      }),
    });
  }
  return cachedPublic;
}

let cachedWallet: ReturnType<typeof createWalletClient> | null = null;
export function getWalletClient() {
  if (!cachedWallet) {
    cachedWallet = createWalletClient({
      account: getSignerAccount(),
      chain: resolveChain(),
      transport: http(resolveRpcUrl(), {
        retryCount: 3,
        retryDelay: 200,
        timeout: 30_000,
      }),
    });
  }
  return cachedWallet;
}
