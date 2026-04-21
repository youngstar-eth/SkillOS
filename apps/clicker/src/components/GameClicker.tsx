"use client";

/**
 * Clicker duel game component.
 *
 * Props contract matches Game2048 / GameWordle / GameSudoku / GameMinesweeper
 * so duel/[id] swaps in with a single import change:
 *   seed:           bytes32 hex — only used to pick a cosmetic tap emoji
 *                   (both duelists see the same one). No gameplay impact.
 *   onGameOver:     NEVER fires here. Clicker has no natural end state —
 *                   players keep tapping until the 2-minute timer expires,
 *                   at which point duel/[id]'s handleTimerExpire submits
 *                   the accumulated liveScore.
 *   onScoreChange:  emitted on every tap. duel/[id]'s ScoreCard shows
 *                   "your clicks" in real time — rakibe sızma yok.
 *   frozen:         external kill-switch (disable button).
 *
 * Scoring: raw tap count. Range 0 → 49_999 (hard ceiling before submit in
 * duel/[id]). No upgrades, no passive producers, no combo multipliers.
 * Fastest fingers wins. V1 is trust-client; anti-bot is a V2 concern.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickEmojiFromSeed } from "@/lib/clicker/engine";

type Props = {
  seed: string;
  onGameOver: (score: number) => void;
  onScoreChange?: (score: number) => void;
  frozen?: boolean;
};

export function GameClicker({
  seed,
  onGameOver: _onGameOver,
  onScoreChange,
  frozen,
}: Props) {
  const [score, setScore] = useState(0);
  const [bump, setBump] = useState(0); // forces the pop-animation key

  const emoji = useMemo(() => pickEmojiFromSeed(seed), [seed]);

  // Reset on seed change (new match in the dev harness, etc.).
  useEffect(() => {
    setScore(0);
    setBump(0);
  }, [seed]);

  // Emit live score to the parent ScoreCard.
  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  const handleTap = useCallback(() => {
    if (frozen) return;
    setScore((s) => s + 1);
    setBump((b) => b + 1);
    // Opt-in haptic — most desktops no-op this silently.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.(5);
      } catch {
        /* ignore — some Safari versions throw when vibrate is unavailable */
      }
    }
  }, [frozen]);

  // Spacebar + Enter are secondary inputs (desktop); not essential but
  // nice for power users and accessibility.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return; // autorepeat would be bot-like
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleTap]);

  // Clicks-per-second rolling counter — purely visual feedback.
  const cpsRef = useRef<number[]>([]);
  useEffect(() => {
    if (bump === 0) return;
    const now = Date.now();
    cpsRef.current.push(now);
    cpsRef.current = cpsRef.current.filter((t) => now - t <= 1000);
  }, [bump]);
  const cps = cpsRef.current.length;

  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-4">
      {/* Huge score display */}
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">
          Taps
        </p>
        <p
          key={bump}
          className="clicker-score mt-1 font-mono text-6xl font-bold tabular-nums text-skill"
        >
          {score}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {cps} / sec
        </p>
      </div>

      {/* The tap button — large target, high contrast */}
      <button
        type="button"
        onClick={handleTap}
        disabled={frozen}
        aria-label="Tap to score"
        className={
          "clicker-button relative flex h-48 w-full items-center justify-center rounded-3xl text-7xl transition-transform active:scale-[0.97] disabled:opacity-40 " +
          "border-2 border-skill bg-skill/10 hover:bg-skill/15 select-none"
        }
        style={{ touchAction: "manipulation" }}
      >
        <span
          key={bump}
          className="clicker-emoji pointer-events-none"
          aria-hidden
        >
          {emoji}
        </span>
      </button>

      <p className="text-center text-xs text-neutral-500">
        Tap, click, space, or enter — every press counts.
        <br />
        Fastest tapper in 2 minutes wins the pool.
      </p>
    </div>
  );
}
