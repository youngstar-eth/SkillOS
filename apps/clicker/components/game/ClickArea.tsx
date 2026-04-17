"use client";

import { useCallback, useRef, useState } from "react";
import { formatNumber } from "@/lib/game/format";

interface ClickAreaProps {
  disabled: boolean;
  /** Leaves earned per manual click (for the floating "+N" label). */
  leavesPerClick: number;
  onClick: () => void;
}

interface Splash {
  id: number;
  amount: number;
  /** Horizontal drift in px, randomised per splash for a livelier feel. */
  x: number;
}

const MAX_SPLASHES = 12; // bound the DOM so the tree doesn't fog over under spam-click

export function ClickArea({ disabled, leavesPerClick, onClick }: ClickAreaProps) {
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const idRef = useRef(0);

  const handleClick = useCallback(() => {
    if (disabled) return;
    onClick();
    // Emit a floating "+N" label; auto-expire via timeout so memory
    // doesn't grow unboundedly under long idle sessions.
    const id = ++idRef.current;
    const x = Math.round((Math.random() - 0.5) * 60); // -30..30 px
    setSplashes((cur) => {
      const next = [...cur, { id, amount: leavesPerClick, x }];
      return next.length > MAX_SPLASHES ? next.slice(-MAX_SPLASHES) : next;
    });
    window.setTimeout(() => {
      setSplashes((cur) => cur.filter((s) => s.id !== id));
    }, 900);
  }, [disabled, leavesPerClick, onClick]);

  return (
    <div className="relative mx-auto flex items-center justify-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="click-area disabled:cursor-not-allowed disabled:opacity-70"
        aria-label="Shake the tree to collect leaves"
      >
        <span aria-hidden>🌳</span>
      </button>
      {splashes.map((s) => (
        <span
          key={s.id}
          className="float-leaf"
          style={{ "--x": `${s.x}px` } as React.CSSProperties}
        >
          +{formatNumber(s.amount)} 🍃
        </span>
      ))}
    </div>
  );
}
