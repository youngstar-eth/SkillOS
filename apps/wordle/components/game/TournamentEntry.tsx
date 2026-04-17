"use client";

import { useEffect, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Hex } from "viem";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
} from "@mas/shared/contracts";

const ENTRY_FEE = 1_000_000n; // 1 USDC (6 decimals)

type Status =
  | "connecting"
  | "checking"
  | "no_balance"
  | "needs_approve"
  | "approving"
  | "needs_enter"
  | "entering"
  | "entered"
  | "error";

export interface TournamentEntryProps {
  tournamentId: bigint;
  gameLabel: string;
  durationLabel: string;
  onEntered: () => void;
}

export function TournamentEntry({
  tournamentId,
  gameLabel,
  durationLabel,
  onEntered,
}: TournamentEntryProps) {
  const { address, isConnected } = useAccount();

  // Reads
  const hasEnteredQ = useReadContract({
    address: ARCADE_POOL_ADDRESS,
    abi: ARCADE_POOL_ABI,
    functionName: "hasEntered",
    args: address ? [tournamentId, address] : undefined,
    query: { enabled: !!address },
  });

  const allowanceQ = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, ARCADE_POOL_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const balanceQ = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Writes
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

  useEffect(() => {
    if (hasEnteredQ.data === true) onEntered();
  }, [hasEnteredQ.data, onEntered]);

  const status: Status = useMemo(() => {
    if (!isConnected || !address) return "connecting";
    if (hasEnteredQ.isLoading || allowanceQ.isLoading || balanceQ.isLoading) {
      return "checking";
    }
    if (hasEnteredQ.data === true) return "entered";
    if (enterW.isPending || enterRcpt.isLoading) return "entering";
    if (approveW.isPending || approveRcpt.isLoading) return "approving";
    if (approveW.error || enterW.error) return "error";
    const bal = (balanceQ.data as bigint | undefined) ?? 0n;
    if (bal < ENTRY_FEE) return "no_balance";
    const allowed = (allowanceQ.data as bigint | undefined) ?? 0n;
    if (allowed < ENTRY_FEE) return "needs_approve";
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
  ]);

  const handleApprove = () => {
    approveW.writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [ARCADE_POOL_ADDRESS, ENTRY_FEE],
    });
  };

  const handleEnter = () => {
    enterW.writeContract({
      address: ARCADE_POOL_ADDRESS,
      abi: ARCADE_POOL_ABI,
      functionName: "enter",
      args: [tournamentId],
    });
  };

  if (status === "entered") {
    return (
      <div className="rounded border border-success/30 bg-success/5 p-4">
        <p className="text-sm font-semibold text-success">
          ✓ Entered — Tournament #{tournamentId.toString()}
        </p>
        <p className="mt-1 text-xs text-muted">You are in. Play below.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div>
        <h3 className="text-h3 text-fg">
          Tournament #{tournamentId.toString()}
        </h3>
        <p className="text-xs text-muted">
          Entry fee: 1 USDC · gameId &ldquo;{gameLabel}&rdquo; · {durationLabel}
        </p>
      </div>

      <StatusRow
        status={status}
        balance={balanceQ.data as bigint | undefined}
        allowance={allowanceQ.data as bigint | undefined}
        approveHash={approveW.data}
        enterHash={enterW.data}
        approveError={approveW.error?.message ?? approveRcpt.error?.message}
        enterError={enterW.error?.message ?? enterRcpt.error?.message}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleApprove}
          disabled={status !== "needs_approve" && status !== "error"}
          className="min-h-[44px] flex-1 rounded-sm border border-border bg-bg px-3 py-2 text-sm font-semibold text-fg hover:border-fg/30 disabled:opacity-40"
        >
          {status === "approving" ? "Approving…" : "1. Approve 1 USDC"}
        </button>
        <button
          type="button"
          onClick={handleEnter}
          disabled={status !== "needs_enter"}
          className="min-h-[44px] flex-1 rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
        >
          {status === "entering" ? "Entering…" : "2. Enter Tournament"}
        </button>
      </div>
    </div>
  );
}

function StatusRow({
  status,
  balance,
  allowance,
  approveHash,
  enterHash,
  approveError,
  enterError,
}: {
  status: Status;
  balance?: bigint;
  allowance?: bigint;
  approveHash?: Hex;
  enterHash?: Hex;
  approveError?: string;
  enterError?: string;
}) {
  const fmt = (v: bigint | undefined) =>
    v === undefined ? "—" : (Number(v) / 1e6).toFixed(2) + " USDC";

  const basescanTx = (h?: Hex) =>
    h ? `https://sepolia.basescan.org/tx/${h}` : null;

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
      <span className="text-muted">Balance</span>
      <span className="text-right text-fg">{fmt(balance)}</span>
      <span className="text-muted">Allowance</span>
      <span className="text-right text-fg">{fmt(allowance)}</span>

      {status === "no_balance" && (
        <p className="col-span-2 mt-1 rounded border border-warning/40 bg-warning/10 p-2 text-warning">
          Need Base Sepolia USDC.{" "}
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            circle faucet ↗
          </a>
        </p>
      )}

      {status === "connecting" && (
        <p className="col-span-2 text-muted">Connect wallet first.</p>
      )}
      {status === "checking" && (
        <p className="col-span-2 text-muted">Checking on-chain state…</p>
      )}

      {(approveHash || enterHash) && (
        <p className="col-span-2 mt-1 break-all text-muted">
          {enterHash ? "enter: " : "approve: "}
          <a
            href={(basescanTx(enterHash) ?? basescanTx(approveHash))!}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            {(enterHash ?? approveHash ?? "").slice(0, 10)}…
          </a>
        </p>
      )}

      {(approveError || enterError) && (
        <p className="col-span-2 mt-1 rounded border border-danger/40 bg-danger/10 p-2 text-danger">
          {(enterError ?? approveError)!.split("\n")[0]}
        </p>
      )}
    </div>
  );
}
