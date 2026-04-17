"use client";

import type { PongState } from "@/lib/game/types";

interface ScoreDisplayProps {
  state: PongState;
}

function formatTime(ms: number, totalMs: number): string {
  const remain = Math.max(0, totalMs - ms);
  const sec = Math.ceil(remain / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ScoreDisplay({ state }: ScoreDisplayProps) {
  return (
    <div className="grid grid-cols-3 items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
          You
        </span>
        <span className="score-digit">{state.playerScore}</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="font-mono text-xs tabular-nums text-accent">
          {formatTime(state.elapsedMs, state.durationMs)}
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
          Rally
        </span>
        <span className="neon-pink text-base font-bold tabular-nums">
          ×{state.rallyCount}
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
          AI
        </span>
        <span className="score-digit">{state.aiScore}</span>
      </div>
    </div>
  );
}
