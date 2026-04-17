"use client";

import type { BreakoutState } from "@/lib/game/types";

interface ScoreHUDProps {
  state: BreakoutState;
}

export function ScoreHUD({ state }: ScoreHUDProps) {
  const comboHot = state.combo >= 5;
  return (
    <div className="grid grid-cols-4 items-center gap-3 rounded border border-border bg-surface/80 px-4 py-3 tabular-nums">
      <Stat label="Score" value={state.score.toLocaleString()} accent="cyan" big />
      <Stat label="Level" value={`${state.level}/5`} accent="purple" />
      <div className="flex flex-col">
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted">Lives</span>
        <span className="mt-0.5 flex gap-0.5 text-base">
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={i}
              className={i < state.lives ? "neon-pink" : "text-muted/40"}
              aria-hidden
            >
              ♥
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted">Combo</span>
        <span
          className={`mt-0.5 text-base font-bold ${comboHot ? "neon-yellow" : "text-fg"}`}
        >
          ×{state.combo}
          {comboHot && <span className="ml-1 text-[10px]">HOT</span>}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  big,
}: {
  label: string;
  value: string;
  accent: "cyan" | "purple" | "pink";
  big?: boolean;
}) {
  const cls = accent === "cyan" ? "neon-cyan" : accent === "purple" ? "neon-purple" : "neon-pink";
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
        {label}
      </span>
      <span className={`mt-0.5 ${big ? "text-xl" : "text-base"} font-bold ${cls}`}>
        {value}
      </span>
    </div>
  );
}
