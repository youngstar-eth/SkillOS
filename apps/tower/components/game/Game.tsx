"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GameOverSubmit } from "@mas/shared/components";
import { useScoreSubmit } from "@mas/shared/hooks";
import { Board } from "./Board";
import {
  calculateScore,
  createInitialState,
  placeTower,
  startWave,
  tick,
  TOWER_COST,
  WAVES_TOTAL,
} from "@/lib/game/engine";
import type { TowerDefenseState, TowerType } from "@/lib/game/types";

export const TOURNAMENT_ID = 15n;

const TICK_MS = 50;

const TOWER_LABELS: Record<TowerType, string> = {
  arrow: "Arrow",
  cannon: "Cannon",
  magic: "Magic",
};

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<TowerDefenseState>(() =>
    createInitialState(Number(TOURNAMENT_ID) + 1),
  );
  const [selectedType, setSelectedType] = useState<TowerType>("arrow");
  const [startedAt, setStartedAt] = useState(0);
  const submit = useScoreSubmit({ tournamentId: TOURNAMENT_ID });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setStartedAt(Date.now());
  }, []);

  // Tick loop
  useEffect(() => {
    if (state.status !== "playing") return;
    const id = window.setInterval(() => {
      setState((s) => tick(s, TICK_MS));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.status]);

  const handleTile = useCallback(
    (col: number, row: number) => {
      setState((s) => {
        const next = placeTower(s, col, row, selectedType);
        return next ?? s;
      });
    },
    [selectedType],
  );

  const handleStartWave = useCallback(() => {
    setState((s) => startWave(s));
  }, []);

  const handleRestart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setStartedAt(Date.now());
    submit.reset();
  }, [submit]);

  const finalScore = calculateScore(state);

  const handleSubmit = useCallback(() => {
    submit.submit({
      score: finalScore,
      maxTile: state.wave,
      moves: state.towers.length,
      durationMs: Date.now() - startedAt,
      won: state.status === "won",
      grid: {
        seed: state.seed,
        wave: state.wave,
        lives: state.lives,
        towers: state.towers.length,
        tournamentId: Number(TOURNAMENT_ID),
      },
    });
  }, [finalScore, state, startedAt, submit]);

  const canStartWave =
    state.status === "playing" &&
    state.waveEnemiesRemaining === 0 &&
    state.enemies.length === 0 &&
    state.wave < WAVES_TOTAL;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[auto_1fr] gap-4">
        <Board
          state={state}
          selectedType={selectedType}
          onTileClick={handleTile}
        />
        <aside className="flex flex-col gap-3 text-sm">
          <div className="brass-panel rounded-sm px-3 py-2">
            <div className="flex justify-between">
              <span className="uppercase tracking-wider">Wave</span>
              <b>
                {state.wave} / {WAVES_TOTAL}
              </b>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="uppercase tracking-wider">Lives</span>
              <b>{"♥".repeat(Math.min(state.lives, 20))}</b>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="uppercase tracking-wider">Gold</span>
              <b>{state.gold}</b>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="uppercase tracking-wider">Score</span>
              <b>{state.score}</b>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wider text-muted">
              Build
            </p>
            {(Object.keys(TOWER_LABELS) as TowerType[]).map((t) => {
              const cost = TOWER_COST[t];
              const affordable = state.gold >= cost;
              const active = selectedType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedType(t)}
                  disabled={!affordable}
                  className={`rounded-sm border px-3 py-2 text-left text-xs uppercase tracking-widest disabled:opacity-40 ${
                    active
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface"
                  }`}
                >
                  {TOWER_LABELS[t]} · ${cost}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleStartWave}
            disabled={!canStartWave}
            className="rounded-sm bg-accent px-3 py-2 text-xs font-bold uppercase tracking-widest text-bg disabled:opacity-40"
          >
            Start wave
          </button>
        </aside>
      </div>

      {state.status !== "playing" && (
        <GameOverSubmit
          submit={submit.state}
          finalScore={finalScore}
          canSubmit={isConnected && !!address}
          title={state.status === "won" ? "Victory" : "Overrun"}
          onPlayAgain={handleRestart}
          onSubmit={handleSubmit}
        >
          <p className="mt-4 text-sm text-muted">
            Wave {state.wave} · Lives {state.lives} · Final{" "}
            <b className="text-fg">{finalScore}</b>
          </p>
        </GameOverSubmit>
      )}
    </div>
  );
}
