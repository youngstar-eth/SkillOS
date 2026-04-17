"use client";

import { formatNumber, formatRate } from "@/lib/game/format";
import type { ClickerState } from "@/lib/game/types";

interface LeafCounterProps {
  state: ClickerState;
}

function formatTime(ms: number, totalMs: number): string {
  const remain = Math.max(0, totalMs - ms);
  const sec = Math.ceil(remain / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LeafCounter({ state }: LeafCounterProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-baseline gap-2">
        <span className="display text-h1 text-leaf tabular">
          {formatNumber(state.leaves)}
        </span>
        <span className="text-sm text-muted">leaves</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted">
        <span>
          +<span className="font-semibold text-accent-deep">{formatRate(state.leavesPerSecond)}</span>
        </span>
        <span className="text-bark/60">·</span>
        <span>
          +{formatNumber(state.leavesPerClick)}/click
        </span>
        <span className="text-bark/60">·</span>
        <span className="tabular">
          ⏱ {formatTime(state.elapsedMs, state.durationMs)}
        </span>
      </div>
    </div>
  );
}
