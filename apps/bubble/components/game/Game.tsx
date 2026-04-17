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
import { ScoreHUD } from "./ScoreHUD";
import { GameOver, type SubmitState } from "./GameOver";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";
import {
  SHOOTER_X,
  SHOOTER_Y,
  calculateScore,
  createInitialState,
  setAim,
  shoot,
  tick,
} from "@/lib/game/engine";
import type { BubbleState } from "@/lib/game/types";

export const BUBBLE_TOURNAMENT_ID = 8n;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<BubbleState>(() =>
    createInitialState(Number(BUBBLE_TOURNAMENT_ID) + 1),
  );
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);

  // Re-seed on mount so repeat visits aren't identical.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  const handlePointer = useCallback((x: number, y: number) => {
    // atan2 gives angle from shooter to pointer; we rotate so that 0 = up.
    const dx = x - SHOOTER_X;
    const dy = SHOOTER_Y - y; // positive when pointer is above shooter
    // Only aim when pointer is above the shooter; clamp otherwise.
    if (dy <= 0) return;
    const angle = Math.atan2(dx, dy);
    setState((s) => setAim(s, angle));
  }, []);

  const handleShoot = useCallback(() => {
    setState((s) => shoot(s));
  }, []);

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setSubmit({ status: "idle" });
  }, []);

  // rAF loop — only needed while a bubble is in flight. Starts up on
  // status change to `flying`, winds down when attached.
  useEffect(() => {
    if (state.status !== "flying") return;
    lastRef.current = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(now - lastRef.current, 50);
      lastRef.current = now;
      setState((s) => tick(s, dt));
      if (stateRef.current.status === "flying") {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [state.status]);

  // Keyboard: Space/Enter shoot, ←→ fine-tune aim.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if ((e.key === " " || e.key === "Enter") && s.status === "aiming") {
        e.preventDefault();
        handleShoot();
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        setState((cur) => setAim(cur, cur.aimAngle - 0.05));
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        setState((cur) => setAim(cur, cur.aimAngle + 0.05));
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [handleShoot]);

  // ----- Submit score (2048 pattern) -----
  const writeW = useWriteContract();
  const writeRcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  useEffect(() => {
    if (writeW.error) setSubmit({ status: "error", message: writeW.error.message });
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
          ? { status: "done", txHash: prev.txHash, sessionId: prev.sessionId }
          : prev,
      );
    }
    if (writeRcpt.isError) {
      setSubmit({ status: "error", message: writeRcpt.error?.message ?? "tx failed" });
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
          BUBBLE_TOURNAMENT_ID,
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
          tournamentId: Number(BUBBLE_TOURNAMENT_ID),
          score: finalScore,
          maxTile: state.maxCombo,
          moves: state.shotsFired,
          durationMs: 0,
          won: state.status === "won",
          grid: {
            score: state.score,
            bubblesPopped: state.bubblesPopped,
            maxCombo: state.maxCombo,
            shotsFired: state.shotsFired,
            rowsAdded: state.rowsAdded,
            seed: state.seed,
            tournamentId: Number(BUBBLE_TOURNAMENT_ID),
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
          BUBBLE_TOURNAMENT_ID,
          BigInt(finalScore),
          BigInt(data.nonce),
          data.signature as Hex,
        ],
      });
    } catch (err) {
      setSubmit({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [submit, finalScore, state, writeW]);

  const terminal = state.status === "gameOver" || state.status === "won";

  return (
    <div className="flex flex-col gap-4">
      <ScoreHUD state={state} />

      <Board state={state} onPointer={handlePointer} onShoot={handleShoot} />

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>Aim with cursor · click or Space to shoot · ←→ fine-tune</span>
        <button
          type="button"
          onClick={handleRestart}
          className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted hover:border-accent hover:text-accent"
        >
          Restart
        </button>
      </div>

      {terminal && (
        <GameOver
          won={state.status === "won"}
          finalScore={finalScore}
          score={state.score}
          bubblesPopped={state.bubblesPopped}
          maxCombo={state.maxCombo}
          shotsFired={state.shotsFired}
          canSubmit={isConnected && !!address}
          onRestart={handleRestart}
          onSubmit={submitScore}
          submit={submit}
        />
      )}
    </div>
  );
}
