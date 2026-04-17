"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import {
  calculateScore,
  createInitialState,
  jump,
  tick,
} from "@/lib/game/engine";
import type { GeometryState } from "@/lib/game/types";
import { Board } from "./Board";

export const TOURNAMENT_ID = 12n;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<GeometryState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const [deathFlash, setDeathFlash] = useState(false);
  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Re-seed on mount to avoid SSR hydration mismatch
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  // rAF loop
  useEffect(() => {
    if (state.status !== "playing") return;
    let rafId = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setState((s) => tick(s, dt));
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [state.status]);

  // Trigger glitch animation on death transition
  useEffect(() => {
    if (state.status === "gameOver") {
      setDeathFlash(true);
      const t = window.setTimeout(() => setDeathFlash(false), 500);
      return () => window.clearTimeout(t);
    }
  }, [state.status]);

  const handleJump = useCallback(() => {
    setState((s) => jump(s));
  }, []);

  // Keyboard: Space = jump
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        handleJump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleJump]);

  const finalScore = calculateScore(state);

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    submit.reset();
  }, [submit]);

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      won: false,
      grid: {
        seed: state.seed,
        distance: Math.floor(state.distance),
        elapsedMs: Math.floor(state.elapsedMs),
      },
    });
  }, [finalScore, state, submit]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          distance
        </span>
        <span className="glitch-text font-mono text-2xl font-bold">
          {finalScore.toString().padStart(5, "0")}
        </span>
      </div>

      <Board state={state} onTap={handleJump} deathFlash={deathFlash} />

      <p className="text-center text-xs uppercase tracking-[0.15em] text-muted">
        ␣ space · tap · click to jump
      </p>

      {state.status === "gameOver" && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title="GAME OVER"
          onPlayAgain={handleRestart}
          onSubmit={handleSubmit}
        >
          <p className="mt-4 text-sm text-muted">
            Final distance: <b className="text-accent">{finalScore}</b>
          </p>
        </GameOverSubmit>
      )}
    </div>
  );
}
