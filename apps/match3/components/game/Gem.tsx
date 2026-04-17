"use client";

import type { GemColor } from "@/lib/game/types";

interface GemProps {
  color: GemColor | null;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** Maps semantic gem colors → the `--gem-*` CSS variable consumed by `.gem`. */
const COLOR_VAR: Record<GemColor, string> = {
  red: "var(--color-gem-red)",
  yellow: "var(--color-gem-yellow)",
  green: "var(--color-gem-green)",
  blue: "var(--color-gem-blue)",
  purple: "var(--color-gem-purple)",
  pink: "var(--color-gem-pink)",
};

export function Gem({ color, isSelected, onClick, disabled }: GemProps) {
  if (!color) {
    return <div className="aspect-square w-full" aria-hidden />;
  }
  const style = { ["--gem-color" as string]: COLOR_VAR[color] } as React.CSSProperties;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`gem aspect-square w-full ${isSelected ? "selected" : ""}`}
      style={style}
      aria-label={`${color} gem${isSelected ? " (selected)" : ""}`}
    />
  );
}
