"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import { Board } from "./Board";
import {
  calculateScore,
  createInitialState,
  setThrottle,
  tick,
} from "@/lib/game/engine";
import type { HillState } from "@/lib/game/types";

export const TOURNAMENT_ID = 17n;

/**
 * Hill Climb Racing driver. Runs a requestAnimationFrame loop that calls
 * `tick(state, dt)` with real elapsed time. Keyboard (←/→) and pointer
 * input feed `setThrottle`. On game-over the shared `GameOverSubmit`
 * modal handles the on-chain submit.
 */
export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<HillState>(() => createInitialState(1));
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  // Re-seed on client mount — avoids SSR hydration mismatch.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  // --- rAF loop ---
  useEffect(() => {
    let rafId = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setState((s) => (s.status === "playing" ? tick(s, dt) : s));
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- Keyboard input ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        setState((s) => setThrottle(s, 1));
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        setState((s) => setThrottle(s, -1));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowLeft" ||
        e.key === "a" ||
        e.key === "A" ||
        e.key === "d" ||
        e.key === "D"
      ) {
        setState((s) => setThrottle(s, 0));
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // --- Pointer input (left half = brake, right half = gas) ---
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const onPointer = useCallback(
    (clientX: number, pressed: boolean) => {
      if (!pressed) {
        setState((s) => setThrottle(s, 0));
        return;
      }
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      const val = clientX < mid ? -1 : 1;
      setState((s) => setThrottle(s, val));
    },
    [],
  );

  const finalScore = calculateScore(state);

  const restart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    submit.reset();
  }, [submit]);

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      moves: 0,
      maxTile: Math.floor(state.distance),
      durationMs: state.elapsedMs,
      won: false,
      grid: {
        seed: state.seed,
        distance: Math.floor(state.distance),
        fuelConsumed: Math.floor(state.fuelConsumed),
        elapsedMs: Math.floor(state.elapsedMs),
      },
    });
  }, [submit, finalScore, state]);

  const gameOver = state.status === "gameOver";

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={wrapperRef}
        className="relative select-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          onPointer(e.clientX, true);
        }}
        onPointerUp={(e) => onPointer(e.clientX, false)}
        onPointerCancel={(e) => onPointer(e.clientX, false)}
        onPointerMove={(e) => {
          if (e.pressure > 0 || e.buttons > 0) onPointer(e.clientX, true);
        }}
      >
        <Board state={state} />
        {/* Visual control zones */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-2 text-center text-[10px] uppercase tracking-[0.2em] text-fg/40">
          <div className="flex items-end justify-center pb-2">◀ brake</div>
          <div className="flex items-end justify-center pb-2">gas ▶</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span className="uppercase tracking-[0.15em]">
          ← brake / → gas · tap left / right
        </span>
        <button
          type="button"
          onClick={restart}
          className="min-h-[32px] rounded border border-border bg-surface px-3 text-[11px] uppercase tracking-[0.15em] text-fg hover:border-accent"
        >
          Reset
        </button>
      </div>

      {gameOver && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title="Engine down"
          onPlayAgain={restart}
          onSubmit={handleSubmit}
          playAgainLabel="New Run"
        >
          <div className="mt-3 grid grid-cols-3 gap-2 rounded border border-border bg-surface-2 p-3 text-xs">
            <Stat label="Distance" value={`${Math.floor(state.distance)} m`} />
            <Stat label="Score" value={finalScore} />
            <Stat label="Fuel used" value={Math.floor(state.fuelConsumed)} />
          </div>
        </GameOverSubmit>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted">
        {label}
      </div>
      <div className="text-base leading-none text-fg">{value}</div>
    </div>
  );
}
