"use client";

interface ScoreDisplayProps {
  score: number;
  best: number;
}

export function ScoreDisplay({ score, best }: ScoreDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <span className="dream-glow text-6xl font-bold text-[rgb(var(--color-accent))]">
        {score}
      </span>
      <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--color-fg))]/70">
        Best: {best}
      </span>
    </div>
  );
}
