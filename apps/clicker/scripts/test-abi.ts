/**
 * Smoke test for the ArcadePool ABI + deployed address integration.
 *
 *   npx tsx scripts/test-abi.ts
 *
 * Reads owner() + protocolFeeBps() + USDC() via viem using the exact const
 * ABI shipped with the frontend. If any shape drifts, tsc fails; if the
 * deployed contract doesn't match, the call reverts.
 */
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import {
  ARCADE_POOL_ADDRESS,
  ARCADE_POOL_ABI,
} from "@mas/shared/contracts";

async function main() {
  const pub = createPublicClient({ chain: baseSepolia, transport: http() });

  const [owner, fee, usdc, signer, nextId] = await Promise.all([
    pub.readContract({
      address: ARCADE_POOL_ADDRESS,
      abi: ARCADE_POOL_ABI,
      functionName: "owner",
    }),
    pub.readContract({
      address: ARCADE_POOL_ADDRESS,
      abi: ARCADE_POOL_ABI,
      functionName: "protocolFeeBps",
    }),
    pub.readContract({
      address: ARCADE_POOL_ADDRESS,
      abi: ARCADE_POOL_ABI,
      functionName: "USDC",
    }),
    pub.readContract({
      address: ARCADE_POOL_ADDRESS,
      abi: ARCADE_POOL_ABI,
      functionName: "scoreSigner",
    }),
    pub.readContract({
      address: ARCADE_POOL_ADDRESS,
      abi: ARCADE_POOL_ABI,
      functionName: "nextTournamentId",
    }),
  ]);

  console.log("contract       ", ARCADE_POOL_ADDRESS);
  console.log("owner          ", owner);
  console.log("scoreSigner    ", signer);
  console.log("USDC           ", usdc);
  console.log("protocolFeeBps ", fee.toString());
  console.log("nextTournamentId", nextId.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
