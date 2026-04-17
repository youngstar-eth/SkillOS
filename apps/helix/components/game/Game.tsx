"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import {
  calculateScore,
  createInitialState,
  rotateCylinder,
  tick,
} from "@/lib/game/engine";
import type { HelixState } from "@/lib/game/types";
import { Board } from "./Board";

/**
 * Tournament ID for Helix on Base Sepolia.
 * (On-chain ordering puts this at 19.)
 */
export const TOURNAMENT_ID = 19n;

const ROTATE_STEP = Math.PI / 24;
const DRAG_SENSITIVITY = 0.012; // radians per CSS pixel

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<HelixState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const [startedAt, setStartedAt] = useState(0);
  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Mount: new seed + fresh clock.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setStartedAt(Date.now());
  }, []);

  // rAF loop.
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

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setState((s) => rotateCylinder(s, -ROTATE_STEP));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setState((s) => rotateCylinder(s, ROTATE_STEP));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Drag controls (mouse + touch).
  const dragRef = useRef<{ x: number; active: boolean }>({ x: 0, active: false });
  useEffect(() => {
    const onDown = (clientX: number) => {
      dragRef.current = { x: clientX, active: true };
    };
    const onMove = (clientX: number) => {
      if (!dragRef.current.active) return;
      const dx = clientX - dragRef.current.x;
      dragRef.current.x = clientX;
      setState((s) => rotateCylinder(s, dx * DRAG_SENSITIVITY));
    };
    const onUp = () => {
      dragRef.current.active = false;
    };

    const md = (e: MouseEvent) => onDown(e.clientX);
    const mm = (e: MouseEvent) => onMove(e.clientX);
    const mu = () => onUp();
    const td = (e: TouchEvent) => {
      if (e.touches.length === 1) onDown(e.touches[0].clientX);
    };
    const tm = (e: TouchEvent) => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX);
    };
    const tu = () => onUp();

    window.addEventListener("mousedown", md);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("touchstart", td, { passive: true });
    window.addEventListener("touchmove", tm, { passive: true });
    window.addEventListener("touchend", tu);
    return () => {
      window.removeEventListener("mousedown", md);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("touchstart", td);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", tu);
    };
  }, []);

  const restart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setStartedAt(Date.now());
    submit.reset();
  }, [submit]);

  const finalScore = calculateScore(state);
  const gameOver = state.status === "gameOver";

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      maxTile: state.combo,
      moves: state.score,
      durationMs: Date.now() - startedAt,
      won: false,
      grid: {
        seed: state.seed,
        score: state.score,
        combo: state.combo,
        tournamentId: Number(TOURNAMENT_ID),
      },
    });
  }, [finalScore, state, startedAt, submit]);

  return (
    <div className="flex flex-col items-center gap-4">
      <Board state={state} />

      <p className="text-center text-xs uppercase tracking-[0.15em] text-muted">
        Drag to rotate · Arrows left/right · Pass the gaps, chain the combo
      </p>

      {gameOver && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title="Game over"
          onPlayAgain={restart}
          onSubmit={handleSubmit}
        >
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label="Score" value={finalScore} />
            <Stat label="Passed" value={state.score} />
            <Stat label="Best combo" value={state.combo} />
          </div>
        </GameOverSubmit>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-surface p-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
        {label}
      </div>
      <div className="text-lg text-fg">{value}</div>
    </div>
  );
}
