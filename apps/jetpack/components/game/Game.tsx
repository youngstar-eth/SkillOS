"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import { Board } from "./Board";
import {
  calculateScore,
  createInitialState,
  setThrust,
  tick,
} from "@/lib/game/engine";
import type { JetpackState } from "@/lib/game/types";

export const TOURNAMENT_ID = 13n;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<JetpackState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  // Re-seed on client mount.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  // rAF loop
  useEffect(() => {
    if (state.status !== "playing") return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setState((s) => tick(s, dt));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.status]);

  // Thrust: space key + pointer down/up
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setState((s) => setThrust(s, true));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setState((s) => setThrust(s, false));
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onPointerDown = useCallback(() => {
    setState((s) => setThrust(s, true));
  }, []);
  const onPointerUp = useCallback(() => {
    setState((s) => setThrust(s, false));
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
      won: state.status === "gameOver" && finalScore > 0,
      grid: {
        seed: state.seed,
        distance: Math.floor(state.distance),
        coins: state.coinsCollected,
      },
    });
  }, [finalScore, state, submit]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between text-xs uppercase tracking-[0.2em] text-accent">
        <span className="neon">DIST {Math.floor(state.distance)}m</span>
        <span className="neon text-gold">COINS {state.coinsCollected}</span>
        <span className="neon">SCORE {finalScore}</span>
      </div>

      <div
        className="relative w-full max-w-full touch-none select-none cyber-grid"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <Board state={state} />
      </div>

      <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
        TAP / HOLD SPACE = THRUST
      </p>

      {state.status === "gameOver" && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title="Jetpack down"
          onPlayAgain={handleRestart}
          onSubmit={handleSubmit}
        >
          <p className="mt-4 text-sm text-muted">
            Distance: <b className="text-fg">{Math.floor(state.distance)}m</b>{" "}
            · Coins: <b className="text-gold">{state.coinsCollected}</b>
          </p>
          <p className="mt-1 text-sm text-muted">
            Final score: <b className="text-fg">{finalScore}</b>
          </p>
        </GameOverSubmit>
      )}
    </div>
  );
}
