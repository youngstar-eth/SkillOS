import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

/**
 * Studio wallet = the address USDC stakes escrow to + the signer that pays
 * out winners / refunds Alice. Derived from STUDIO_PRIVATE_KEY at call time
 * so edge runtimes (Next build) don't choke on node-only viem paths at
 * bundle time — we only need this in route handlers.
 */
let cached: Address | null = null;

export function getStudioWalletAddress(): Address {
  if (cached) return cached;
  const pk = process.env.STUDIO_PRIVATE_KEY as Hex | undefined;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error(
      "STUDIO_PRIVATE_KEY missing or malformed (need 0x + 64 hex chars)",
    );
  }
  cached = privateKeyToAccount(pk).address;
  return cached;
}
