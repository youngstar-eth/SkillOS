"use client";

import type { BubbleState } from "@/lib/game/types";

interface ScoreHUDProps {
  state: BubbleState;
}

export function ScoreHUD({ state }: ScoreHUDProps) {
  return (
    <div className="grid grid-cols-4 items-center gap-3 rounded-xl border-2 border-accent-soft bg-surface px-4 py-3 shadow-[0_4px_16px_rgba(255,100,150,0.12)]">
      <Stat label="Score" value={state.score.toLocaleString()} big />
      <Stat label="Popped" value={state.bubblesPopped.toLocaleString()} />
      <Stat label="Shots" value={state.shotsFired.toLocaleString()} />
      <Stat label="Combo" value={state.maxCombo} accent />
    </div>
  );
}

function Stat({
  label,
  value,
  big,
  accent,
}: {
  label: string;
  value: string | number;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      <span
        className={[
          "font-bold tabular-nums",
          big ? "text-xl" : "text-base",
          accent ? "text-accent" : "text-fg",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
