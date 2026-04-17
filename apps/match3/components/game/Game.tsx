"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import { Board } from "./Board";
import {
  areAdjacent,
  calculateScore,
  createInitialState,
  resolve,
  swap,
} from "@/lib/game/engine";
import type { Match3State } from "@/lib/game/types";

export const TOURNAMENT_ID = 10n;

export function Game() {
  const { address, isConnected } = useAccount();

  // SSR-stable initial state; re-seed on client mount.
  const [state, setState] = useState<Match3State>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  // Cascade resolution — short delay between swap and pop for visual beat.
  useEffect(() => {
    if (state.status !== "resolving") return;
    const id = window.setTimeout(() => {
      setState((s) => resolve(s));
    }, 300);
    return () => window.clearTimeout(id);
  }, [state.status]);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      setState((s) => {
        if (s.status !== "playing") return s;
        if (!s.selected) {
          return { ...s, selected: [r, c] };
        }
        const [sr, sc] = s.selected;
        if (sr === r && sc === c) {
          return { ...s, selected: null };
        }
        if (areAdjacent([sr, sc], [r, c])) {
          const swapped = swap(s, [sr, sc], [r, c]);
          if (swapped) return swapped;
          // Invalid swap (no match) → shift selection to new cell.
          return { ...s, selected: [r, c] };
        }
        return { ...s, selected: [r, c] };
      });
    },
    [],
  );

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    submit.reset();
  }, [submit]);

  const finalScore = calculateScore(state);

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      maxTile: state.maxCombo,
      moves: 30 - state.movesLeft,
      won: state.score > 0,
      grid: {
        seed: state.seed,
        gemsPopped: state.gemsPopped,
        totalMatches: state.totalMatches,
        maxCombo: state.maxCombo,
      },
    });
  }, [finalScore, state, submit]);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex w-full max-w-[480px] justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <Stat label="Score" value={state.score} />
        <Stat label="Moves" value={state.movesLeft} />
        <Stat label="Combo" value={state.maxCombo} />
        <Stat label="Popped" value={state.gemsPopped} />
      </div>

      <Board state={state} onCellClick={handleCellClick} />

      <p className="text-xs text-muted">
        Tap a gem, then tap an adjacent gem to swap. Match 3 or more.
      </p>

      {state.status === "gameOver" && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title="Game over"
          onPlayAgain={handleRestart}
          onSubmit={handleSubmit}
        >
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted">
            <div>
              Base score:{" "}
              <b className="text-fg">{state.score}</b>
            </div>
            <div>
              Max combo:{" "}
              <b className="text-fg">{state.maxCombo}</b>
            </div>
            <div>
              Gems popped:{" "}
              <b className="text-fg">{state.gemsPopped}</b>
            </div>
            <div>
              Matches:{" "}
              <b className="text-fg">{state.totalMatches}</b>
            </div>
          </dl>
        </GameOverSubmit>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      <span className="text-base font-bold text-fg">{value}</span>
    </div>
  );
}
