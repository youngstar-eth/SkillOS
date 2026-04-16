import type { CSSProperties } from "react";

/** Tiles ≥ 128 use dark background → light text; below, light bg → dark text. */
const DARK_TEXT_THRESHOLD = 128;

export function Tile({ value }: { value: number | null }) {
  if (value === null) {
    return <div className="h-full w-full bg-fg/15" aria-hidden />;
  }
  const fgVar =
    value >= DARK_TEXT_THRESHOLD
      ? "var(--tile-text-dark)"
      : "var(--tile-text-light)";

  const style: CSSProperties = {
    backgroundColor: `var(--tile-${value})`,
    color: fgVar,
  };

  // Digit count governs font-size so 1024/2048 don't overflow the cell.
  const size =
    value < 100 ? "text-4xl sm:text-5xl"
    : value < 1000 ? "text-3xl sm:text-4xl"
    : "text-2xl sm:text-3xl";

  return (
    <div
      className={`flex h-full w-full items-center justify-center font-display font-black ${size} select-none transition-all duration-150`}
      style={style}
      aria-label={`tile ${value}`}
    >
      {value}
    </div>
  );
}
