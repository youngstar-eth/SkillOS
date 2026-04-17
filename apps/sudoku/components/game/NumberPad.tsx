"use client";

interface NumberPadProps {
  noteMode: boolean;
  onNumber: (n: number) => void;
  onClear: () => void;
  onToggleNotes: () => void;
  onHint: () => void;
  disabled: boolean;
  remaining: Record<number, number>; // digits 1-9 -> how many unplaced
}

export function NumberPad({
  noteMode,
  onNumber,
  onClear,
  onToggleNotes,
  onHint,
  disabled,
  remaining,
}: NumberPadProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-9 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const left = remaining[n] ?? 0;
          const done = left === 0;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onNumber(n)}
              disabled={disabled || done}
              className="relative flex aspect-square items-center justify-center rounded-lg border border-border bg-bg font-mono text-lg font-semibold text-fg transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-30"
              aria-label={`number ${n}`}
            >
              {n}
              {!done && (
                <span className="absolute bottom-0.5 right-1 font-sans text-[9px] font-medium text-muted">
                  {left}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onToggleNotes}
          disabled={disabled}
          className={`min-h-[40px] rounded-lg border text-sm font-semibold transition-colors ${
            noteMode
              ? "border-accent bg-accent text-white"
              : "border-border bg-bg text-fg hover:border-accent"
          } disabled:opacity-40`}
          aria-pressed={noteMode}
        >
          Notes {noteMode ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="min-h-[40px] rounded-lg border border-border bg-bg text-sm font-semibold text-fg transition-colors hover:border-accent disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onHint}
          disabled={disabled}
          className="min-h-[40px] rounded-lg border border-accent/50 bg-accent/5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
        >
          Hint (−500)
        </button>
      </div>
    </div>
  );
}
