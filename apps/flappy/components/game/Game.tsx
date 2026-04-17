"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import sdk from "@farcaster/frame-sdk";
import type { Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Board } from "./Board";
import { ScoreDisplay } from "./ScoreDisplay";
import { GameOver, type SubmitState } from "./GameOver";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";
import {
  calculateScore,
  createInitialState,
  flap,
  tick,
} from "@/lib/game/engine";
import type { FlappyState } from "@/lib/game/types";

// NOTE: the spec called out 11n, but on-chain ordering gave this game id 18.
export const TOURNAMENT_ID = 18n;

const BEST_KEY = "flappy.best";

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<FlappyState>(() => createInitialState(1));
  const [best, setBest] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Seed + best on mount (after hydration so we don't mismatch SSR).
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setStartedAt(Date.now());
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (raw) setBest(parseInt(raw, 10) || 0);
    } catch {
      /* ignore */
    }
  }, []);

  // rAF loop — drives physics while status === "playing".
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (stateRef.current.status === "playing") {
        setState((s) => tick(s, dt));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard — space to flap / start.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setState((s) => flap(s));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Record best when a run ends.
  useEffect(() => {
    if (state.status !== "gameOver") return;
    const final = calculateScore(state);
    if (final > best) {
      setBest(final);
      try {
        localStorage.setItem(BEST_KEY, String(final));
      } catch {
        /* ignore */
      }
    }
  }, [state, best]);

  const handleTap = useCallback(() => {
    setState((s) => flap(s));
  }, []);

  const restart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setStartedAt(Date.now());
    setSubmit({ status: "idle" });
  }, []);

  // ----- Submit score pipeline (mirrors snake/2048) ----------------------
  const writeW = useWriteContract();
  const writeRcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  useEffect(() => {
    if (writeW.error) {
      setSubmit({ status: "error", message: writeW.error.message });
    }
  }, [writeW.error]);

  useEffect(() => {
    if (writeW.data && submit.status === "writing") {
      setSubmit((prev) =>
        prev.status === "writing"
          ? {
              status: "confirming",
              sessionId: prev.sessionId,
              nonce: prev.nonce,
              signature: prev.signature,
              txHash: writeW.data as Hex,
            }
          : prev,
      );
    }
  }, [writeW.data, submit.status]);

  useEffect(() => {
    if (writeRcpt.isSuccess && writeRcpt.data && submit.status === "confirming") {
      setSubmit((prev) =>
        prev.status === "confirming"
          ? {
              status: "done",
              txHash: prev.txHash,
              sessionId: prev.sessionId,
            }
          : prev,
      );
    }
    if (writeRcpt.isError) {
      setSubmit({
        status: "error",
        message: writeRcpt.error?.message ?? "tx failed",
      });
    }
  }, [
    writeRcpt.isSuccess,
    writeRcpt.isError,
    writeRcpt.data,
    writeRcpt.error,
    submit.status,
  ]);

  const finalScore = calculateScore(state);

  const submitScore = useCallback(async () => {
    if (submit.status === "signed") {
      const stashed = submit;
      setSubmit({ ...stashed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          TOURNAMENT_ID,
          BigInt(finalScore),
          BigInt(stashed.nonce),
          stashed.signature,
        ],
      });
      return;
    }

    setSubmit({ status: "signing" });
    try {
      const token = await sdk.quickAuth.getToken();
      const res = await fetch("/api/score", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId: Number(TOURNAMENT_ID),
          score: finalScore,
          pipesPassed: state.score,
          durationMs: state.elapsedMs,
          won: state.status === "gameOver" && state.score > 0,
          grid: {
            pipesPassed: state.score,
            elapsedMs: state.elapsedMs,
            seed: state.seed,
            tournamentId: Number(TOURNAMENT_ID),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const signed: SubmitState = {
        status: "signed",
        sessionId: data.sessionId,
        nonce: data.nonce,
        signature: data.signature as Hex,
      };
      setSubmit(signed);
      setSubmit({ ...signed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          TOURNAMENT_ID,
          BigInt(finalScore),
          BigInt(data.nonce),
          data.signature as Hex,
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmit({ status: "error", message });
    }
  }, [submit, finalScore, state, writeW]);

  const gameOver = state.status === "gameOver";
  const ready = state.status === "ready";

  // Silence unused-var lint for startedAt — kept for future telemetry parity.
  void startedAt;

  return (
    <div className="flex flex-col items-center gap-4">
      <ScoreDisplay score={state.score} best={best} />

      <div
        className="relative cursor-pointer select-none"
        onClick={handleTap}
        onTouchStart={(e) => {
          e.preventDefault();
          handleTap();
        }}
        role="button"
        tabIndex={0}
      >
        <Board state={state} />

        {ready && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className="rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-[rgb(var(--color-fg))] shadow">
              Tap or press space to start
            </p>
          </div>
        )}
      </div>

      <p className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--color-fg))]/60">
        Space / Click / Tap to flap
      </p>

      {gameOver && (
        <GameOver
          score={finalScore}
          pipesPassed={state.score}
          durationMs={state.elapsedMs}
          canSubmit={isConnected && !!address}
          onRestart={restart}
          onSubmit={submitScore}
          submit={submit}
        />
      )}
    </div>
  );
}
