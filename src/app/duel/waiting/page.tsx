"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { maxUint256, parseUnits } from "viem";
import {
  CHALLENGE_ESCROW_ABI,
  CHALLENGE_ESCROW_ADDRESS,
  ERC20_ABI,
  USDC_ADDRESS,
} from "@/lib/contracts";
import { cancelDuel, getMatchStatus, queueDuel } from "@/lib/api";
import { truncateAddress } from "@/lib/utils";

const STAKE_USDC = "1";
const STAKE_AMOUNT = parseUnits(STAKE_USDC, 6); // USDC has 6 decimals

type Step = "approve" | "stake" | "queued" | "matched";

/** Random 32-byte seed for the client's stake tx. */
function randomBytes32(): `0x${string}` {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return `0x${Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export default function WaitingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>("approve");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seed] = useState<`0x${string}`>(() => randomBytes32());

  // Redirect to home if not connected
  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  // Current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, CHALLENGE_ESCROW_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  // Auto-skip approve if allowance is already sufficient
  useEffect(() => {
    if (step === "approve" && typeof allowance === "bigint" && allowance >= STAKE_AMOUNT) {
      setStep("stake");
    }
  }, [allowance, step]);

  // --- Approve tx ---
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approvePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();

  const { isLoading: approveMining, isSuccess: approveDone } =
    useWaitForTransactionReceipt({ hash: approveHash });

  useEffect(() => {
    if (approveDone) {
      refetchAllowance();
      setStep("stake");
      resetApprove();
    }
  }, [approveDone, refetchAllowance, resetApprove]);

  function handleApprove() {
    setError(null);
    writeApprove({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CHALLENGE_ESCROW_ADDRESS, maxUint256],
    });
  }

  // --- Stake tx ---
  const {
    writeContract: writeStake,
    data: stakeHash,
    isPending: stakePending,
    error: stakeError,
    reset: resetStake,
  } = useWriteContract();

  const { isLoading: stakeMining, isSuccess: stakeDone } =
    useWaitForTransactionReceipt({ hash: stakeHash });

  useEffect(() => {
    async function joinQueue() {
      if (!stakeDone || !stakeHash || !address) return;
      try {
        const res = await queueDuel({ address, txHash: stakeHash });
        setMatchId(res.matchId);
        if (res.status === "matched") setStep("matched");
        else setStep("queued");
        resetStake();
      } catch (e) {
        setError((e as Error).message);
      }
    }
    joinQueue();
  }, [stakeDone, stakeHash, address, resetStake]);

  function handleStake() {
    setError(null);
    writeStake({
      address: CHALLENGE_ESCROW_ADDRESS,
      abi: CHALLENGE_ESCROW_ABI,
      functionName: "createChallenge",
      args: [STAKE_AMOUNT, seed],
    });
  }

  // --- Poll status while queued ---
  const { data: matchData } = useQuery({
    queryKey: ["match-status", matchId],
    queryFn: () => (matchId ? getMatchStatus(matchId) : Promise.resolve(null)),
    enabled: step === "queued" && Boolean(matchId),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!matchData || !("status" in matchData)) return;
    if (
      matchData.status === "matched" ||
      matchData.status === "in_progress"
    ) {
      setStep("matched");
      if (matchId) router.push(`/duel/${matchId}`);
    }
    if (matchData.status === "cancelled" || matchData.status === "refunded") {
      router.push("/");
    }
  }, [matchData, matchId, router]);

  async function handleCancel() {
    if (!matchId) {
      router.push("/");
      return;
    }
    try {
      await cancelDuel(matchId);
    } catch (e) {
      // Even if the refund call fails, send them home — backend will reconcile.
      console.warn("cancel failed", e);
    } finally {
      router.push("/");
    }
  }

  // --- Render ---
  const stepUi = useMemo(() => {
    switch (step) {
      case "approve":
        return {
          title: "Approve USDC",
          sub: `Grant the escrow contract permission to move your ${STAKE_USDC} USDC stake.`,
          button: approveMining
            ? "Confirming tx…"
            : approvePending
              ? "Waiting for wallet…"
              : "Approve USDC",
          onClick: handleApprove,
          disabled: approvePending || approveMining,
        };
      case "stake":
        return {
          title: "Stake 1 USDC",
          sub: "Lock your stake in the escrow. You'll be refunded if no one matches.",
          button: stakeMining
            ? "Confirming tx…"
            : stakePending
              ? "Waiting for wallet…"
              : `Stake ${STAKE_USDC} USDC`,
          onClick: handleStake,
          disabled: stakePending || stakeMining,
        };
      case "queued":
        return {
          title: "Looking for opponent…",
          sub: "You're in the queue. We'll match you with the next player who stakes.",
          button: null,
          onClick: null,
          disabled: false,
        };
      case "matched":
        return {
          title: "Match found!",
          sub: "Redirecting to your duel…",
          button: null,
          onClick: null,
          disabled: false,
        };
    }
  }, [
    step,
    approvePending,
    approveMining,
    stakePending,
    stakeMining,
  ]);

  const liveError =
    error ?? approveError?.message ?? stakeError?.message ?? null;

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        {/* Step indicator */}
        <StepDots current={step} />

        <div className="rounded-2xl border border-border bg-bg-elev p-6 text-center">
          {step === "queued" && (
            <div className="mb-6 flex justify-center">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <span className="absolute h-20 w-20 rounded-full bg-skill/20 animate-pulseRing" />
                <span className="absolute h-14 w-14 rounded-full bg-skill/30 animate-pulseRing [animation-delay:300ms]" />
                <span className="relative h-8 w-8 rounded-full bg-skill" />
              </div>
            </div>
          )}

          <h1 className="text-2xl font-semibold">{stepUi.title}</h1>
          <p className="mt-2 text-sm text-neutral-400">{stepUi.sub}</p>

          {address && (
            <p className="mt-6 font-mono text-xs text-neutral-500">
              {truncateAddress(address)} · Stake {STAKE_USDC} USDC
            </p>
          )}

          {stepUi.button && stepUi.onClick && (
            <button
              onClick={stepUi.onClick}
              disabled={stepUi.disabled}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-skill px-6 text-sm font-semibold text-black transition hover:bg-yellow-400 disabled:opacity-60"
            >
              {stepUi.button}
            </button>
          )}
        </div>

        {liveError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            {liveError}
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleCancel}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            {step === "queued" ? "Cancel & refund" : "Back"}
          </button>
        </div>
      </div>
    </main>
  );
}

function StepDots({ current }: { current: Step }) {
  const order: Step[] = ["approve", "stake", "queued"];
  const index = order.indexOf(current === "matched" ? "queued" : current);
  return (
    <div className="mx-auto flex max-w-xs items-center justify-between">
      {order.map((s, i) => {
        const state = i < index ? "done" : i === index ? "active" : "pending";
        return (
          <div key={s} className="flex flex-1 items-center">
            <div
              className={
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold " +
                (state === "done"
                  ? "bg-skill text-black"
                  : state === "active"
                    ? "bg-skill/20 text-skill ring-1 ring-skill"
                    : "bg-bg-elev2 text-neutral-500")
              }
            >
              {state === "done" ? "✓" : i + 1}
            </div>
            {i < order.length - 1 && (
              <div
                className={
                  "mx-1 h-px flex-1 " +
                  (state === "done" ? "bg-skill" : "bg-border-subtle")
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
