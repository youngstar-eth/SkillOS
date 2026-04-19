"use client";

import { useEffect, useMemo } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import type { Hex } from "viem";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
} from "../contracts/arcade-pool";

// Pin on-chain reads to Base Sepolia regardless of the connected wallet's
// reported chain. Miniapp connectors (Farcaster) can report mainnet even
// after a chain switch, which silently routes reads to the wrong RPC and
// returns undefined → UI shows "—". Explicit chainId avoids that.
const READ_CHAIN_ID = baseSepolia.id;

export type TournamentEntryStatus =
  | "connecting"
  | "checking"
  | "no_balance"
  | "needs_approve"
  | "approving"
  | "needs_enter"
  | "entering"
  | "entered"
  | "error";

export interface UseTournamentEntryOptions {
  tournamentId: bigint;
  /** USDC amount required to enter. Default: 1 USDC (6 decimals). */
  entryFee?: bigint;
  /** Fires once when on-chain `hasEntered` flips to true. */
  onEntered?: () => void;
}

export interface UseTournamentEntryResult {
  status: TournamentEntryStatus;
  balance: bigint | undefined;
  allowance: bigint | undefined;
  approve: () => void;
  enter: () => void;
  approveHash: Hex | undefined;
  enterHash: Hex | undefined;
  approveError: string | undefined;
  enterError: string | undefined;
  // --- DEBUG (temporary, to be removed) ---
  address: `0x${string}` | undefined;
  chainId: number | undefined;
  isConnected: boolean;
  balanceError: string | undefined;
  allowanceError: string | undefined;
  hasEnteredError: string | undefined;
}

/**
 * Tournament entry state machine. Owns reads (allowance / balance /
 * hasEntered), write txs (approve + enter), and derives a status that
 * drives the UI. Component layers (shared TournamentEntry or any bespoke
 * per-game UI) only need to render buttons and the derived status.
 */
export function useTournamentEntry(
  opts: UseTournamentEntryOptions,
): UseTournamentEntryResult {
  const { tournamentId, entryFee = 1_000_000n, onEntered } = opts;
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();

  const hasEnteredQ = useReadContract({
    address: ARCADE_POOL_ADDRESS,
    abi: ARCADE_POOL_ABI,
    functionName: "hasEntered",
    args: address ? [tournamentId, address] : undefined,
    chainId: READ_CHAIN_ID,
    query: { enabled: !!address },
  });

  const allowanceQ = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, ARCADE_POOL_ADDRESS] : undefined,
    chainId: READ_CHAIN_ID,
    query: { enabled: !!address },
  });

  const balanceQ = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: READ_CHAIN_ID,
    query: { enabled: !!address },
  });

  const approveW = useWriteContract();
  const enterW = useWriteContract();

  const approveRcpt = useWaitForTransactionReceipt({ hash: approveW.data });
  const enterRcpt = useWaitForTransactionReceipt({ hash: enterW.data });

  useEffect(() => {
    if (approveRcpt.isSuccess) allowanceQ.refetch();
  }, [approveRcpt.isSuccess, allowanceQ]);

  useEffect(() => {
    if (enterRcpt.isSuccess) hasEnteredQ.refetch();
  }, [enterRcpt.isSuccess, hasEnteredQ]);

  // Fire onEntered on TWO signals so the UI flips the moment the enter tx
  // receipt lands, not whenever wagmi's `hasEntered` read finally refreshes
  // (which can lag — miniapp chainId mismatches + wagmi cache TTLs have
  // kept users stuck on "Entering…" until they F5'd). The callback is
  // idempotent at the consumer (setEntered(true)), so double-fire is safe.
  //   1. enterRcpt.isSuccess — optimistic, fires the moment the tx confirms
  //   2. hasEnteredQ.data === true — authoritative, fires after the read refreshes
  useEffect(() => {
    if (enterRcpt.isSuccess) onEntered?.();
  }, [enterRcpt.isSuccess, onEntered]);

  useEffect(() => {
    if (hasEnteredQ.data === true) onEntered?.();
  }, [hasEnteredQ.data, onEntered]);

  const status: TournamentEntryStatus = useMemo(() => {
    if (!isConnected || !address) return "connecting";
    // Treat the enter tx receipt as authoritative for the entered state.
    // `hasEnteredQ` is eventual-consistent (wagmi RPC cache + miniapp chainId
    // mismatches can leave it stale for several seconds), so the UI would
    // otherwise drop back to `needs_enter` and force the user to F5.
    if (hasEnteredQ.data === true || enterRcpt.isSuccess) return "entered";
    if (hasEnteredQ.isLoading || allowanceQ.isLoading || balanceQ.isLoading) {
      return "checking";
    }
    if (enterW.isPending || enterRcpt.isLoading) return "entering";
    if (approveW.isPending || approveRcpt.isLoading) return "approving";
    if (approveW.error || enterW.error) return "error";
    const bal = (balanceQ.data as bigint | undefined) ?? 0n;
    if (bal < entryFee) return "no_balance";
    const allowed = (allowanceQ.data as bigint | undefined) ?? 0n;
    if (allowed < entryFee) return "needs_approve";
    return "needs_enter";
  }, [
    isConnected,
    address,
    hasEnteredQ.isLoading,
    hasEnteredQ.data,
    allowanceQ.isLoading,
    allowanceQ.data,
    balanceQ.isLoading,
    balanceQ.data,
    approveW.isPending,
    approveW.error,
    approveRcpt.isLoading,
    enterW.isPending,
    enterW.error,
    enterRcpt.isLoading,
    enterRcpt.isSuccess,
    entryFee,
  ]);

  const approve = () =>
    approveW.writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [ARCADE_POOL_ADDRESS, entryFee],
    });

  const enter = () =>
    enterW.writeContract({
      address: ARCADE_POOL_ADDRESS,
      abi: ARCADE_POOL_ABI,
      functionName: "enter",
      args: [tournamentId],
    });

  return {
    status,
    balance: balanceQ.data as bigint | undefined,
    allowance: allowanceQ.data as bigint | undefined,
    approve,
    enter,
    approveHash: approveW.data,
    enterHash: enterW.data,
    approveError: approveW.error?.message ?? approveRcpt.error?.message,
    enterError: enterW.error?.message ?? enterRcpt.error?.message,
    address,
    chainId: currentChainId,
    isConnected,
    balanceError: balanceQ.error?.message,
    allowanceError: allowanceQ.error?.message,
    hasEnteredError: hasEnteredQ.error?.message,
  };
}
