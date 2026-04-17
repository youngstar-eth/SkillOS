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
  move,
  tick,
} from "@/lib/game/engine";
import type { CrossyState } from "@/lib/game/types";

export const TOURNAMENT_ID = 11n;

const SWIPE_THRESHOLD = 28;

type Dir = "up" | "down" | "left" | "right";

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<CrossyState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const [startedAt, setStartedAt] = useState(0);
  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Mount: re-seed for fresh run and start clock.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setStartedAt(Date.now());
  }, []);

  // RAF tick loop — vehicles and logs move each frame.
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

  // Keyboard input.
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      setState((s) => move(s, dir));
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // Touch input — swipe or tap (tap = up).
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      active = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < SWIPE_THRESHOLD) {
        // treat as tap — hop forward (up)
        setState((s) => move(s, "up"));
        return;
      }
      const dir: Dir =
        ax > ay ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      setState((s) => move(s, dir));
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  const restart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setStartedAt(Date.now());
    submit.reset();
  }, [submit]);

  const finalScore = calculateScore(state);

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      maxTile: state.maxY,
      moves: Math.floor(state.elapsedMs),
      durationMs: Date.now() - startedAt,
      won: false,
      grid: {
        maxY: state.maxY,
        seed: state.seed,
        tournamentId: Number(TOURNAMENT_ID),
      },
    });
  }, [finalScore, state, startedAt, submit]);

  const gameOver = state.status === "gameOver";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between text-xs uppercase tracking-[0.15em] text-muted">
        <span>
          Score: <b className="text-fg">{finalScore}</b>
        </span>
        <span>
          MaxY: <b className="text-fg">{state.maxY}</b>
        </span>
      </div>

      <Board state={state} />

      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.15em] text-muted">
        <span>Arrows / WASD · Swipe · Tap = hop</span>
        <button
          type="button"
          onClick={restart}
          className="pixel-button px-3 py-2 text-[11px]"
          style={{ minHeight: 32 }}
        >
          New
        </button>
      </div>

      {gameOver && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title="Squish!"
          onPlayAgain={restart}
          onSubmit={handleSubmit}
        >
          <p className="mt-4 text-sm text-muted">
            Max row reached: <b className="text-fg">{state.maxY}</b>
          </p>
          <p className="text-sm text-muted">
            Final score: <b className="text-fg">{finalScore}</b>
          </p>
        </GameOverSubmit>
      )}
    </div>
  );
}

export { BOARD_HEIGHT };
