"use client";

/**
 * Wordle placeholder — game engine not yet implemented.
 *
 * When ready to ship, replace this with the real game. The component
 * contract is identical to Game2048 so the duel/[id] page can swap in
 * with a single import change:
 *
 *   seed:           deterministic bytes32 from the match row
 *   onGameOver(n):  called once with the final score
 *   onScoreChange(n): called on every score update (live opponent feed)
 *   frozen:         external kill-switch (submit in flight)
 */

type Props = {
  seed: string;
  onGameOver: (score: number) => void;
  onScoreChange?: (score: number) => void;
  frozen?: boolean;
};

export function GameWordle(_: Props) {
  return (
    <div className="flex aspect-square w-full max-w-[420px] items-center justify-center rounded-xl border border-border bg-bg-elev text-center">
      <div className="px-6">
        <p className="text-2xl font-semibold">Wordle</p>
        <p className="mt-2 text-sm text-neutral-400">Game engine coming soon.</p>
      </div>
    </div>
  );
}
