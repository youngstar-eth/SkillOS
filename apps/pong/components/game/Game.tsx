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
  PADDLE_MAX_SPEED,
  calculateScore,
  createInitialState,
  setPlayerPaddleVelocity,
  startGame,
  tick,
} from "@/lib/game/engine";
import type { PongState } from "@/lib/game/types";

export const PONG_TOURNAMENT_ID = 5n;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<PongState>(() =>
    createInitialState(Number(PONG_TOURNAMENT_ID) + 1),
  );
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  // Mutable references the rAF loop reads — avoids re-creating the loop
  // on every state/prop change.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const pointerYRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // Re-seed on client mount so re-visits get a fresh ball kick.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  const handleStart = useCallback(() => {
    setSubmit({ status: "idle" });
    setState((s) => startGame(s));
  }, []);

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setSubmit({ status: "idle" });
  }, []);

  // Keyboard — W/S or ↑/↓ set paddle vy.
  useEffect(() => {
    const set = (v: number) =>
      setState((s) => setPlayerPaddleVelocity(s, v));

    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        pointerYRef.current = null; // keyboard mode wins over cursor
        set(-PADDLE_MAX_SPEED);
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        pointerYRef.current = null;
        set(PADDLE_MAX_SPEED);
      } else if (e.key === " " || e.key === "Enter") {
        const st = stateRef.current.status;
        if (st === "ready") {
          e.preventDefault();
          handleStart();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "w", "W", "s", "S"].includes(e.key)) {
        set(0);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [handleStart]);

  // rAF game loop. Only runs while playing; restarts when status flips.
  useEffect(() => {
    if (state.status !== "playing") return;
    lastTickRef.current = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(now - lastTickRef.current, 50); // clamp long pauses
      lastTickRef.current = now;
      setState((s) => tick(s, dt, pointerYRef.current));
      const cur = stateRef.current;
      if (cur.status === "playing") {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [state.status]);

  // ----- Submit score (2048 pattern) ---------------------------------
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
          PONG_TOURNAMENT_ID,
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
          tournamentId: Number(PONG_TOURNAMENT_ID),
          score: finalScore,
          maxTile: state.maxRally,        // repurpose: longest rally
          moves: state.totalRallies,      // repurpose: total paddle hits
          durationMs: state.elapsedMs,
          won: state.playerScore > state.aiScore,
          grid: {
            playerScore: state.playerScore,
            aiScore: state.aiScore,
            totalRallies: state.totalRallies,
            maxRally: state.maxRally,
            seed: state.seed,
            tournamentId: Number(PONG_TOURNAMENT_ID),
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
          PONG_TOURNAMENT_ID,
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

  return (
    <div className="flex flex-col gap-4">
      <ScoreDisplay state={state} />

      <Board
        state={state}
        onPointer={(y) => (pointerYRef.current = y)}
        onPointerLeave={() => (pointerYRef.current = null)}
      />

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span className="uppercase tracking-[0.15em]">
          Mouse / touch follow · W/S or ↑/↓ · 60s match
        </span>
        <div className="flex gap-2">
          {state.status === "ready" && (
            <button
              type="button"
              onClick={handleStart}
              className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-accent hover:bg-accent/20"
            >
              Start match
            </button>
          )}
          <button
            type="button"
            onClick={handleRestart}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-muted hover:border-accent-alt hover:text-accent-alt"
          >
            New
          </button>
        </div>
      </div>

      {state.status === "ready" && (
        <div className="rounded border border-accent/30 bg-accent/5 p-3 text-center text-xs text-accent">
          Tournament #{PONG_TOURNAMENT_ID.toString()} is deterministic — every
          player gets the same serve. Press <b>Space</b> or click{" "}
          <b>Start match</b> to play.
        </div>
      )}

      {state.status === "finished" && (
        <GameOver
          finalScore={finalScore}
          playerScore={state.playerScore}
          aiScore={state.aiScore}
          totalRallies={state.totalRallies}
          maxRally={state.maxRally}
          canSubmit={isConnected && !!address}
          onRestart={handleRestart}
          onSubmit={submitScore}
          submit={submit}
        />
      )}
    </div>
  );
}
