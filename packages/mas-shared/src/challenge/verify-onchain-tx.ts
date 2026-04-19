/**
 * Server-side utilities for verifying that on-chain transactions from
 * clients actually emit the expected ChallengeEscrow events. Protects
 * against clients lying about tx hashes.
 *
 * Used by:
 *   POST /api/challenge/[id]/confirm-create   — ChallengeCreated event
 *   POST /api/challenge/[id]/accept           — ChallengeAccepted event
 *   POST /api/challenge/[id]/confirm-settle   — ChallengeSettled event
 *
 * Ported from ceos.run d4002e7 packages/shared/utils/challenge/verify-onchain-tx.ts.
 */

import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";

const ESCROW_EVENT_ABI = parseAbi([
  "event ChallengeCreated(bytes32 indexed id, address indexed creator, bytes32 gameSlug, uint256 stake, uint256 expiresAt)",
  "event ChallengeAccepted(bytes32 indexed id, address indexed challenger)",
  "event ChallengeSettled(bytes32 indexed id, address indexed winner, uint256 payout)",
  "event ChallengeExpired(bytes32 indexed id)",
]);

function getPublicClient() {
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532", 10);
  const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL ??
    process.env.BASE_SEPOLIA_RPC_URL ??
    "https://sepolia.base.org";
  const chain = chainId === 8453 ? base : baseSepolia;
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

export interface VerifyCreateResult {
  verified: boolean;
  creator?: Address;
  stake?: bigint;
  expiresAt?: bigint;
  reason?: string;
}

export async function verifyChallengeCreatedTx(
  txHash: Hex,
  expectedId: Hex,
  expectedCreator: Address,
  contractAddress: Address,
): Promise<VerifyCreateResult> {
  const client = getPublicClient();
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });
  } catch (e) {
    return { verified: false, reason: `receipt_timeout: ${(e as Error).message}` };
  }

  if (receipt.status !== "success") {
    return { verified: false, reason: `tx_reverted:${receipt.status}` };
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: ESCROW_EVENT_ABI,
        data: log.data,
        topics: log.topics,
        eventName: "ChallengeCreated",
      });
      const args = decoded.args as {
        id: Hex;
        creator: Address;
        gameSlug: Hex;
        stake: bigint;
        expiresAt: bigint;
      };
      if (
        args.id.toLowerCase() === expectedId.toLowerCase() &&
        args.creator.toLowerCase() === expectedCreator.toLowerCase()
      ) {
        return {
          verified: true,
          creator: args.creator,
          stake: args.stake,
          expiresAt: args.expiresAt,
        };
      }
    } catch {
      /* not this event */
    }
  }
  return { verified: false, reason: "event_not_found" };
}

export interface VerifyAcceptResult {
  verified: boolean;
  challenger?: Address;
  reason?: string;
}

export async function verifyChallengeAcceptedTx(
  txHash: Hex,
  expectedId: Hex,
  expectedChallenger: Address,
  contractAddress: Address,
): Promise<VerifyAcceptResult> {
  const client = getPublicClient();
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });
  } catch (e) {
    return { verified: false, reason: `receipt_timeout: ${(e as Error).message}` };
  }

  if (receipt.status !== "success") {
    return { verified: false, reason: `tx_reverted:${receipt.status}` };
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: ESCROW_EVENT_ABI,
        data: log.data,
        topics: log.topics,
        eventName: "ChallengeAccepted",
      });
      const args = decoded.args as { id: Hex; challenger: Address };
      if (
        args.id.toLowerCase() === expectedId.toLowerCase() &&
        args.challenger.toLowerCase() === expectedChallenger.toLowerCase()
      ) {
        return { verified: true, challenger: args.challenger };
      }
    } catch {
      /* not this event */
    }
  }
  return { verified: false, reason: "event_not_found" };
}

export interface VerifySettledResult {
  verified: boolean;
  winner?: Address;
  payout?: bigint;
  reason?: string;
}

export async function verifyChallengeSettledTx(
  txHash: Hex,
  expectedId: Hex,
  expectedWinner: Address,
  contractAddress: Address,
): Promise<VerifySettledResult> {
  const client = getPublicClient();
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });
  } catch (e) {
    return { verified: false, reason: `receipt_timeout: ${(e as Error).message}` };
  }

  if (receipt.status !== "success") {
    return { verified: false, reason: `tx_reverted:${receipt.status}` };
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: ESCROW_EVENT_ABI,
        data: log.data,
        topics: log.topics,
        eventName: "ChallengeSettled",
      });
      const args = decoded.args as {
        id: Hex;
        winner: Address;
        payout: bigint;
      };
      if (
        args.id.toLowerCase() === expectedId.toLowerCase() &&
        args.winner.toLowerCase() === expectedWinner.toLowerCase()
      ) {
        return { verified: true, winner: args.winner, payout: args.payout };
      }
    } catch {
      /* not this event */
    }
  }
  return { verified: false, reason: "event_not_found" };
}
