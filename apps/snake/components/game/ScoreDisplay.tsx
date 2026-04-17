"use client";

import { tickInterval } from "@/lib/game/engine";

interface ScoreDisplayProps {
  score: number;
  ateCount: number;
  snakeLength: number;
  paused: boolean;
}

export function ScoreDisplay({
  score,
  ateCount,
  snakeLength,
  paused,
}: ScoreDisplayProps) {
  const speedMs = tickInterval(ateCount);
  // Normalise speed to a friendly 1.0× (200ms) → 2.5× (80ms) multiplier.
  const speedX = (200 / speedMs).toFixed(2);

  return (
    <div className="grid grid-cols-4 gap-2 border border-accent/40 bg-black/30 p-3">
      <Stat label="Score" value={score} highlight />
      <Stat label="Eaten" value={ateCount} />
      <Stat label="Length" value={snakeLength} />
      <Stat label="Speed" value={`${speedX}×`} dim={paused} />
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  dim,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div className={`flex flex-col ${dim ? "opacity-50" : ""}`}>
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      <span
        className={`text-2xl leading-none ${highlight ? "neon-teal" : "text-fg"}`}
      >
        {value}
      </span>
    </div>
  );
}
