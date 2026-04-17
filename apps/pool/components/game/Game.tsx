"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import { Board } from "./Board";
import {
  BOARD_HEIGHT,
  calculateScore,
  createInitialState,
  setAim,
  shoot,
  tick,
} from "@/lib/game/engine";
import type { PoolState } from "@/lib/game/types";

export const TOURNAMENT_ID = 16n;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<PoolState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  // Re-seed on client mount to avoid SSR hydration mismatch.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  // Simulation loop via rAF.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const s = stateRef.current;
      if (s.status === "simulating") {
        setState((prev) => tick(prev, dt));
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Pointer drag to aim + power.
  const dragRef = useRef<{
    active: boolean;
    cueX: number;
    cueY: number;
  } | null>(null);

  const handlePointerDown = useCallback((p: { x: number; y: number }) => {
    const s = stateRef.current;
    if (s.status !== "aiming") return;
    const cue = s.balls.find((b) => b.isCue && !b.pocketed);
    if (!cue) return;
    dragRef.current = { active: true, cueX: cue.x, cueY: cue.y };
    // Aim toward cursor with zero initial power (pull-back model).
    const angle = Math.atan2(p.y - cue.y, p.x - cue.x);
    setState((prev) => setAim(prev, angle, 0));
  }, []);

  const handlePointerMove = useCallback((p: { x: number; y: number }) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    const s = stateRef.current;
    if (s.status !== "aiming") return;
    // Aim points in the direction of intended travel (away from drag).
    const dx = drag.cueX - p.x;
    const dy = drag.cueY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const power = Math.max(0, Math.min(1, dist / 180));
    setState((prev) => setAim(prev, angle, power));
  }, []);

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    dragRef.current = null;
    const s = stateRef.current;
    if (s.status !== "aiming") return;
    if (s.aimPower <= 0.02) return; // too weak — cancel shot
    setState((prev) => shoot(prev));
  }, []);

  const finalScore = calculateScore(state);

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    submit.reset();
  }, [submit]);

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      won: state.status === "finished",
      grid: {
        seed: state.seed,
        shots: state.shotsFired,
        fouls: state.fouls,
        pocketed: state.ballsPocketed,
        elapsedMs: state.elapsedMs,
      },
    });
  }, [finalScore, state, submit]);

  const remainingBalls = state.balls.filter(
    (b) => !b.isCue && !b.pocketed,
  ).length;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[800px] items-center justify-between text-xs text-muted">
        <span>
          Pocketed: <b className="text-fg">{state.ballsPocketed}</b> / 15
        </span>
        <span>
          Shots: <b className="text-fg">{state.shotsFired}</b>
        </span>
        <span>
          Fouls: <b className="text-fg">{state.fouls}</b>
        </span>
        <span>
          Score: <b className="text-accent">{finalScore}</b>
        </span>
      </div>

      <div className="flex w-full max-w-[800px] items-stretch gap-3">
        <div className="flex-1">
          <Board
            state={state}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </div>
        <div className="flex w-5 flex-col items-center justify-end overflow-hidden rounded border border-border bg-fg/5">
          <div
            className="w-full"
            style={{
              height: `${Math.round(state.aimPower * 100)}%`,
              background:
                "linear-gradient(to top, rgba(200,170,100,0.9), rgba(255,80,80,0.9))",
              transition: state.status === "aiming" ? "none" : "height 200ms",
            }}
            aria-label="power meter"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 text-xs text-muted">
        <span>
          Drag from the cue ball — further = stronger. Release to shoot.
        </span>
        <button
          type="button"
          onClick={handleRestart}
          className="rounded border border-border px-3 py-1 text-xs font-semibold uppercase tracking-widest text-fg hover:bg-fg/10"
        >
          New rack
        </button>
      </div>

      {state.status === "finished" && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title="Rack cleared"
          onPlayAgain={handleRestart}
          onSubmit={handleSubmit}
        >
          <p className="mt-4 text-sm text-muted">
            Cleared {15 - remainingBalls} balls in {state.shotsFired} shots ·{" "}
            {(state.elapsedMs / 1000).toFixed(1)}s
          </p>
          <p className="mt-1 text-sm text-muted">
            Final score: <b className="text-fg">{finalScore}</b>
          </p>
        </GameOverSubmit>
      )}
    </div>
  );
}
