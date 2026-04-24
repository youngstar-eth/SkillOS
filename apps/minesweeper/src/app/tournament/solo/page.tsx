"use client";

// ───────────────────────────────────────────────────────────────────────────
// /tournament/solo — solo submit primary path (Tournaments v2).
//
// State machine:
//
//   playing   → user plays a round; onScoreChange tracks liveScore
//   submitting → game ended; POSTing to /api/tournaments/[id]/solo without
//               feeTxHash. On 200 → submitted. On 402 → awaiting-fee.
//   awaiting-fee → server said "pay first". We show "Retry (1 USDC)" CTA.
//   paying-fee → wallet prompts: approve (if needed) → chargeRetryFee. On
//                success → re-POST with feeTxHash.
//   submitted → rank + score displayed; "Play again" starts a new round
//               (which will take the paid path because ≥1 solo_runs exists).
//   error     → blocked; retry button available
//
// The "try-free-first, fall-back-to-402" pattern avoids an extra
// GET request to determine free-vs-paid on mount. The endpoint is the
// single source of truth — it counts prior solo_runs and tells us.
//
// Fee payment is a 2-tx dance: USDC approve (one-shot max) + chargeRetryFee.
// Approval is cached by the contract so after the first retry, subsequent
// retries skip directly to chargeRetryFee — 1 wallet confirmation instead of 2.
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Hex, maxUint256 } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  ERC20_ABI,
  PLAY_WINDOW_MS,
  RETRY_FEE,
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V2_ADDRESS,
  USDC_ADDRESS,
} from "@skillbase/contracts";
import { Timer, parseWalletError } from "@skillbase/ui";
import { GameMinesweeper } from "@/components/GameMinesweeper";
import { AICoach } from "@/components/AICoach";
import { AIRecap } from "@/components/AIRecap";
import { AIReviewedBadge } from "@/components/AIReviewedBadge";

const GAME = "minesweeper";

// ─── Types ─────────────────────────────────────────────────────────────────

type Tournament = {
  id: string;
  onChainId: Hex;
  game: string;
  cycleType: "daily" | "weekly";
  endsAt: string;
  prizePoolUsdc: string;
  entryCount: number;
};

type ActiveResponse = {
  daily: Tournament | null;
  weekly: Tournament | null;
};

type SoloSubmitResponse = {
  submitted: boolean;
  soloRunId: string;
  rank: number;
  bestScore: number;
  matchCount: number;
  isPaidRetry: boolean;
  txHash: string | null;
};

type Status =
  | "playing"
  | "submitting"
  | "awaiting-fee"
  | "paying-fee"
  | "submitted"
  | "error";

// ─── Data ──────────────────────────────────────────────────────────────────

async function fetchActive(): Promise<ActiveResponse> {
  const res = await fetch("/api/tournaments", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ActiveResponse;
}

async function postSolo(params: {
  tournamentDbId: string;
  body: { playerAddress: string; score: number; feeTxHash?: string };
}): Promise<{ ok: true; data: SoloSubmitResponse } | { ok: false; status: number; code: string; message: string }> {
  const res = await fetch(`/api/tournaments/${params.tournamentDbId}/solo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params.body),
  });
  if (res.ok) {
    const data = (await res.json()) as SoloSubmitResponse;
    return { ok: true, data };
  }
  const err = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  return {
    ok: false,
    status: res.status,
    code: err.error ?? `http_${res.status}`,
    message: err.message ?? res.statusText,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────

function randomSeed(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function useCountdown(targetIso: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!targetIso) return "";
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 0) return "Closing…";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function SoloPage() {
  const router = useRouter();
  const { address } = useAccount();

  const [seed, setSeed] = useState(() => randomSeed());
  const [liveScore, setLiveScore] = useState(0);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("playing");
  const [result, setResult] = useState<SoloSubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bounded session timer — mirrors duel's 2-minute play window. Required
  // for clicker + match3 (no natural end state); benign for games that
  // game-over organically. Reset per round via the seed-keyed useMemo.
  const playDeadline = useMemo(
    () => new Date(Date.now() + PLAY_WINDOW_MS).toISOString(),
    [seed],
  );

  const { data: activeData } = useQuery({
    queryKey: ["tournaments", "active", GAME, "solo"],
    queryFn: fetchActive,
    refetchInterval: 30_000,
  });
  const tournament = activeData?.daily ?? null;
  const countdown = useCountdown(tournament?.endsAt);

  // ─── USDC allowance check ────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, TOURNAMENT_POOL_V2_ADDRESS] : undefined,
    query: { enabled: !!address },
  });
  const hasAllowance =
    typeof allowance === "bigint" && allowance >= RETRY_FEE;

  // ─── Approve tx ──────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approvePending,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: approveMining, isSuccess: approveDone } =
    useWaitForTransactionReceipt({ hash: approveHash });
  useEffect(() => {
    if (approveDone) {
      refetchAllowance();
      resetApprove();
    }
  }, [approveDone, refetchAllowance, resetApprove]);

  // ─── chargeRetryFee tx ───────────────────────────────────────────────
  const {
    writeContract: writeCharge,
    data: chargeHash,
    isPending: chargePending,
    reset: resetCharge,
  } = useWriteContract();
  const { isLoading: chargeMining, isSuccess: chargeDone } =
    useWaitForTransactionReceipt({ hash: chargeHash });

  // When chargeRetryFee confirms, re-POST to /solo with feeTxHash.
  const chargeHandled = useRef<Hex | null>(null);
  useEffect(() => {
    if (!chargeDone || !chargeHash || !address || !tournament || finalScore == null) {
      return;
    }
    if (chargeHandled.current === chargeHash) return; // dedupe on re-render
    chargeHandled.current = chargeHash;
    void finalizeSoloSubmit(chargeHash);
    // finalizeSoloSubmit is stable via the refs below; missing in deps on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeDone, chargeHash, address, tournament?.id, finalScore]);

  // ─── Submit flow ─────────────────────────────────────────────────────

  async function trySubmit(score: number, feeTxHash?: Hex) {
    if (!tournament || !address) return;
    setError(null);
    const res = await postSolo({
      tournamentDbId: tournament.id,
      body: {
        playerAddress: address,
        score,
        ...(feeTxHash ? { feeTxHash } : {}),
      },
    });
    if (res.ok) {
      setResult(res.data);
      setStatus("submitted");
      return;
    }
    if (res.status === 402) {
      setStatus("awaiting-fee");
      return;
    }
    if (res.status === 429) {
      setError(res.message);
      setStatus("error");
      return;
    }
    setError(`${res.code}: ${res.message}`);
    setStatus("error");
  }

  const handleGameOver = useCallback(
    async (score: number) => {
      if (finalScore != null) return; // guard against double-fire
      setFinalScore(score);
      setStatus("submitting");
      await trySubmit(score);
    },
    // trySubmit closes over tournament + address; both re-read every call. OK.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finalScore, tournament?.id, address],
  );

  // Timer expiry submits with the current liveScore. For clicker/match3 this
  // is the only end-condition; for games that can game-over earlier, the
  // natural onGameOver wins the race (handleGameOver guards on finalScore).
  const handleTimerExpire = useCallback(() => {
    if (finalScore != null) return;
    void handleGameOver(liveScore);
  }, [finalScore, liveScore, handleGameOver]);

  function handlePayRetry() {
    if (!address || !tournament || finalScore == null) return;
    setError(null);
    setStatus("paying-fee");
    if (!hasAllowance) {
      writeApprove(
        {
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [TOURNAMENT_POOL_V2_ADDRESS, maxUint256],
        },
        {
          onError: (e) => {
            setError(parseWalletError(e).message);
            setStatus("awaiting-fee");
          },
        },
      );
      return;
    }
    writeCharge(
      {
        address: TOURNAMENT_POOL_V2_ADDRESS,
        abi: TOURNAMENT_POOL_ABI,
        functionName: "chargeRetryFee",
        args: [tournament.onChainId, address],
      },
      {
        onError: (e) => {
          setError(parseWalletError(e).message);
          setStatus("awaiting-fee");
        },
      },
    );
  }

  // After approve succeeds, automatically chain chargeRetryFee.
  useEffect(() => {
    if (
      status === "paying-fee" &&
      approveDone &&
      hasAllowance &&
      !chargeHash &&
      address &&
      tournament
    ) {
      writeCharge(
        {
          address: TOURNAMENT_POOL_V2_ADDRESS,
          abi: TOURNAMENT_POOL_ABI,
          functionName: "chargeRetryFee",
          args: [tournament.onChainId, address],
        },
        {
          onError: (e) => {
            setError(parseWalletError(e).message);
            setStatus("awaiting-fee");
          },
        },
      );
    }
  }, [status, approveDone, hasAllowance, chargeHash, address, tournament, writeCharge]);

  async function finalizeSoloSubmit(feeTxHash: Hex) {
    if (finalScore == null) return;
    setStatus("submitting");
    await trySubmit(finalScore, feeTxHash);
  }

  function handlePlayAgain() {
    setSeed(randomSeed());
    setLiveScore(0);
    setFinalScore(null);
    setResult(null);
    setError(null);
    setStatus("playing");
    resetCharge();
    chargeHandled.current = null;
  }

  // ─── Render ─────────────────────────────────────────────────────────

  const walletBusy =
    approvePending || approveMining || chargePending || chargeMining;

  if (!address) {
    return (
      <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4">
        <p className="text-sm text-neutral-400">
          Connect your wallet to play solo.
        </p>
      </main>
    );
  }
  if (!tournament) {
    return (
      <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4">
        <p className="text-sm text-neutral-400">
          No active tournament. The next one opens at the top of the hour.
        </p>
        <Link
          href="/tournament"
          className="mt-4 text-xs text-neutral-500 underline-offset-4 hover:underline"
        >
          ← back to tournaments
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex w-full max-w-md items-center justify-between gap-3">
        <button
          onClick={() => router.push("/tournament")}
          className="rounded-lg border border-border-subtle bg-bg-elev px-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-100"
        >
          ← Exit
        </button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            Solo · {tournament.cycleType}
          </p>
          <p className="font-mono text-[10px] text-neutral-500">
            closes in {countdown}
          </p>
        </div>
        {finalScore == null ? (
          <Timer deadline={playDeadline} onExpire={handleTimerExpire} />
        ) : (
          <div className="w-[52px]" />
        )}
      </div>

      {/* Live score */}
      <div className="mb-4 w-full max-w-md rounded-xl border border-skill/50 bg-skill/5 p-3 text-center">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">
          Your score
        </p>
        <p className="mt-0.5 text-3xl font-bold tabular-nums text-neutral-100">
          {finalScore ?? liveScore}
        </p>
      </div>

      <GameMinesweeper
        seed={seed}
        onGameOver={handleGameOver}
        onScoreChange={setLiveScore}
        frozen={finalScore != null}
      />

      {/* Post-game panel */}
      {finalScore != null && (
        <div className="mt-6 w-full max-w-md space-y-3">
          {status === "submitting" && (
            <Panel>
              <p className="text-sm text-neutral-300">
                Submitting {finalScore} points…
              </p>
            </Panel>
          )}

          {status === "awaiting-fee" && (
            <Panel>
              <p className="text-sm font-semibold text-neutral-100">
                First entry already used
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Pay 1.00 USDC to submit this run. Fees fund platform operations —
                they don't touch the prize pool.
              </p>
              <button
                onClick={handlePayRetry}
                disabled={walletBusy}
                className="mt-3 w-full rounded-lg bg-skill px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {hasAllowance
                  ? "Pay 1.00 USDC & submit"
                  : "Approve USDC + pay"}
              </button>
            </Panel>
          )}

          {status === "paying-fee" && (
            <Panel>
              <p className="text-sm text-neutral-300">
                {!hasAllowance && approvePending && "Approving USDC…"}
                {!hasAllowance && approveMining && "Waiting for approval receipt…"}
                {(hasAllowance || approveDone) && chargePending && "Paying retry fee…"}
                {(hasAllowance || approveDone) && chargeMining && "Waiting for fee receipt…"}
              </p>
            </Panel>
          )}

          {status === "submitted" && result && (
            <>
              <Panel highlight>
                <p className="text-sm font-semibold text-neutral-100">
                  Score submitted ✓ {result.bestScore} points
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  Rank #{result.rank} · {result.matchCount}{" "}
                  {result.matchCount === 1 ? "run" : "runs"} submitted
                  {result.isPaidRetry ? " · 1.00 USDC fee" : " · free entry"}
                </p>
                <div className="mt-3">
                  <AIReviewedBadge
                    matchId={result.soloRunId}
                    context="solo"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handlePlayAgain}
                    className="flex-1 rounded-lg bg-skill px-3 py-2 text-sm font-semibold text-black hover:opacity-90"
                  >
                    Play again (1.00 USDC)
                  </button>
                  <Link
                    href="/tournament"
                    className="flex-1 rounded-lg border border-border bg-bg-elev px-3 py-2 text-center text-sm font-semibold text-neutral-200 hover:bg-bg-elev2"
                  >
                    View tournament
                  </Link>
                </div>
              </Panel>
              <AIRecap matchId={result.soloRunId} context="solo" />
              <AICoach matchId={result.soloRunId} context="solo" />
            </>
          )}

          {status === "error" && (
            <Panel tone="error">
              <p className="text-sm text-red-300">{error ?? "Something went wrong."}</p>
              <button
                onClick={() => {
                  setError(null);
                  if (finalScore != null) void trySubmit(finalScore);
                }}
                className="mt-2 text-xs underline"
              >
                Try again
              </button>
            </Panel>
          )}
        </div>
      )}
    </main>
  );
}

// ─── Presentational ───────────────────────────────────────────────────────

function Panel({
  children,
  highlight,
  tone,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  tone?: "error";
}) {
  const base = "rounded-xl border p-4";
  const cls =
    tone === "error"
      ? `${base} border-red-500/40 bg-red-500/10`
      : highlight
        ? `${base} border-skill/50 bg-skill/5`
        : `${base} border-border bg-bg-elev`;
  return <div className={cls}>{children}</div>;
}
