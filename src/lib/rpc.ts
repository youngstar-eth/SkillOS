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
//     Agent 1).
//
// Server-only: never import from a client component.
// ───────────────────────────────────────────────────────────────────────────

import { type Chain, createPublicClient, createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { getSignerAccount } from "./attestation";
import { CHAIN_ID } from "./contracts";

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
  return (
    process.env.BASE_SEPOLIA_RPC_URL ??
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ??
    "https://sepolia.base.org"
  );
}

let cachedPublic: ReturnType<typeof createPublicClient> | null = null;
export function getPublicClient() {
  if (!cachedPublic) {
    cachedPublic = createPublicClient({
      chain: resolveChain(),
      transport: http(resolveRpcUrl()),
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
      transport: http(resolveRpcUrl()),
    });
  }
  return cachedWallet;
}
