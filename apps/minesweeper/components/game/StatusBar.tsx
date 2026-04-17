"use client";

import type { GameStatus } from "@/lib/game/types";

interface StatusBarProps {
  minesLeft: number;
  elapsedSec: number;
  status: GameStatus;
  onRestart: () => void;
}

const FACE: Record<GameStatus, string> = {
  ready: "🙂",
  playing: "🙂",
  won: "😎",
  lost: "💀",
};

/** Pad a count to three digits with leading zeros — classic LCD look. */
function pad3(n: number): string {
  const clamped = Math.max(-99, Math.min(999, n));
  if (clamped < 0) return `-${String(-clamped).padStart(2, "0")}`;
  return String(clamped).padStart(3, "0");
}

export function StatusBar({
  minesLeft,
  elapsedSec,
  status,
  onRestart,
}: StatusBarProps) {
  return (
    <div className="win-inset flex items-center justify-between px-2 py-2">
      <div className="win-lcd" aria-label="Mines remaining">
        {pad3(minesLeft)}
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="win-raised active:win-pressed flex h-8 w-8 items-center justify-center text-lg leading-none"
        aria-label="Restart"
        title="Restart"
      >
        {FACE[status]}
      </button>

      <div className="win-lcd" aria-label="Elapsed seconds">
        {pad3(elapsedSec)}
      </div>
    </div>
  );
}
