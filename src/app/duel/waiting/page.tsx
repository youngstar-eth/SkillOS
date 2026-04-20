"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { type Hex, maxUint256 } from "viem";
import {
  CHALLENGE_DURATION_SECONDS,
  CHALLENGE_ESCROW_ABI,
  CHALLENGE_ESCROW_ADDRESS,
  ERC20_ABI,
  GAME_SLUG,
  QUEUE_WAIT_BUDGET_MS,
  STAKE_AMOUNT,
  USDC_ADDRESS,
} from "@/lib/contracts";
import {
  getMatchByAddress,
  getMatchStatus,
  matchAsChallenger,
  postAcceptTx,
  queueAsCreator,
  type MatchObject,
} from "@/lib/api";
import { bytes32FromUuid, generateMatchId } from "@/lib/match-id";
import { parseWalletError, truncateAddress } from "@/lib/utils";

/**
 * Waiting page state machine.
 *
 *   resuming → checking existing v2_duels row for this address on mount
 *   approve  → USDC allowance < stake; user must approve
 *   idle     → approve OK, showing the "Start Duel" button
 *   matching → POST /api/duel/queue (P2). If 404, fall through to creating.
 *   accepting→ acceptChallenge(id) tx in flight, then post accept-tx
 *   creating → createChallenge(...) tx in flight, then POST queue (P1)
 *   queued   → polling status, waiting for an opponent (P1 only)
 *   matched  → redirecting to /duel/[matchId]
 *   expired  → P1 queue budget elapsed; offering expireOpen refund
 *
 * We lean on wagmi's own pending/mining booleans for button labels rather
 * than reinventing tx state; useWaitForTransactionReceipt owns that.
 */
type Step =
  | "resuming"
  | "approve"
  | "idle"
  | "matching"
  | "accepting"
  | "creating"
  | "queued"
  | "matched"
  | "expired";

const STAKE_USDC_LABEL = "1";

export default function WaitingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState<Step>("resuming");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<Hex | null>(null);
  const [queuedAt, setQueuedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  // Prevent duplicate match attempts. React StrictMode double-fires effects
  // in dev, and users can rapid-click "Start Duel"; both would cause two
  // tx prompts.
  const matchAttempt = useRef(false);

  // Redirect home if disconnected.
  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  // Tick clock while queued so the timeout trigger fires.
  useEffect(() => {
    if (step !== "queued") return;
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [step]);

  // Flip to 'expired' when the queue budget elapses for a P1.
  useEffect(() => {
    if (
      step === "queued" &&
      queuedAt !== null &&
      now - queuedAt > QUEUE_WAIT_BUDGET_MS
    ) {
      setStep("expired");
    }
  }, [step, queuedAt, now]);

  // ─── Allowance check ────────────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, CHALLENGE_ESCROW_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  // ─── Resume flow: detect an existing match for this address ─────────────
  useEffect(() => {
    if (!address || step !== "resuming") return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await getMatchByAddress(address);
        if (cancelled) return;
        if (["settled", "refunded"].includes(existing.status)) {
          // Old match; fall through to fresh flow.
          proceedFromIdle();
          return;
        }
        // Active match — route intelligently based on state + role.
        setMatchId(existing.matchId);
        setChallengeId(existing.challengeId ?? null);

        const isP1 =
          existing.player1.address.toLowerCase() === address.toLowerCase();

        if (existing.status === "queued" && isP1) {
          setQueuedAt(
            existing.createdAt ? new Date(existing.createdAt).getTime() : Date.now(),
          );
          setStep("queued");
          return;
        }
        if (existing.status === "matched" && !isP1 && !existing.acceptTxHash) {
          // P2 matched but never completed acceptChallenge (e.g. tab reload
          // mid-tx). Send them back into accepting.
          setStep("accepting");
          return;
        }
        // Anything else — match is live or finalising — jump to duel.
        router.replace(`/duel/${existing.matchId}`);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          // No prior match; decide based on allowance.
          if (cancelled) return;
          proceedFromIdle();
        } else {
          if (cancelled) return;
          setError(parseWalletError(err).message);
          proceedFromIdle();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, step]);

  /** Decide approve vs idle based on current allowance. */
  const proceedFromIdle = useCallback(() => {
    const a = typeof allowance === "bigint" ? allowance : 0n;
    setStep(a >= STAKE_AMOUNT ? "idle" : "approve");
  }, [allowance]);

  // If allowance refetch flips the result after resume finished, re-evaluate.
  useEffect(() => {
    if (step === "approve" && typeof allowance === "bigint" && allowance >= STAKE_AMOUNT) {
      setStep("idle");
    }
  }, [allowance, step]);

  // ─── Approve tx ─────────────────────────────────────────────────────────
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
      setStep("idle");
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

  // ─── Accept (P2) tx ─────────────────────────────────────────────────────
  const {
    writeContract: writeAccept,
    data: acceptHash,
    isPending: acceptPending,
    error: acceptError,
    reset: resetAccept,
  } = useWriteContract();
  const { isLoading: acceptMining, isSuccess: acceptDone } =
    useWaitForTransactionReceipt({ hash: acceptHash });

  // ─── Create (P1) tx ─────────────────────────────────────────────────────
  const {
    writeContract: writeCreate,
    data: createHash,
    isPending: createPending,
    error: createError,
    reset: resetCreate,
  } = useWriteContract();
  const { isLoading: createMining, isSuccess: createDone } =
    useWaitForTransactionReceipt({ hash: createHash });

  // ─── Expire (P1 refund) tx ──────────────────────────────────────────────
  const {
    writeContract: writeExpire,
    data: expireHash,
    isPending: expirePending,
    error: expireError,
  } = useWriteContract();
  const { isLoading: expireMining, isSuccess: expireDone } =
    useWaitForTransactionReceipt({ hash: expireHash });

  // ─── Handlers ───────────────────────────────────────────────────────────

  /**
   * Main entry: try P2 (match an existing queued challenge). If none
   * exists, fall through to P1 (create a new challenge).
   */
  const handleStart = useCallback(async () => {
    if (!address || matchAttempt.current) return;
    matchAttempt.current = true;
    setError(null);
    setStep("matching");
    try {
      const match = await matchAsChallenger({ address });
      // P2 path: contract accept needs the challengeId (bytes32).
      setMatchId(match.matchId);
      setChallengeId(match.challengeId ?? null);
      if (!match.challengeId) {
        // Defensive: backend must always populate this.
        throw new Error("backend did not return challengeId");
      }
      setStep("accepting");
      writeAccept({
        address: CHALLENGE_ESCROW_ADDRESS,
        abi: CHALLENGE_ESCROW_ABI,
        functionName: "acceptChallenge",
        args: [match.challengeId],
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "no_queued_challenges") {
        // Fall through to P1 create.
        const id = generateMatchId();
        const cid = bytes32FromUuid(id);
        setMatchId(id);
        setChallengeId(cid);
        setStep("creating");
        writeCreate({
          address: CHALLENGE_ESCROW_ADDRESS,
          abi: CHALLENGE_ESCROW_ABI,
          functionName: "createChallenge",
          args: [cid, GAME_SLUG, STAKE_AMOUNT, CHALLENGE_DURATION_SECONDS],
        });
      } else {
        matchAttempt.current = false;
        setError(parseWalletError(err).message);
        setStep("idle");
      }
    }
  }, [address, writeAccept, writeCreate]);

  // After P2 acceptChallenge confirms → register the tx hash server-side → duel.
  useEffect(() => {
    if (!acceptDone || !acceptHash || !matchId) return;
    (async () => {
      try {
        await postAcceptTx({ matchId, acceptTxHash: acceptHash });
        setStep("matched");
        router.replace(`/duel/${matchId}`);
      } catch (e) {
        setError(parseWalletError(e).message);
        // Even if the DB update flakes, the on-chain accept is live; sending
        // them to the duel page is still correct — the status endpoint will
        // reconcile.
        router.replace(`/duel/${matchId}`);
      } finally {
        resetAccept();
      }
    })();
  }, [acceptDone, acceptHash, matchId, router, resetAccept]);

  // After P1 createChallenge confirms → POST /api/duel/queue → enter queued.
  useEffect(() => {
    if (!createDone || !createHash || !address || !matchId) return;
    (async () => {
      try {
        await queueAsCreator({
          address,
          matchId,
          createTxHash: createHash,
        });
        setQueuedAt(Date.now());
        setStep("queued");
      } catch (e) {
        setError(parseWalletError(e).message);
        setStep("idle");
        matchAttempt.current = false;
      } finally {
        resetCreate();
      }
    })();
  }, [createDone, createHash, address, matchId, resetCreate]);

  // Redirect home after expireOpen confirms.
  useEffect(() => {
    if (expireDone) router.replace("/");
  }, [expireDone, router]);

  // ─── Poll status while queued ───────────────────────────────────────────
  const { data: polled } = useQuery<MatchObject>({
    queryKey: ["match-status", matchId],
    queryFn: () => getMatchStatus(matchId!),
    enabled: step === "queued" && Boolean(matchId),
    refetchInterval: 3000,
  });
  useEffect(() => {
    if (!polled || !matchId) return;
    if (
      polled.status === "matched" ||
      polled.status === "player1_submitted" ||
      polled.status === "player2_submitted"
    ) {
      setStep("matched");
      router.replace(`/duel/${matchId}`);
    }
    if (polled.status === "settled" || polled.status === "refunded") {
      router.replace("/");
    }
  }, [polled, matchId, router]);

  // ─── Handlers: reclaim ──────────────────────────────────────────────────
  function handleReclaim() {
    if (!challengeId) {
      router.replace("/");
      return;
    }
    setError(null);
    writeExpire({
      address: CHALLENGE_ESCROW_ADDRESS,
      abi: CHALLENGE_ESCROW_ABI,
      functionName: "expireOpen",
      args: [challengeId],
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const ui = useMemo(() => {
    switch (step) {
      case "resuming":
        return { title: "Checking active matches…", sub: "", button: null, onClick: null, disabled: true };
      case "approve":
        return {
          title: "Approve USDC",
          sub: `One-time approval so the escrow can move your ${STAKE_USDC_LABEL} USDC stake.`,
          button: approveMining
            ? "Confirming tx…"
            : approvePending
              ? "Check your wallet…"
              : "Approve USDC",
          onClick: handleApprove,
          disabled: approvePending || approveMining,
        };
      case "idle":
        return {
          title: "Ready to duel",
          sub: `Stake ${STAKE_USDC_LABEL} USDC. We'll match you with an open challenge — or start a new one if nobody's waiting.`,
          button: "Start Duel",
          onClick: handleStart,
          disabled: false,
        };
      case "matching":
        return { title: "Looking for an opponent…", sub: "", button: null, onClick: null, disabled: true };
      case "accepting":
        return {
          title: "Accepting challenge",
          sub: "Sign the acceptChallenge transaction in your wallet.",
          button: acceptMining ? "Confirming tx…" : acceptPending ? "Check your wallet…" : null,
          onClick: null,
          disabled: true,
        };
      case "creating":
        return {
          title: "Creating challenge",
          sub: "No open challenges right now — you'll be P1. Sign createChallenge in your wallet.",
          button: createMining ? "Confirming tx…" : createPending ? "Check your wallet…" : null,
          onClick: null,
          disabled: true,
        };
      case "queued":
        return {
          title: "Waiting for an opponent…",
          sub: "Your stake is locked on-chain. We'll match you with the next player.",
          button: null,
          onClick: null,
          disabled: false,
        };
      case "matched":
        return { title: "Match found!", sub: "Redirecting to your duel…", button: null, onClick: null, disabled: true };
      case "expired":
        return {
          title: "No opponent after 5 minutes",
          sub: "You can reclaim your stake directly on-chain — it'll call expireOpen() on the escrow.",
          button: expireMining
            ? "Confirming refund…"
            : expirePending
              ? "Check your wallet…"
              : "Reclaim stake",
          onClick: handleReclaim,
          disabled: expirePending || expireMining,
        };
    }
  }, [
    step,
    approvePending,
    approveMining,
    acceptPending,
    acceptMining,
    createPending,
    createMining,
    expirePending,
    expireMining,
    handleStart,
  ]);

  const liveErrorRaw =
    error ?? approveError ?? acceptError ?? createError ?? expireError ?? null;
  const liveError = liveErrorRaw ? parseWalletError(liveErrorRaw) : null;

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        <StepDots current={step} />

        <div className="rounded-2xl border border-border bg-bg-elev p-6 text-center">
          {(step === "queued" || step === "matching") && (
            <div className="mb-6 flex justify-center">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <span className="absolute h-20 w-20 rounded-full bg-skill/20 animate-pulseRing" />
                <span className="absolute h-14 w-14 rounded-full bg-skill/30 animate-pulseRing [animation-delay:300ms]" />
                <span className="relative h-8 w-8 rounded-full bg-skill" />
              </div>
            </div>
          )}

          <h1 className="text-2xl font-semibold">{ui.title}</h1>
          {ui.sub && <p className="mt-2 text-sm text-neutral-400">{ui.sub}</p>}

          {address && (
            <p className="mt-6 font-mono text-xs text-neutral-500">
              {truncateAddress(address)} · Stake {STAKE_USDC_LABEL} USDC
            </p>
          )}

          {ui.button && ui.onClick && (
            <button
              onClick={ui.onClick}
              disabled={ui.disabled}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-skill px-6 text-sm font-semibold text-black transition hover:bg-yellow-400 disabled:opacity-60"
            >
              {ui.button}
            </button>
          )}
          {ui.button && !ui.onClick && (
            <p className="mt-6 text-sm text-neutral-300">{ui.button}</p>
          )}
        </div>

        {liveError && (
          <div
            className={
              "rounded-lg border p-3 text-xs " +
              (liveError.kind === "rejected"
                ? "border-neutral-600 bg-bg-elev2 text-neutral-300"
                : "border-red-500/40 bg-red-500/10 text-red-300")
            }
          >
            {liveError.message}
            {liveError.txHash && (
              <>
                {" · "}
                <a
                  className="underline"
                  href={`https://sepolia.basescan.org/tx/${liveError.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Basescan ↗
                </a>
              </>
            )}
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={() => router.replace("/")}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            {step === "queued" ? "Leave queue" : "Back"}
          </button>
        </div>
      </div>
    </main>
  );
}

function StepDots({ current }: { current: Step }) {
  const order: Step[] = ["approve", "idle", "queued"];
  const labels = ["Approve", "Start", "Duel"];
  // Collapse transient steps onto their logical parent.
  const collapsed: Step =
    current === "matching" || current === "accepting" || current === "creating"
      ? "queued"
      : current === "matched" || current === "expired"
        ? "queued"
        : current === "resuming"
          ? "approve"
          : current;
  const index = order.indexOf(collapsed);
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
              title={labels[i]}
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
