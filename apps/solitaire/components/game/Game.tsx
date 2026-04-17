"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import {
  autoMoveAces,
  calculateScore,
  createInitialState,
  drawFromStock,
  moveCards,
  undo,
} from "@/lib/game/engine";
import type { PileRef, SolitaireState } from "@/lib/game/types";
import { Board } from "./Board";

/**
 * Solitaire tournament ID on Base Sepolia ArcadePool. Bump when deployed.
 */
export const TOURNAMENT_ID = 9n;

type Selection = { pileRef: PileRef; fromIdx: number } | null;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<SolitaireState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const [selection, setSelection] = useState<Selection>(null);
  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  useEffect(() => {
    if (state.status !== "playing") return;
    const id = setInterval(() => {
      setState((s) => ({ ...s, elapsedMs: Date.now() - s.startedAt }));
    }, 1000);
    return () => clearInterval(id);
  }, [state.status]);

  const handleStockClick = useCallback(() => {
    setSelection(null);
    setState((s) => drawFromStock(s));
  }, []);

  const handlePileClick = useCallback(
    (pileRef: PileRef, cardIdx?: number) => {
      setState((s) => {
        if (selection) {
          const sameSource =
            selection.pileRef.type === pileRef.type &&
            selection.pileRef.index === pileRef.index;
          if (sameSource) {
            setSelection(null);
            return s;
          }

          const sourcePile =
            selection.pileRef.type === "tableau"
              ? s.tableau[selection.pileRef.index]
              : selection.pileRef.type === "waste"
                ? s.waste
                : selection.pileRef.type === "foundation"
                  ? s.foundation[selection.pileRef.index]
                  : [];
          const count = sourcePile.length - selection.fromIdx;

          const next = moveCards(s, selection.pileRef, pileRef, count);
          setSelection(null);
          if (next) return next;
          return s;
        }

        if (pileRef.type === "tableau") {
          if (cardIdx === undefined) return s;
          const pile = s.tableau[pileRef.index];
          if (pile.length === 0) return s;
          const card = pile[cardIdx];
          if (!card.faceUp) return s;
          setSelection({ pileRef, fromIdx: cardIdx });
          return s;
        }

        if (pileRef.type === "waste" && s.waste.length > 0) {
          setSelection({ pileRef, fromIdx: s.waste.length - 1 });
          return s;
        }

        if (pileRef.type === "foundation") {
          const pile = s.foundation[pileRef.index];
          if (pile.length === 0) return s;
          setSelection({ pileRef, fromIdx: pile.length - 1 });
          return s;
        }

        return s;
      });
    },
    [selection],
  );

  const handleUndo = useCallback(() => {
    setSelection(null);
    setState((s) => undo(s));
  }, []);

  const handleAuto = useCallback(() => {
    setSelection(null);
    setState((s) => autoMoveAces(s));
  }, []);

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setSelection(null);
    submit.reset();
  }, [submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "u" || e.key === "U") handleUndo();
      else if (e.key === "a" || e.key === "A") handleAuto();
      else if (e.key === " ") {
        e.preventDefault();
        handleStockClick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleAuto, handleStockClick]);

  const finalScore = calculateScore(state);
  const mm = Math.floor(state.elapsedMs / 60000);
  const ss = Math.floor((state.elapsedMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      won: state.status === "won",
      grid: { seed: state.seed, moves: state.moves },
    });
  }, [finalScore, state, submit]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded border border-border bg-surface/60 px-3 py-2 text-sm">
        <div className="flex gap-4">
          <span>
            <span className="text-muted">Score </span>
            <b className="text-accent">{state.score}</b>
          </span>
          <span>
            <span className="text-muted">Moves </span>
            <b>{state.moves}</b>
          </span>
          <span>
            <span className="text-muted">Time </span>
            <b>
              {mm}:{ss}
            </b>
          </span>
        </div>
      </div>

      <Board
        state={state}
        selection={selection}
        onPileClick={handlePileClick}
        onStockClick={handleStockClick}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleUndo}
          disabled={state.history.length === 0 || state.status !== "playing"}
          className="rounded border border-border bg-surface px-3 py-2 text-sm text-fg disabled:opacity-40"
        >
          Undo (U)
        </button>
        <button
          type="button"
          onClick={handleAuto}
          disabled={state.status !== "playing"}
          className="rounded border border-border bg-surface px-3 py-2 text-sm text-fg disabled:opacity-40"
        >
          Auto-Aces (A)
        </button>
        <button
          type="button"
          onClick={handleRestart}
          className="rounded border border-accent bg-accent/10 px-3 py-2 text-sm text-accent"
        >
          New Deal
        </button>
      </div>

      {state.status !== "playing" && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title="You win"
          onPlayAgain={handleRestart}
          onSubmit={handleSubmit}
        >
          <p className="mt-4 text-sm text-muted">
            Final score: <b className="text-fg">{finalScore}</b> in{" "}
            {state.moves} moves, {mm}:{ss}
          </p>
        </GameOverSubmit>
      )}
    </div>
  );
}
