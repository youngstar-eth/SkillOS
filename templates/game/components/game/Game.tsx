"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit, useScoreSubmit } from "@mas/shared";
import {
  addPoints,
  calculateScore,
  createInitialState,
  endGame,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";

/**
 * REPLACE: bump this when you create the tournament on-chain.
 * Use `cast call <arcade-pool> "nextTournamentId()(uint256)"` to confirm.
 */
export const TOURNAMENT_ID = 999n;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<GameState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  // Re-seed on client mount (avoid SSR hydration mismatch if your engine
  // picks something random at init).
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  const handleTap = useCallback(() => {
    setState((s) => addPoints(s, 1));
  }, []);

  const handleEnd = useCallback(() => {
    setState((s) => endGame(s));
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
      grid: { seed: state.seed },
    });
  }, [finalScore, state, submit]);

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-muted">Score: {state.score}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleTap}
          disabled={state.status !== "playing"}
          className="rounded bg-accent px-5 py-3 font-semibold text-bg disabled:opacity-50"
        >
          +1 point
        </button>
        <button
          type="button"
          onClick={handleEnd}
          disabled={state.status !== "playing"}
          className="rounded border border-border px-5 py-3 text-fg disabled:opacity-50"
        >
          End match
        </button>
      </div>

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
