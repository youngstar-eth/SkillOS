"use client";

import type { LetterState } from "@/lib/game/types";

const ROW_1 = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
const ROW_2 = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const ROW_3 = ["Enter", "z", "x", "c", "v", "b", "n", "m", "Backspace"];

const KEY_STYLES: Record<LetterState, string> = {
  correct: "bg-success text-white",
  present: "bg-warning text-white",
  absent: "bg-absent text-white",
  empty: "bg-surface text-fg hover:bg-border",
  tbd: "bg-surface text-fg hover:bg-border",
};

export interface KeyboardProps {
  states: Record<string, LetterState>;
  disabled: boolean;
  onPress: (key: string) => void;
}

export function Keyboard({ states, disabled, onPress }: KeyboardProps) {
  const renderKey = (key: string) => {
    const isAction = key === "Enter" || key === "Backspace";
    const state = states[key.toLowerCase()] ?? "empty";
    const style = isAction ? "bg-surface text-fg hover:bg-border" : KEY_STYLES[state];
    const label = key === "Backspace" ? "⌫" : key === "Enter" ? "Enter" : key.toUpperCase();

    return (
      <button
        key={key}
        type="button"
        onClick={() => onPress(key)}
        disabled={disabled}
        className={`flex h-14 min-w-[32px] flex-1 select-none items-center justify-center rounded-sm text-sm font-semibold uppercase tracking-tight transition-colors disabled:opacity-50 ${style} ${isAction ? "flex-[1.5] text-xs" : ""}`}
        data-key={key}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-[6px]">
      <div className="flex gap-[4px]">{ROW_1.map(renderKey)}</div>
      <div className="flex gap-[4px] px-[5%]">{ROW_2.map(renderKey)}</div>
      <div className="flex gap-[4px]">{ROW_3.map(renderKey)}</div>
    </div>
  );
}
