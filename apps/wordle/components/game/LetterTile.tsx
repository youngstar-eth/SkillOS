"use client";

import type { LetterState } from "@/lib/game/types";

interface LetterTileProps {
  letter: string;
  state: LetterState;
  /** Per-tile flip delay so a row reveals left-to-right. */
  delayMs?: number;
  /** Mark submitted so the flip animation runs. */
  submitted?: boolean;
}

const STATE_STYLES: Record<LetterState, string> = {
  // Submitted states — opaque background, white text
  correct: "bg-success text-white border-success",
  present: "bg-warning text-white border-warning",
  absent: "bg-absent text-white border-absent",
  // Not submitted
  empty: "bg-bg text-fg border-border",
  tbd: "bg-bg text-fg border-fg/40",
};

export function LetterTile({
  letter,
  state,
  delayMs = 0,
  submitted = false,
}: LetterTileProps) {
  const cls = STATE_STYLES[state];
  // The flip runs only when a submitted letter reveals its evaluated state.
  // We apply the class + inline animation-delay so rows reveal left-to-right.
  const animClass =
    submitted && state !== "empty" && state !== "tbd" ? "tile-flip" : "";

  return (
    <div
      className={`flex aspect-square w-full select-none items-center justify-center border-2 text-2xl font-bold uppercase ${cls} ${animClass}`}
      style={submitted ? { animationDelay: `${delayMs}ms` } : undefined}
      aria-label={letter ? `${letter} ${state}` : "empty"}
    >
      {letter}
    </div>
  );
}
