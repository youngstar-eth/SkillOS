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
  calculateScore,
  createInitialState,
  launchBall,
  tick,
} from "@/lib/game/engine";
import type { BreakoutState } from "@/lib/game/types";

export const BREAKOUT_TOURNAMENT_ID = 7n;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<BreakoutState>(() =>
    createInitialState(Number(BREAKOUT_TOURNAMENT_ID) + 1),
  );
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const pointerXRef = useRef<number | null>(null);
  const keyDirRef = useRef<-1 | 0 | 1>(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // Re-seed on client mount — ensures first-match kicks vary per session.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  const handleLaunch = useCallback(() => {
    setState((s) => launchBall(s));
  }, []);

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setSubmit({ status: "idle" });
  }, []);

  // Keyboard — arrows or A/D drive paddle via pointer shim; Space launches.
  useEffect(() => {
    const pressed = new Set<string>();
    const updateDir = () => {
      const left = pressed.has("ArrowLeft") || pressed.has("a") || pressed.has("A");
      const right = pressed.has("ArrowRight") || pressed.has("d") || pressed.has("D");
      keyDirRef.current = left && !right ? -1 : right && !left ? 1 : 0;
    };

    const down = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space" || e.key === "Enter") {
        if (stateRef.current.status === "ready") {
          e.preventDefault();
          handleLaunch();
        }
        return;
      }
      pressed.add(e.key);
      updateDir();
    };
    const up = (e: KeyboardEvent) => {
      pressed.delete(e.key);
      updateDir();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [handleLaunch]);

  // rAF loop — runs whenever the ball can move (playing or ready).
  useEffect(() => {
    const active = state.status === "playing" || state.status === "ready";
    if (!active) return;
    lastTickRef.current = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(now - lastTickRef.current, 50);
      lastTickRef.current = now;

      // Keyboard → synthesize a targetX by nudging the current paddle position.
      const cur = stateRef.current;
      let targetX = pointerXRef.current;
      if (keyDirRef.current !== 0) {
        const speed = 10 * (dt / 16.666);
        const centre = cur.paddle.x + cur.paddle.width / 2;
        targetX = centre + keyDirRef.current * speed;
      }
      setState((s) => tick(s, dt, targetX));

      const nextStatus = stateRef.current.status;
      if (nextStatus === "playing" || nextStatus === "ready") {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [state.status]);

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
          BREAKOUT_TOURNAMENT_ID,
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
          tournamentId: Number(BREAKOUT_TOURNAMENT_ID),
          score: finalScore,
          maxTile: state.maxCombo,          // longest combo
          moves: state.level,               // levels reached
          durationMs: state.elapsedMs,
          won: state.status === "won",
          grid: {
            score: state.score,
            maxCombo: state.maxCombo,
            level: state.level,
            livesLost: 3 - state.lives,
            seed: state.seed,
            tournamentId: Number(BREAKOUT_TOURNAMENT_ID),
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
          BREAKOUT_TOURNAMENT_ID,
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

      <Board
        state={state}
        onPointer={(x) => (pointerXRef.current = x)}
        onLaunch={handleLaunch}
      />

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span className="uppercase tracking-[0.15em]">
          Mouse/touch to move · ←→ or A/D · Space/click to launch
        </span>
        <div className="flex gap-2">
          {state.status === "ready" && (
            <button
              type="button"
              onClick={handleLaunch}
              className="rounded border border-synth-cyan bg-synth-cyan/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-synth-cyan hover:bg-synth-cyan/20"
            >
              Launch
            </button>
          )}
          <button
            type="button"
            onClick={handleRestart}
            className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-muted hover:border-synth-pink hover:text-synth-pink"
          >
            Reset
          </button>
        </div>
      </div>

      {state.status === "ready" && state.level === 1 && state.lives === 3 && state.score === 0 && (
        <div className="rounded border border-synth-cyan/40 bg-synth-cyan/5 p-3 text-center text-xs text-synth-cyan">
          Tournament #{BREAKOUT_TOURNAMENT_ID.toString()} — five levels, three
          lives. Launch when ready.
        </div>
      )}

      {terminal && (
        <GameOver
          won={state.status === "won"}
          finalScore={finalScore}
          score={state.score}
          maxCombo={state.maxCombo}
          level={state.level}
          canSubmit={isConnected && !!address}
          onRestart={handleRestart}
          onSubmit={submitScore}
          submit={submit}
        />
      )}
    </div>
  );
}
