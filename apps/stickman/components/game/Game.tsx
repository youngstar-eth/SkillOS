"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import {
  attachRope,
  calculateScore,
  createInitialState,
  releaseRope,
  tick,
} from "@/lib/game/engine";
import type { StickmanState } from "@/lib/game/types";
import { Board } from "./Board";

/** Stickman Hook tournament ID on Base Sepolia ArcadePool. */
export const TOURNAMENT_ID = 14n;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<StickmanState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  // Fresh seed per client session to avoid SSR hydration mismatch.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  // Main physics loop via rAF, driven by dt between frames.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setState((s) => (s.status === "playing" ? tick(s, dt) : s));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handlePointerDown = useCallback((wx: number, wy: number) => {
    setState((s) => attachRope(s, wx, wy));
  }, []);

  const handlePointerUp = useCallback(() => {
    setState((s) => releaseRope(s));
  }, []);

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    submit.reset();
  }, [submit]);

  const finalScore = calculateScore(state);

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      won: state.status === "won",
      grid: {
        seed: state.seed,
        distance: Math.floor(state.distance),
        status: state.status,
      },
    });
  }, [finalScore, state, submit]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between text-sm">
        <span className="text-muted">
          Distance:{" "}
          <b className="text-fg">{Math.floor(state.distance)}</b>
        </span>
        <span className="text-muted">
          Score: <b className="text-fg">{finalScore}</b>
        </span>
      </div>

      <Board
        state={state}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />

      <p className="text-xs uppercase tracking-[0.15em] text-muted">
        Press &amp; hold on an anchor to swing · release to let go
      </p>

      {state.status !== "playing" && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title={state.status === "won" ? "You win" : "Game over"}
          onPlayAgain={handleRestart}
          onSubmit={handleSubmit}
        >
          <p className="mt-4 text-sm text-muted">
            Final score: <b className="text-fg">{finalScore}</b>
          </p>
        </GameOverSubmit>
      )}
    </div>
  );
}
